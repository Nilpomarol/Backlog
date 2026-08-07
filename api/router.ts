import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getClient, getDb, type DatabaseEnvironment } from "../db";
import { users } from "../db/schema";
import { verifyFirebaseToken } from "../lib/firebase-token";
import { canChangeWorkflow, canDeleteItem, canEditItem, canManageSubtasks, canReadItem, canVote, type Visibility } from "../lib/permissions";
import { checkRateLimit } from "../lib/rate-limit";

type AppUser = { id: string; email: string; name: string; avatarUrl: string | null; role: "admin" | "user" };
type ItemRecord = { id: string; creatorId: string; visibility: Visibility; status: string };

export type ApiEnvironment = DatabaseEnvironment & {
  FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
};

type Variables = { user: AppUser; requestId: string };
export const api = new Hono<{ Bindings: ApiEnvironment; Variables: Variables }>().basePath("/api");

const itemType = z.enum(["bug", "feature", "improvement", "task"]);
const itemStatus = z.enum(["backlog", "in_progress", "in_review", "done", "discarded"]);
const itemVisibility = z.enum(["shared", "internal"]);
const createItemSchema = z.object({
  appId: z.string().min(1).max(80),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional().default(""),
  type: itemType,
  visibility: itemVisibility.optional().default("shared"),
});
const updateItemSchema = z.object({
  appId: z.string().min(1).max(80).optional(),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  type: itemType.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied.");
const subtaskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  completed: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied.");
const subtaskOrderSchema = z.object({ ids: z.array(z.string().min(1)).max(100) }).strict().refine((value) => new Set(value.ids).size === value.ids.length, "Subtask identifiers must be unique.");
const avatarUrl = z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "Profile images must use HTTPS.").nullable();
const appFields = {
  name: z.string().trim().min(2).max(80),
  // An app's visual identity is an optional logo image; with none, the UI shows its first letter.
  logoUrl: z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "App logos must use HTTPS.").nullable().optional(),
  description: z.string().trim().max(500),
};
const createAppSchema = z.object(appFields).strict();
const updateAppSchema = z.object({
  name: appFields.name.optional(),
  logoUrl: appFields.logoUrl,
  description: appFields.description.optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied.");

api.onError((error, context) => {
  console.error("API request failed", { requestId: context.get("requestId"), path: context.req.path, message: error.message });
  return context.json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
});

api.use("*", async (context, next) => {
  const suppliedRequestId = context.req.header("x-request-id")?.trim();
  const requestId = suppliedRequestId && /^[a-zA-Z0-9_-]{8,80}$/.test(suppliedRequestId) ? suppliedRequestId : crypto.randomUUID();
  context.set("requestId", requestId);
  const method = context.req.method.toUpperCase();
  if (["POST", "PUT", "PATCH"].includes(method)) {
    const contentLength = Number(context.req.header("content-length") || 0);
    if (contentLength > 32_768) return context.json({ error: { code: "payload_too_large", message: "The request is too large." } }, 413, { "x-request-id": requestId });
    if (!contentLength) {
      const bytes = await context.req.raw.clone().arrayBuffer();
      if (bytes.byteLength > 32_768) return context.json({ error: { code: "payload_too_large", message: "The request is too large." } }, 413, { "x-request-id": requestId });
    }
  }
  await next();
  context.header("x-request-id", requestId);
});

api.get("/health", (context) => context.json({ status: "ok", service: "backlog-api" }));

api.use("/*", async (context, next) => {
  const projectId = context.env.FIREBASE_PROJECT_ID ?? context.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return context.json({ error: { code: "service_unavailable", message: "Authentication is not configured." } }, 503);
  if (!context.env.TURSO_DATABASE_URL || !context.env.TURSO_AUTH_TOKEN) return context.json({ error: { code: "service_unavailable", message: "The database is not configured." } }, 503);

  const authorization = context.req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return context.json({ error: { code: "unauthorized", message: "Sign in to continue." } }, 401);

  let identity;
  try {
    identity = await verifyFirebaseToken(authorization.slice(7), projectId);
  } catch {
    return context.json({ error: { code: "unauthorized", message: "Your session is invalid or expired." } }, 401);
  }

  const db = getDb(context.env);
  const [invitedUser] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  if (!invitedUser || !invitedUser.isActive || (invitedUser.firebaseUid && invitedUser.firebaseUid !== identity.uid)) {
    return context.json({ error: { code: "access_denied", message: "This account has not been invited." } }, 403);
  }
  if (!invitedUser.firebaseUid || (!invitedUser.avatarUrl && identity.picture)) {
    await db.update(users).set({
      firebaseUid: invitedUser.firebaseUid ?? identity.uid,
      avatarUrl: invitedUser.avatarUrl ?? identity.picture ?? null,
      updatedAt: Date.now(),
    }).where(eq(users.id, invitedUser.id));
  }

  const applicationUser = { id: invitedUser.id, email: invitedUser.email, name: invitedUser.name, avatarUrl: invitedUser.avatarUrl ?? identity.picture ?? null, role: invitedUser.role };
  context.set("user", applicationUser);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(context.req.method.toUpperCase())) {
    const limit = checkRateLimit(applicationUser.id, { limit: 40, windowMs: 60_000 });
    context.header("x-ratelimit-remaining", String(limit.remaining));
    if (!limit.allowed) {
      context.header("retry-after", String(limit.retryAfterSeconds));
      return context.json({ error: { code: "rate_limited", message: "Too many changes. Please wait a moment and try again." } }, 429);
    }
  }
  await next();
});

api.get("/me", (context) => context.json({ data: context.get("user") }));

api.patch("/me", async (context) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    avatarUrl: avatarUrl.optional(),
  }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const db = getDb(context.env);
  await db.update(users).set({ name: parsed.data.name, avatarUrl: parsed.data.avatarUrl ?? null, updatedAt: Date.now() }).where(eq(users.id, currentUser.id));
  return context.json({ data: { ...currentUser, name: parsed.data.name, avatarUrl: parsed.data.avatarUrl ?? null } });
});

