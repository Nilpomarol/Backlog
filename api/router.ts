import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getClient, getDb, type DatabaseEnvironment } from "../db";
import { users } from "../db/schema";
import { verifyFirebaseToken } from "../lib/firebase-token";
import { canChangeWorkflow, canDeleteItem, canEditItem, canManageSubtasks, canReadItem, canVote, type Visibility } from "../lib/permissions";
import { checkRateLimit } from "../lib/rate-limit";

type AppUser = { id: string; email: string; name: string; avatarUrl: string | null; role: "admin" | "user" };
type ItemRecord = { id: string; appId: string; creatorId: string; visibility: Visibility; status: string; parentId: string | null; updatedAt: number };

export type ApiEnvironment = DatabaseEnvironment & {
  FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
};

type Variables = { user: AppUser; requestId: string };
export const api = new Hono<{ Bindings: ApiEnvironment; Variables: Variables }>().basePath("/api");

const itemType = z.enum(["bug", "feature", "improvement", "task", "investigation"]);
const itemStatus = z.enum(["backlog", "in_progress", "in_review", "done", "discarded"]);
const itemPriority = z.enum(["urgent", "high", "medium", "low", "none"]);
const itemEffort = z.enum(["small", "medium", "large", "unknown"]);
const itemVisibility = z.enum(["shared", "internal"]);
// Lets a client that generated its own id offline (for an instant optimistic insert) hand it
// straight to the server instead of getting a different one back — same format `x-request-id`
// already accepts above. INSERT ... ON CONFLICT(id) DO NOTHING then makes the create idempotent,
// so a mutation resumed twice (e.g. after a dropped response) can't produce a duplicate row.
const clientId = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
const createItemSchema = z.object({
  id: clientId.optional(),
  appId: z.string().min(1).max(80),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional().default(""),
  type: itemType,
  priority: itemPriority.optional().default("none"),
  effort: itemEffort.optional().default("unknown"),
  visibility: itemVisibility.optional().default("shared"),
});
const updateItemSchema = z.object({
  appId: z.string().min(1).max(80).optional(),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  type: itemType.optional(),
  // Links or unlinks this item from a parent — see the validation in PATCH /items/:id below.
  parentId: z.string().min(1).max(80).nullable().optional(),
  baseUpdatedAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().positive().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied.");
const checklistItemSchema = z.object({
  id: clientId.optional(),
  title: z.string().trim().min(1).max(200),
}).strict();
const updateChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  baseUpdatedAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().positive().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied.");
const avatarUrl = z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "Profile images must use HTTPS.").nullable();
const appFields = {
  name: z.string().trim().min(2).max(80),
  // An app's visual identity is an optional logo image; with none, the UI shows its first letter.
  logoUrl: z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "App logos must use HTTPS.").nullable().optional(),
  description: z.string().trim().max(500),
};
const createAppSchema = z.object({ id: clientId.optional(), ...appFields }).strict();
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
  const result = await client.execute(`SELECT id, email, name, avatar_url AS avatarUrl, role,
      CASE WHEN is_active = 0 THEN 'revoked' WHEN firebase_uid IS NULL THEN 'pending' ELSE 'linked' END AS status,
      (SELECT COUNT(*) FROM app_access aa WHERE aa.user_id = users.id) AS accessCount
    FROM users ORDER BY is_active DESC, role, name`);
  return context.json({ data: result.rows });
});

