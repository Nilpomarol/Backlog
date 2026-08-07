export type Role = "admin" | "user";
export type Visibility = "shared" | "internal";

export type PermissionUser = {
  id: string;
  role: Role;
};

export type PermissionItem = {
  creatorId: string;
  visibility: Visibility;
};

/**
 * Whether the user may see a request. Admins see everything. A non-admin needs an explicit grant
 * to the request's app (`hasAppAccess`) *and* the request must be shared. App access is resolved by
 * the caller (from the `app_access` table) and passed in, so this stays a pure function.
 */
export function canReadItem(user: PermissionUser, item: PermissionItem, hasAppAccess: boolean) {
  if (user.role === "admin") return true;
  return hasAppAccess && item.visibility === "shared";
}

export function canEditItem(user: PermissionUser, item: PermissionItem) {
  return user.role === "admin" || user.id === item.creatorId;
}

export function canDeleteItem(user: PermissionUser, item: PermissionItem) {
  return canEditItem(user, item);
}

export function canChangeWorkflow(user: PermissionUser) {
  return user.role === "admin";
}

export function canManageSubtasks(user: PermissionUser, item: PermissionItem) {
  return user.role === "admin" || user.id === item.creatorId;
}

export function canVote(user: PermissionUser, item: PermissionItem) {
  return item.visibility === "shared" && user.id !== item.creatorId;
}