api.get("/users", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can manage users." } }, 403);
  const client = getClient(context.env);
  const result = await client.execute("SELECT id, email, name, avatar_url AS avatarUrl, role, CASE WHEN is_active = 0 THEN 'revoked' WHEN firebase_uid IS NULL THEN 'pending' ELSE 'linked' END AS status FROM users ORDER BY is_active DESC, role, name");
  return context.json({ data: result.rows });
});

api.post("/users/invitations", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can invite users." } }, 403);
  const parsed = z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    name: z.string().trim().min(2).max(80),
    role: z.enum(["admin", "user"]).default("user"),
  }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const client = getClient(context.env);
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO users (id, email, name, role, is_active, updated_at) VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, is_active = 1, updated_at = excluded.updated_at`,
    args: [id, parsed.data.email, parsed.data.name, parsed.data.role, Date.now()],
  });
  return context.json({ data: { id, ...parsed.data } }, 201);
});

api.patch("/users/:id/role", async (context) => {
  const currentUser = context.get("user");
  if (currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can change roles." } }, 403);
  const parsed = z.object({ role: z.enum(["admin", "user"]) }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  if (context.req.param("id") === currentUser.id && parsed.data.role !== "admin") return context.json({ error: { code: "invalid_request", message: "You cannot remove your own administrator role." } }, 400);
  const client = getClient(context.env);
  const result = await client.execute({ sql: "UPDATE users SET role = ?, updated_at = ? WHERE id = ?", args: [parsed.data.role, Date.now(), context.req.param("id")] });
  if (result.rowsAffected === 0) return context.json({ error: { code: "not_found", message: "User not found." } }, 404);
  return context.json({ data: { id: context.req.param("id"), role: parsed.data.role } });
});

api.patch("/users/:id/access", async (context) => {
  const currentUser = context.get("user");
  if (currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can change access." } }, 403);
  const parsed = z.object({ active: z.boolean() }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  if (context.req.param("id") === currentUser.id && !parsed.data.active) return context.json({ error: { code: "invalid_request", message: "You cannot revoke your own access." } }, 400);
  const client = getClient(context.env);
  const result = await client.execute({ sql: "UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?", args: [parsed.data.active ? 1 : 0, Date.now(), context.req.param("id")] });
  if (result.rowsAffected === 0) return context.json({ error: { code: "not_found", message: "User not found." } }, 404);
  return context.json({ data: { id: context.req.param("id"), active: parsed.data.active } });
});

api.delete("/users/:id/invitation", async (context) => {
  const currentUser = context.get("user");
  if (currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can remove invitations." } }, 403);
  if (context.req.param("id") === currentUser.id) return context.json({ error: { code: "invalid_request", message: "You cannot remove your own account." } }, 400);
  const client = getClient(context.env);
  const result = await client.execute({ sql: "DELETE FROM users WHERE id = ? AND firebase_uid IS NULL", args: [context.req.param("id")] });
  if (result.rowsAffected === 0) return context.json({ error: { code: "conflict", message: "Only pending invitations can be removed." } }, 409);
  return context.body(null, 204);
});

api.get("/apps", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const result = await client.execute({
    sql: `SELECT a.id, a.name, a.logo_url AS logoUrl, a.description, a.sort_order AS sortOrder,
            COUNT(CASE WHEN b.status IN ('backlog','in_progress','in_review')
              AND (b.visibility = 'shared' OR ? = 'admin') THEN 1 END) AS activeItemCount
          FROM apps a LEFT JOIN backlog_items b ON b.app_id = a.id
          WHERE a.is_active = 1 GROUP BY a.id ORDER BY a.sort_order, a.name`,
    args: [currentUser.role],
  });
  return context.json({ data: result.rows });
});

api.get("/apps/manage", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can manage applications." } }, 403);
  const client = getClient(context.env);
  const result = await client.execute(`SELECT a.id, a.name, a.logo_url AS logoUrl, a.description, a.sort_order AS sortOrder,
      a.is_active AS isActive, COUNT(b.id) AS itemCount
    FROM apps a LEFT JOIN backlog_items b ON b.app_id = a.id
    GROUP BY a.id ORDER BY a.sort_order, a.name`);
  return context.json({ data: result.rows });
});

api.post("/apps", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can create applications." } }, 403);
  const parsed = createAppSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const client = getClient(context.env);
  const position = await client.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextPosition FROM apps");
  const id = crypto.randomUUID();
  await client.execute({
    sql: "INSERT INTO apps (id, name, logo_url, description, sort_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    args: [id, parsed.data.name, parsed.data.logoUrl ?? null, parsed.data.description || null, Number(position.rows[0]?.nextPosition ?? 0), Date.now()],
  });
  return context.json({ data: { id, ...parsed.data, logoUrl: parsed.data.logoUrl ?? null, isActive: true, activeItemCount: 0 } }, 201);
});

api.patch("/apps/:id", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can edit applications." } }, 403);
  const parsed = updateAppSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const client = getClient(context.env);
  if (parsed.data.isActive === false) {
    const active = await client.execute({ sql: "SELECT COUNT(*) AS count FROM apps WHERE is_active = 1 AND id <> ?", args: [context.req.param("id")] });
    if (Number(active.rows[0]?.count ?? 0) === 0) return context.json({ error: { code: "invalid_request", message: "At least one application must remain active." } }, 400);
  }
  const columns: [string, string | number | null][] = [];
  if (parsed.data.name !== undefined) columns.push(["name", parsed.data.name]);
  if (parsed.data.logoUrl !== undefined) columns.push(["logo_url", parsed.data.logoUrl]);
  if (parsed.data.description !== undefined) columns.push(["description", parsed.data.description || null]);
  if (parsed.data.sortOrder !== undefined) columns.push(["sort_order", parsed.data.sortOrder]);
  if (parsed.data.isActive !== undefined) columns.push(["is_active", parsed.data.isActive ? 1 : 0]);
  const result = await client.execute({
    sql: `UPDATE apps SET ${columns.map(([name]) => `${name} = ?`).join(", ")} WHERE id = ?`,
    args: [...columns.map(([, value]) => value), context.req.param("id")],
  });
  if (result.rowsAffected === 0) return context.json({ error: { code: "not_found", message: "Application not found." } }, 404);
  return context.json({ data: { id: context.req.param("id"), ...parsed.data } });
});

api.delete("/apps/:id", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can delete applications." } }, 403);
  const client = getClient(context.env);
  const id = context.req.param("id");
  const [row] = (await client.execute({
    sql: `SELECT a.is_active AS isActive, COUNT(b.id) AS itemCount FROM apps a
          LEFT JOIN backlog_items b ON b.app_id = a.id WHERE a.id = ? GROUP BY a.id`,
    args: [id],
  })).rows;
  if (!row) return context.json({ error: { code: "not_found", message: "Application not found." } }, 404);
  if (Number(row.itemCount) > 0) {
    return context.json({ error: { code: "invalid_request", message: "Only apps with no requests can be deleted. Archive it instead." } }, 400);
  }
  if (row.isActive) {
    const active = await client.execute({ sql: "SELECT COUNT(*) AS count FROM apps WHERE is_active = 1 AND id <> ?", args: [id] });
    if (Number(active.rows[0]?.count ?? 0) === 0) return context.json({ error: { code: "invalid_request", message: "At least one application must remain active." } }, 400);
  }
  const result = await client.execute({ sql: "DELETE FROM apps WHERE id = ?", args: [id] });
  if (result.rowsAffected === 0) return context.json({ error: { code: "not_found", message: "Application not found." } }, 404);
  return context.body(null, 204);
});

api.get("/apps/:appId/items", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const result = await client.execute({
    sql: `SELECT b.id, b.app_id AS appId, b.creator_id AS creatorId, b.title, b.description,
            b.type, b.status, b.visibility, b.created_at AS createdAt, b.updated_at AS updatedAt,
            u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(DISTINCT v.user_id) AS votes,
            MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted,
            COUNT(DISTINCT s.id) AS subtaskCount,
            COUNT(DISTINCT CASE WHEN s.completed = 1 THEN s.id END) AS completedSubtasks
          FROM backlog_items b
          JOIN users u ON u.id = b.creator_id
          LEFT JOIN votes v ON v.item_id = b.id
          LEFT JOIN subtasks s ON s.item_id = b.id
          WHERE b.app_id = ? AND (b.visibility = 'shared' OR ? = 'admin')
          GROUP BY b.id ORDER BY b.updated_at DESC`,
    args: [currentUser.id, context.req.param("appId"), currentUser.role],
  });
  return context.json({ data: result.rows });
});

api.get("/apps/:appId/items/similar", async (context) => {
  const title = normalizeTitle(context.req.query("title") ?? "");
  if (title.length < 3) return context.json({ data: [] });
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const result = await client.execute({
    sql: `SELECT b.id, b.title, b.type, COUNT(v.user_id) AS votes
          FROM backlog_items b LEFT JOIN votes v ON v.item_id = b.id
          WHERE b.app_id = ? AND b.status != 'discarded' AND (b.visibility = 'shared' OR ? = 'admin')
          GROUP BY b.id ORDER BY b.updated_at DESC LIMIT 100`,
    args: [context.req.param("appId"), currentUser.role],
  });
  const candidates = result.rows.map((row) => ({ id: String(row.id), title: String(row.title), type: String(row.type), votes: Number(row.votes), score: similarity(title, normalizeTitle(String(row.title))) }))
    .filter((item) => item.score >= 0.24).sort((a, b) => b.score - a.score || b.votes - a.votes).slice(0, 4);
  return context.json({ data: candidates });
});

/**
 * Permitted requests across every active application. Backs the cross-app views (overview,
 * triage inbox, "my requests") which would otherwise need one call per application.
 */
api.get("/items", async (context) => {
  const currentUser = context.get("user");
  const statusFilter = context.req.query("status");
  const statuses = statusFilter ? statusFilter.split(",").filter((value) => itemStatus.safeParse(value).success) : [];
  if (statusFilter && statuses.length === 0) return context.json({ error: { code: "invalid_request", message: "Unknown status filter." } }, 400);

  const client = getClient(context.env);
  const result = await client.execute({
    sql: `SELECT b.id, b.app_id AS appId, b.creator_id AS creatorId, b.title, b.description,
            b.type, b.status, b.visibility, b.created_at AS createdAt, b.updated_at AS updatedAt,
            a.name AS appName, a.logo_url AS appLogoUrl,
            u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(DISTINCT v.user_id) AS votes,
            MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted,
            COUNT(DISTINCT s.id) AS subtaskCount,
            COUNT(DISTINCT CASE WHEN s.completed = 1 THEN s.id END) AS completedSubtasks
          FROM backlog_items b
          JOIN apps a ON a.id = b.app_id AND a.is_active = 1
          JOIN users u ON u.id = b.creator_id
          LEFT JOIN votes v ON v.item_id = b.id
          LEFT JOIN subtasks s ON s.item_id = b.id
          WHERE (b.visibility = 'shared' OR ? = 'admin')
            ${statuses.length ? `AND b.status IN (${statuses.map(() => "?").join(", ")})` : ""}
          GROUP BY b.id ORDER BY b.updated_at DESC`,
    args: [currentUser.id, currentUser.role, ...statuses],
  });
  return context.json({ data: result.rows });
});

api.get("/items/:id", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item)) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  const detail = await client.execute({
    sql: `SELECT b.id, b.app_id AS appId, b.creator_id AS creatorId, b.title, b.description, b.type, b.status, b.visibility,
            b.created_at AS createdAt, b.updated_at AS updatedAt, u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(v.user_id) AS votes, MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted
          FROM backlog_items b JOIN users u ON u.id = b.creator_id LEFT JOIN votes v ON v.item_id = b.id
          WHERE b.id = ? GROUP BY b.id`,
    args: [currentUser.id, item.id],
  });
  const subtasks = await client.execute({
    sql: "SELECT id, title, completed, position FROM subtasks WHERE item_id = ? ORDER BY position, created_at",
    args: [item.id],
  });
  return context.json({ data: { ...detail.rows[0], subtasks: subtasks.rows } });
});

api.post("/items", async (context) => {
  const parsed = createItemSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (parsed.data.visibility === "internal" && currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can create internal requests." } }, 403);

  const client = getClient(context.env);
  const id = crypto.randomUUID();
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO backlog_items (id, app_id, creator_id, title, description, type, status, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?)`,
    args: [id, parsed.data.appId, currentUser.id, parsed.data.title, parsed.data.description || null, parsed.data.type, parsed.data.visibility, now, now],
  });
  return context.json({ data: { id } }, 201);
});