api.post("/users/invitations", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can invite users." } }, 403);
  const parsed = z.object({
    id: clientId.optional(),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    name: z.string().trim().min(2).max(80),
    role: z.enum(["admin", "user"]).default("user"),
  }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const { id: suppliedId, ...invitation } = parsed.data;
  const client = getClient(context.env);
  const id = suppliedId ?? crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO users (id, email, name, role, is_active, updated_at) VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, is_active = 1, updated_at = excluded.updated_at`,
    args: [id, invitation.email, invitation.name, invitation.role, Date.now()],
  });
  return context.json({ data: { id, ...invitation } }, 201);
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
  // Admins see every active app; a non-admin only sees apps they have been granted access to.
  const accessJoin = currentUser.role === "admin" ? "" : "JOIN app_access aa ON aa.app_id = a.id AND aa.user_id = ?";
  const result = await client.execute({
    sql: `SELECT a.id, a.name, a.logo_url AS logoUrl, a.description, a.sort_order AS sortOrder,
            COUNT(CASE WHEN b.status IN ('backlog','in_progress','in_review')
              AND (b.visibility = 'shared' OR ? = 'admin') THEN 1 END) AS activeItemCount
          FROM apps a ${accessJoin} LEFT JOIN backlog_items b ON b.app_id = a.id
          WHERE a.is_active = 1 GROUP BY a.id ORDER BY a.sort_order, a.name`,
    args: currentUser.role === "admin" ? [currentUser.role] : [currentUser.role, currentUser.id],
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
  const { id: suppliedId, ...appData } = parsed.data;
  const client = getClient(context.env);
  const position = await client.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextPosition FROM apps");
  const id = suppliedId ?? crypto.randomUUID();
  await client.execute({
    sql: "INSERT INTO apps (id, name, logo_url, description, sort_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING",
    args: [id, appData.name, appData.logoUrl ?? null, appData.description || null, Number(position.rows[0]?.nextPosition ?? 0), Date.now()],
  });
  return context.json({ data: { id, ...appData, logoUrl: appData.logoUrl ?? null, isActive: true, activeItemCount: 0 } }, 201);
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

// --- Per-app access grants (admin only) ---------------------------------------------------
// Access is a set of (app, user) rows. Both management screens edit the same table: the People
// screen replaces the apps for one user, the Apps screen replaces the users for one app. Writes
// are replace-set (delete-then-insert) so the client sends the full desired membership.

const accessAppIdsSchema = z.object({ appIds: z.array(z.string().min(1).max(80)).max(200) }).strict();
const accessUserIdsSchema = z.object({ userIds: z.array(z.string().min(1).max(80)).max(500) }).strict();

api.get("/users/:id/apps", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can manage access." } }, 403);
  const client = getClient(context.env);
  const result = await client.execute({ sql: "SELECT app_id AS appId FROM app_access WHERE user_id = ?", args: [context.req.param("id")] });
  return context.json({ data: result.rows.map((row) => String(row.appId)) });
});

api.put("/users/:id/apps", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can manage access." } }, 403);
  const parsed = accessAppIdsSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const userId = context.req.param("id");
  const client = getClient(context.env);
  const target = await client.execute({ sql: "SELECT id FROM users WHERE id = ?", args: [userId] });
  if (target.rows.length === 0) return context.json({ error: { code: "not_found", message: "User not found." } }, 404);
  const appIds = [...new Set(parsed.data.appIds)];
  const now = Date.now();
  await client.batch([
    { sql: "DELETE FROM app_access WHERE user_id = ?", args: [userId] },
    // The EXISTS guard silently drops ids for apps that no longer exist, avoiding orphan grants.
    ...appIds.map((appId) => ({ sql: "INSERT INTO app_access (app_id, user_id, created_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM apps WHERE id = ?)", args: [appId, userId, now, appId] })),
  ], "write");
  return context.json({ data: { appIds } });
});

api.get("/apps/:id/users", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can manage access." } }, 403);
  const client = getClient(context.env);
  const result = await client.execute({ sql: "SELECT user_id AS userId FROM app_access WHERE app_id = ?", args: [context.req.param("id")] });
  return context.json({ data: result.rows.map((row) => String(row.userId)) });
});

api.put("/apps/:id/users", async (context) => {
  if (context.get("user").role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can manage access." } }, 403);
  const parsed = accessUserIdsSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const appId = context.req.param("id");
  const client = getClient(context.env);
  const target = await client.execute({ sql: "SELECT id FROM apps WHERE id = ?", args: [appId] });
  if (target.rows.length === 0) return context.json({ error: { code: "not_found", message: "Application not found." } }, 404);
  const userIds = [...new Set(parsed.data.userIds)];
  const now = Date.now();
  await client.batch([
    { sql: "DELETE FROM app_access WHERE app_id = ?", args: [appId] },
    ...userIds.map((userId) => ({ sql: "INSERT INTO app_access (app_id, user_id, created_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)", args: [appId, userId, now, userId] })),
  ], "write");
  return context.json({ data: { userIds } });
});

api.get("/apps/:appId/items", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  if (!(await canAccessApp(client, currentUser, context.req.param("appId")))) return context.json({ error: { code: "not_found", message: "Application not found." } }, 404);
  const result = await client.execute({
    sql: `SELECT b.id, b.app_id AS appId, b.creator_id AS creatorId, b.title, b.description,
            b.type, b.status, b.priority, b.effort, b.visibility, b.parent_id AS parentId, p.title AS parentTitle,
            b.created_at AS createdAt, b.updated_at AS updatedAt,
            u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(DISTINCT v.user_id) AS votes,
            MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted,
            COUNT(DISTINCT c.id) AS subtaskCount,
            COUNT(DISTINCT CASE WHEN c.status = 'done' THEN c.id END) AS completedSubtasks
          FROM backlog_items b
          JOIN users u ON u.id = b.creator_id
          LEFT JOIN backlog_items p ON p.id = b.parent_id
          LEFT JOIN votes v ON v.item_id = b.id
          LEFT JOIN backlog_items c ON c.parent_id = b.id
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
  if (!(await canAccessApp(client, currentUser, context.req.param("appId")))) return context.json({ data: [] });
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
 * "my requests") which would otherwise need one call per application.
 */
api.get("/items", async (context) => {
  const currentUser = context.get("user");
  const statusFilter = context.req.query("status");
  const statuses = statusFilter ? statusFilter.split(",").filter((value) => itemStatus.safeParse(value).success) : [];
  if (statusFilter && statuses.length === 0) return context.json({ error: { code: "invalid_request", message: "Unknown status filter." } }, 400);

  const client = getClient(context.env);
  const result = await client.execute({
    sql: `SELECT b.id, b.app_id AS appId, b.creator_id AS creatorId, b.title, b.description,
            b.type, b.status, b.priority, b.effort, b.visibility, b.parent_id AS parentId, p.title AS parentTitle,
            b.created_at AS createdAt, b.updated_at AS updatedAt,
            a.name AS appName, a.logo_url AS appLogoUrl,
            u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(DISTINCT v.user_id) AS votes,
            MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted,
            COUNT(DISTINCT c.id) AS subtaskCount,
            COUNT(DISTINCT CASE WHEN c.status = 'done' THEN c.id END) AS completedSubtasks
          FROM backlog_items b
          JOIN apps a ON a.id = b.app_id AND a.is_active = 1
          JOIN users u ON u.id = b.creator_id
          LEFT JOIN backlog_items p ON p.id = b.parent_id
          LEFT JOIN votes v ON v.item_id = b.id
          LEFT JOIN backlog_items c ON c.parent_id = b.id
          WHERE (b.visibility = 'shared' OR ? = 'admin')
            ${currentUser.role === "admin" ? "" : "AND EXISTS (SELECT 1 FROM app_access aa WHERE aa.app_id = b.app_id AND aa.user_id = ?)"}
            ${statuses.length ? `AND b.status IN (${statuses.map(() => "?").join(", ")})` : ""}
          GROUP BY b.id ORDER BY b.updated_at DESC`,
    args: [currentUser.id, currentUser.role, ...(currentUser.role === "admin" ? [] : [currentUser.id]), ...statuses],
  });

  // The normal response is intentionally compact. The signed-in client requests a snapshot once
  // in the background so every task detail (including checklists) is available before the user
  // opens it. Reusing the already-authorised item ids keeps the second query permission-safe and
  // avoids one HTTP request per task.
  if (context.req.query("snapshot") !== "1" || result.rows.length === 0) {
    return context.json({ data: result.rows, ...(context.req.query("snapshot") === "1" ? { checklist: [] } : {}) });
  }
  const itemIds = result.rows.map((row) => String(row.id));
  const checklist = await client.execute({
    sql: `SELECT id, request_id AS requestId, title, done, sort_order AS sortOrder,
            created_at AS createdAt, updated_at AS updatedAt
          FROM checklist_items
          WHERE request_id IN (${itemIds.map(() => "?").join(", ")})
          ORDER BY request_id, sort_order, created_at`,
    args: itemIds,
  });
  return context.json({ data: result.rows, checklist: checklist.rows });
});

api.get("/items/:id", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item, await canAccessApp(client, currentUser, item.appId))) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  const detail = await client.execute({
    sql: `SELECT b.id, b.app_id AS appId, b.creator_id AS creatorId, b.title, b.description, b.type, b.status, b.priority, b.effort, b.visibility,
            b.parent_id AS parentId, p.title AS parentTitle,
            b.created_at AS createdAt, b.updated_at AS updatedAt, u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(v.user_id) AS votes, MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted
          FROM backlog_items b JOIN users u ON u.id = b.creator_id LEFT JOIN backlog_items p ON p.id = b.parent_id LEFT JOIN votes v ON v.item_id = b.id
          WHERE b.id = ? GROUP BY b.id`,
    args: [currentUser.id, item.id],
  });
  const children = await client.execute({
    sql: `SELECT c.id, c.app_id AS appId, c.creator_id AS creatorId, c.title, c.description, c.type, c.status, c.priority, c.effort, c.visibility,
            c.parent_id AS parentId, c.created_at AS createdAt, c.updated_at AS updatedAt,
            u.name AS creatorName, u.avatar_url AS creatorAvatarUrl, u.role AS creatorRole,
            COUNT(DISTINCT v.user_id) AS votes, MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS voted,
            0 AS subtaskCount, 0 AS completedSubtasks
          FROM backlog_items c JOIN users u ON u.id = c.creator_id LEFT JOIN votes v ON v.item_id = c.id
          WHERE c.parent_id = ? GROUP BY c.id ORDER BY c.created_at`,
    args: [currentUser.id, item.id],
  });
  const checklist = await client.execute({
    sql: `SELECT id, request_id AS requestId, title, done, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
          FROM checklist_items WHERE request_id = ? ORDER BY sort_order, created_at`,
    args: [item.id],
  });
  return context.json({ data: { ...detail.rows[0], children: children.rows, checklist: checklist.rows } });
});

