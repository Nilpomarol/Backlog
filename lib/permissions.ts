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

export function canReadItem(user: PermissionUser, item: PermissionItem) {
  return user.role === "admin" || item.visibility === "shared";
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