api.patch("/items/:id", async (context) => {
  const parsed = updateItemSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item)) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canEditItem(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot edit this request." } }, 403);
  if (parsed.data.appId !== undefined) {
    const target = await client.execute({ sql: "SELECT id FROM apps WHERE id = ? AND is_active = 1", args: [parsed.data.appId] });
    if (target.rows.length === 0) return context.json({ error: { code: "invalid_request", message: "That application does not exist." } }, 400);
  }
  const columns: Record<string, string | number | null | undefined> = { ...parsed.data, updatedAt: Date.now() };
  const names: Record<string, string> = { appId: "app_id", title: "title", description: "description", type: "type", updatedAt: "updated_at" };
  const entries = Object.entries(columns);
  await client.execute({ sql: `UPDATE backlog_items SET ${entries.map(([key]) => `${names[key]} = ?`).join(", ")} WHERE id = ?`, args: [...entries.map(([, value]) => value ?? null), item.id] });
  return context.json({ data: { id: item.id } });
});

api.patch("/items/:id/status", async (context) => {
  const parsed = z.object({ status: itemStatus }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (!canChangeWorkflow(currentUser)) return context.json({ error: { code: "forbidden", message: "Only administrators can move requests." } }, 403);
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  await client.execute({ sql: "UPDATE backlog_items SET status = ?, updated_at = ? WHERE id = ?", args: [parsed.data.status, Date.now(), item.id] });
  return context.json({ data: { id: item.id, status: parsed.data.status } });
});

api.patch("/items/:id/visibility", async (context) => {
  const parsed = z.object({ visibility: itemVisibility }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can change visibility." } }, 403);
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  await client.execute({ sql: "UPDATE backlog_items SET visibility = ?, updated_at = ? WHERE id = ?", args: [parsed.data.visibility, Date.now(), item.id] });
  return context.json({ data: { id: item.id, visibility: parsed.data.visibility } });
});

api.delete("/items/:id", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item)) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canDeleteItem(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot delete this request." } }, 403);
  await client.execute({ sql: "DELETE FROM backlog_items WHERE id = ?", args: [item.id] });
  return context.body(null, 204);
});