api.post("/items", async (context) => {
  const parsed = createItemSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (parsed.data.visibility === "internal" && currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can create internal requests." } }, 403);
  if (parsed.data.priority !== "none" && currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can set priority." } }, 403);
  if (parsed.data.effort !== "unknown" && currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can set implementation effort." } }, 403);

  const client = getClient(context.env);
  if (!(await canAccessApp(client, currentUser, parsed.data.appId))) return context.json({ error: { code: "forbidden", message: "You do not have access to this application." } }, 403);
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO backlog_items (id, app_id, creator_id, title, description, type, status, priority, effort, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [id, parsed.data.appId, currentUser.id, parsed.data.title, parsed.data.description || null, parsed.data.type, parsed.data.priority, parsed.data.effort, parsed.data.visibility, now, now],
  });
  return context.json({ data: { id } }, 201);
});

api.patch("/items/:id", async (context) => {
  const parsed = updateItemSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item, await canAccessApp(client, currentUser, item.appId))) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canEditItem(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot edit this request." } }, 403);
  if (revisionConflicts(parsed.data.baseUpdatedAt, item.updatedAt)) {
    return context.json({ error: { code: "conflict", message: "This request changed on another device." } }, 409);
  }
  if (parsed.data.appId !== undefined) {
    const target = await client.execute({ sql: "SELECT id FROM apps WHERE id = ? AND is_active = 1", args: [parsed.data.appId] });
    if (target.rows.length === 0) return context.json({ error: { code: "invalid_request", message: "That application does not exist." } }, 400);
    if (!(await canAccessApp(client, currentUser, parsed.data.appId))) return context.json({ error: { code: "forbidden", message: "You do not have access to this application." } }, 403);
  }
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== null) {
    if (parsed.data.parentId === item.id) return context.json({ error: { code: "invalid_request", message: "A card cannot link to itself." } }, 400);
    if (item.parentId) return context.json({ error: { code: "invalid_request", message: "This card is already linked to a parent. Unlink it first." } }, 400);
    const parent = await findItem(client, parsed.data.parentId);
    if (!parent) return context.json({ error: { code: "invalid_request", message: "That card does not exist." } }, 400);
    if (parent.appId !== (parsed.data.appId ?? item.appId)) return context.json({ error: { code: "invalid_request", message: "Linked cards must be in the same application." } }, 400);
    if (parent.parentId) return context.json({ error: { code: "invalid_request", message: "That card is itself linked to a parent and cannot have its own linked cards." } }, 400);
    const childCount = await client.execute({ sql: "SELECT COUNT(*) AS count FROM backlog_items WHERE parent_id = ?", args: [item.id] });
    if (Number(childCount.rows[0]?.count ?? 0) > 0) return context.json({ error: { code: "invalid_request", message: "This card already has its own linked cards." } }, 400);
  }
  const changes = { ...parsed.data };
  delete changes.baseUpdatedAt;
  const columns: Record<string, string | number | null | undefined> = { ...changes, updatedAt: changes.updatedAt ?? Date.now() };
  const names: Record<string, string> = { appId: "app_id", title: "title", description: "description", type: "type", parentId: "parent_id", updatedAt: "updated_at" };
  const entries = Object.entries(columns);
  await client.execute({ sql: `UPDATE backlog_items SET ${entries.map(([key]) => `${names[key]} = ?`).join(", ")} WHERE id = ?`, args: [...entries.map(([, value]) => value ?? null), item.id] });
  return context.json({ data: { id: item.id } });
});

