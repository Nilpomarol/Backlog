export type Role = "admin" | "user";
export type ItemType = "bug" | "feature" | "improvement" | "task";
export type ItemStatus = "backlog" | "in_progress" | "in_review" | "done" | "discarded";
export type Visibility = "shared" | "internal";
export type InvitationStatus = "pending" | "linked" | "revoked";

export type Profile = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
};

export type ManagedUser = Profile & { status: InvitationStatus };

export type Application = {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  sortOrder: number;
  activeItemCount: number;
};

export type ManagedApplication = {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
};

export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
  position: number;
};

export type RequestSummary = {
  id: string;
  appId: string;
  title: string;
  description: string | null;
  type: ItemType;
  status: ItemStatus;
  visibility: Visibility;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  creatorRole: Role;
  votes: number;
  voted: boolean;
  subtaskCount: number;
  completedSubtasks: number;
  createdAt: number;
  updatedAt: number;
};

export type RequestDetail = RequestSummary & { subtasks: Subtask[] };

export type SimilarRequest = {
  id: string;
  title: string;
  type: ItemType;
  votes: number;
};

/** The four workflow states shown as board columns. `discarded` is deliberately excluded — it is
 *  reached through the "show discarded" filter instead of occupying a fifth of the board. */
export const BOARD_STATUSES: ItemStatus[] = ["backlog", "in_progress", "in_review", "done"];
export const ALL_STATUSES: ItemStatus[] = [...BOARD_STATUSES, "discarded"];
export const ITEM_TYPES: ItemType[] = ["bug", "feature", "improvement", "task"];

/** Statuses that count as "active" — mirrors the API's active-item count. */
export const ACTIVE_STATUSES: ItemStatus[] = ["backlog", "in_progress", "in_review"];

export function isItemType(value: string): value is ItemType {
  return (ITEM_TYPES as string[]).includes(value);
}

export function isItemStatus(value: string): value is ItemStatus {
  return (ALL_STATUSES as string[]).includes(value);
}

// --- Permission mirrors -------------------------------------------------------------------
// These duplicate `lib/permissions.ts` for the client so the UI never *offers* an action the
// server will reject. The server remains the only authority; this is presentation only.

export function canEditRequest(user: Profile | null, item: { creatorId: string }) {
  return !!user && (user.role === "admin" || user.id === item.creatorId);
}

export function canChangeWorkflow(user: Profile | null) {
  return user?.role === "admin";
}

export function canManageSubtasks(user: Profile | null, item: { creatorId: string }) {
  return canEditRequest(user, item);
}

export function canVote(user: Profile | null, item: { creatorId: string; visibility: Visibility }) {
  return !!user && item.visibility === "shared" && user.id !== item.creatorId;
}

/** Why the current user cannot vote — drives the explanatory helper text next to a disabled
 *  vote control. Returning a reason rather than a boolean keeps the UI honest. */
export function voteBlockedReason(
  user: Profile | null,
  item: { creatorId: string; visibility: Visibility },
): "own" | "internal" | null {
  if (!user) return null;
  if (user.id === item.creatorId) return "own";
  if (item.visibility === "internal") return "internal";
  return null;
}