api.post("/items/:id/vote", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item)) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canVote(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot vote for this request." } }, 403);
  await client.execute({ sql: "INSERT INTO votes (item_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", args: [item.id, currentUser.id, Date.now()] });
  return context.json({ data: { voted: true } });
});

api.delete("/items/:id/vote", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  await client.execute({ sql: "DELETE FROM votes WHERE item_id = ? AND user_id = ?", args: [context.req.param("id"), currentUser.id] });
  return context.body(null, 204);
});

api.post("/items/:id/subtasks", async (context) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(160) }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item)) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canManageSubtasks(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot manage subtasks for this request." } }, 403);
  const positionResult = await client.execute({ sql: "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subtasks WHERE item_id = ?", args: [item.id] });
  const id = crypto.randomUUID();
  const now = Date.now();
  await client.execute({ sql: "INSERT INTO subtasks (id, item_id, title, completed, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)", args: [id, item.id, parsed.data.title, Number(positionResult.rows[0]?.position ?? 0), now, now] });
  return context.json({ data: { id } }, 201);
});

api.patch("/subtasks/:id", async (context) => {
  const parsed = subtaskUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const record = await findSubtask(client, context.req.param("id"));
  if (!record || !canReadItem(currentUser, record.item)) return context.json({ error: { code: "not_found", message: "Subtask not found." } }, 404);
  if (!canManageSubtasks(currentUser, record.item)) return context.json({ error: { code: "forbidden", message: "You cannot manage this subtask." } }, 403);
  const updates: [string, string | number][] = [];
  if (parsed.data.title !== undefined) updates.push(["title", parsed.data.title]);
  if (parsed.data.completed !== undefined) updates.push(["completed", parsed.data.completed ? 1 : 0]);
  updates.push(["updated_at", Date.now()]);
  await client.execute({ sql: `UPDATE subtasks SET ${updates.map(([name]) => `${name} = ?`).join(", ")} WHERE id = ?`, args: [...updates.map(([, value]) => value), record.id] });
  return context.json({ data: { id: record.id } });
});