api.patch("/items/:id/status", async (context) => {
  const parsed = z.object({ status: itemStatus, baseUpdatedAt: z.number().int().nonnegative().optional(), updatedAt: z.number().int().positive().optional() }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (!canChangeWorkflow(currentUser)) return context.json({ error: { code: "forbidden", message: "Only administrators can move requests." } }, 403);
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (revisionConflicts(parsed.data.baseUpdatedAt, item.updatedAt)) return context.json({ error: { code: "conflict", message: "This request changed on another device." } }, 409);
  await client.execute({ sql: "UPDATE backlog_items SET status = ?, updated_at = ? WHERE id = ?", args: [parsed.data.status, parsed.data.updatedAt ?? Date.now(), item.id] });
  return context.json({ data: { id: item.id, status: parsed.data.status } });
});

api.patch("/items/:id/priority", async (context) => {
  const parsed = z.object({ priority: itemPriority, baseUpdatedAt: z.number().int().nonnegative().optional(), updatedAt: z.number().int().positive().optional() }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (!canChangeWorkflow(currentUser)) return context.json({ error: { code: "forbidden", message: "Only administrators can set priority." } }, 403);
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (revisionConflicts(parsed.data.baseUpdatedAt, item.updatedAt)) return context.json({ error: { code: "conflict", message: "This request changed on another device." } }, 409);
  await client.execute({ sql: "UPDATE backlog_items SET priority = ?, updated_at = ? WHERE id = ?", args: [parsed.data.priority, parsed.data.updatedAt ?? Date.now(), item.id] });
  return context.json({ data: { id: item.id, priority: parsed.data.priority } });
});

api.patch("/items/:id/visibility", async (context) => {
  const parsed = z.object({ visibility: itemVisibility, baseUpdatedAt: z.number().int().nonnegative().optional(), updatedAt: z.number().int().positive().optional() }).strict().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  if (currentUser.role !== "admin") return context.json({ error: { code: "forbidden", message: "Only administrators can change visibility." } }, 403);
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (revisionConflicts(parsed.data.baseUpdatedAt, item.updatedAt)) return context.json({ error: { code: "conflict", message: "This request changed on another device." } }, 409);
  await client.execute({ sql: "UPDATE backlog_items SET visibility = ?, updated_at = ? WHERE id = ?", args: [parsed.data.visibility, parsed.data.updatedAt ?? Date.now(), item.id] });
  return context.json({ data: { id: item.id, visibility: parsed.data.visibility } });
});

api.delete("/items/:id", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item, await canAccessApp(client, currentUser, item.appId))) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canDeleteItem(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot delete this request." } }, 403);
  const suppliedRevision = context.req.query("baseUpdatedAt");
  if (suppliedRevision !== undefined) {
    const baseUpdatedAt = Number(suppliedRevision);
    if (!Number.isSafeInteger(baseUpdatedAt) || baseUpdatedAt < 0) return context.json({ error: { code: "invalid_request", message: "Invalid base revision." } }, 400);
    if (revisionConflicts(baseUpdatedAt, item.updatedAt)) return context.json({ error: { code: "conflict", message: "This request changed on another device." } }, 409);
  }
  // Linked cards are independent — deleting this one should only unlink them, never take them
  // down too. Unlinking first turns the FK's ON DELETE cascade into a no-op below.
  await client.execute({ sql: "UPDATE backlog_items SET parent_id = NULL, updated_at = ? WHERE parent_id = ?", args: [Date.now(), item.id] });
  await client.execute({ sql: "DELETE FROM backlog_items WHERE id = ?", args: [item.id] });
  return context.body(null, 204);
});

