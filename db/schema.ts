import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name).notNull().default(sql`(unixepoch() * 1000)`);

export const apps = sqliteTable("apps", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp("created_at"),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  firebaseUid: text("firebase_uid"),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  uniqueIndex("idx_users_email").on(table.email),
  uniqueIndex("idx_users_firebase_uid").on(table.firebaseUid),
  check("users_role_check", sql`${table.role} in ('admin', 'user')`),
]);

// Per-person, per-app access grants. A non-admin user may only see and act within apps for which
// a row exists here. Admins bypass this table entirely (they see every app). No row means no access.
export const appAccess = sqliteTable("app_access", {
  appId: text("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at"),
}, (table) => [
  primaryKey({ columns: [table.appId, table.userId] }),
  index("idx_app_access_user").on(table.userId),
]);

export const backlogItems = sqliteTable("backlog_items", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { enum: ["bug", "feature", "improvement", "task"] }).notNull(),
  status: text("status", { enum: ["backlog", "in_progress", "in_review", "done", "discarded"] }).notNull().default("backlog"),
  visibility: text("visibility", { enum: ["shared", "internal"] }).notNull().default("shared"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_backlog_items_app_status").on(table.appId, table.status),
  index("idx_backlog_items_app_visibility").on(table.appId, table.visibility),
  index("idx_backlog_items_creator").on(table.creatorId),
  check("backlog_items_type_check", sql`${table.type} in ('bug', 'feature', 'improvement', 'task')`),
  check("backlog_items_status_check", sql`${table.status} in ('backlog', 'in_progress', 'in_review', 'done', 'discarded')`),
  check("backlog_items_visibility_check", sql`${table.visibility} in ('shared', 'internal')`),
]);

export const votes = sqliteTable("votes", {
  itemId: text("item_id").notNull().references(() => backlogItems.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at"),
}, (table) => [
  primaryKey({ columns: [table.itemId, table.userId] }),
  index("idx_votes_user").on(table.userId),
]);

export const subtasks = sqliteTable("subtasks", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => backlogItems.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_subtasks_item_position").on(table.itemId, table.position),
]);