api.delete("/subtasks/:id", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const record = await findSubtask(client, context.req.param("id"));
  if (!record || !canReadItem(currentUser, record.item)) return context.json({ error: { code: "not_found", message: "Subtask not found." } }, 404);
  if (!canManageSubtasks(currentUser, record.item)) return context.json({ error: { code: "forbidden", message: "You cannot manage this subtask." } }, 403);
  await client.execute({ sql: "DELETE FROM subtasks WHERE id = ?", args: [record.id] });
  return context.body(null, 204);
});

api.put("/items/:id/subtasks/order", async (context) => {
  const parsed = subtaskOrderSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item)) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canManageSubtasks(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot reorder these subtasks." } }, 403);
  const existing = await client.execute({ sql: "SELECT id FROM subtasks WHERE item_id = ? ORDER BY position", args: [item.id] });
  const existingIds = existing.rows.map((row) => String(row.id)).sort();
  if (existingIds.join("\0") !== [...parsed.data.ids].sort().join("\0")) return context.json({ error: { code: "invalid_request", message: "The order must contain every subtask exactly once." } }, 400);
  const now = Date.now();
  await client.batch(parsed.data.ids.map((id, position) => ({ sql: "UPDATE subtasks SET position = ?, updated_at = ? WHERE id = ? AND item_id = ?", args: [position, now, id, item.id] })), "write");
  return context.json({ data: { ids: parsed.data.ids } });
});

async function findItem(client: ReturnType<typeof getClient>, id: string): Promise<ItemRecord | null> {
  const result = await client.execute({ sql: "SELECT id, creator_id, visibility, status FROM backlog_items WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), creatorId: String(row.creator_id), visibility: String(row.visibility) as Visibility, status: String(row.status) };
}

async function findSubtask(client: ReturnType<typeof getClient>, id: string) {
  const result = await client.execute({
    sql: `SELECT s.id, b.id AS item_id, b.creator_id, b.visibility, b.status
          FROM subtasks s JOIN backlog_items b ON b.id = s.item_id WHERE s.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), item: { id: String(row.item_id), creatorId: String(row.creator_id), visibility: String(row.visibility) as Visibility, status: String(row.status) } satisfies ItemRecord };
}

export function normalizeTitle(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.25;
  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / Math.max(leftWords.size, rightWords.size);
}