api.post("/items/:id/vote", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item, await canAccessApp(client, currentUser, item.appId))) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
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

api.post("/items/:id/checklist", async (context) => {
  const parsed = checklistItemSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const item = await findItem(client, context.req.param("id"));
  if (!item || !canReadItem(currentUser, item, await canAccessApp(client, currentUser, item.appId))) return context.json({ error: { code: "not_found", message: "Request not found." } }, 404);
  if (!canManageSubtasks(currentUser, item)) return context.json({ error: { code: "forbidden", message: "You cannot manage the checklist for this request." } }, 403);
  const position = await client.execute({ sql: "SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextPosition FROM checklist_items WHERE request_id = ?", args: [item.id] });
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO checklist_items (id, request_id, title, done, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, 0, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [id, item.id, parsed.data.title, Number(position.rows[0]?.nextPosition ?? 0), now, now],
  });
  return context.json({ data: { id } }, 201);
});

async function findChecklistItem(client: ReturnType<typeof getClient>, id: string) {
  const result = await client.execute({
    sql: `SELECT ci.id, ci.request_id AS requestId, ci.updated_at AS updatedAt, b.creator_id AS creatorId
          FROM checklist_items ci JOIN backlog_items b ON b.id = ci.request_id WHERE ci.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), requestId: String(row.requestId), creatorId: String(row.creatorId), updatedAt: Number(row.updatedAt) };
}

api.patch("/checklist/:id", async (context) => {
  const parsed = updateChecklistItemSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message } }, 400);
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const checklistItem = await findChecklistItem(client, context.req.param("id"));
  if (!checklistItem) return context.json({ error: { code: "not_found", message: "Checklist item not found." } }, 404);
  if (!canManageSubtasks(currentUser, checklistItem)) return context.json({ error: { code: "forbidden", message: "You cannot manage the checklist for this request." } }, 403);
  if (revisionConflicts(parsed.data.baseUpdatedAt, checklistItem.updatedAt)) return context.json({ error: { code: "conflict", message: "This checklist item changed on another device." } }, 409);
  const columns: Record<string, string | number> = { updatedAt: parsed.data.updatedAt ?? Date.now() };
  if (parsed.data.title !== undefined) columns.title = parsed.data.title;
  if (parsed.data.done !== undefined) columns.done = parsed.data.done ? 1 : 0;
  const names: Record<string, string> = { title: "title", done: "done", updatedAt: "updated_at" };
  const entries = Object.entries(columns);
  await client.execute({ sql: `UPDATE checklist_items SET ${entries.map(([key]) => `${names[key]} = ?`).join(", ")} WHERE id = ?`, args: [...entries.map(([, value]) => value), checklistItem.id] });
  return context.json({ data: { id: checklistItem.id } });
});

api.delete("/checklist/:id", async (context) => {
  const currentUser = context.get("user");
  const client = getClient(context.env);
  const checklistItem = await findChecklistItem(client, context.req.param("id"));
  if (!checklistItem) return context.json({ error: { code: "not_found", message: "Checklist item not found." } }, 404);
  if (!canManageSubtasks(currentUser, checklistItem)) return context.json({ error: { code: "forbidden", message: "You cannot manage the checklist for this request." } }, 403);
  await client.execute({ sql: "DELETE FROM checklist_items WHERE id = ?", args: [checklistItem.id] });
  return context.body(null, 204);
});

async function findItem(client: ReturnType<typeof getClient>, id: string): Promise<ItemRecord | null> {
  const result = await client.execute({ sql: "SELECT id, app_id, creator_id, visibility, status, parent_id, updated_at FROM backlog_items WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    appId: String(row.app_id),
    creatorId: String(row.creator_id),
    visibility: String(row.visibility) as Visibility,
    status: String(row.status),
    parentId: row.parent_id === null ? null : String(row.parent_id),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Whether `user` may access `appId`. Admins can reach every app; a non-admin needs a row in
 * `app_access`. This backs the single-item routes; list routes filter with a JOIN instead.
 */
async function canAccessApp(client: ReturnType<typeof getClient>, user: AppUser, appId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  const result = await client.execute({ sql: "SELECT 1 FROM app_access WHERE app_id = ? AND user_id = ? LIMIT 1", args: [appId, user.id] });
  return result.rows.length > 0;
}

export function normalizeTitle(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function revisionConflicts(baseUpdatedAt: number | undefined, currentUpdatedAt: number) {
  return baseUpdatedAt !== undefined && baseUpdatedAt !== currentUpdatedAt;
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
