import type { QueryClient } from "@tanstack/react-query";
import { getActiveRequester } from "./active-requester";
import type { ItemEffort, ItemPriority, ItemStatus, ItemType, Role, Visibility } from "./domain";

/**
 * Every mutation that's safe to queue while offline: each has optimistic cache patching (see
 * lib/queries.ts), so the UI reflects the change instantly regardless of connectivity. Creates
 * carry a client-generated id (accepted by the server — see api/router.ts's `clientId` schema and
 * `ON CONFLICT(id) DO NOTHING`) rather than waiting on a server-assigned one, so the optimistic
 * insert already has its real id and never needs reconciling.
 *
 * The functions below are shared between the live `useMutation` call sites and
 * `registerOfflineMutationDefaults`: React Query persists any mutation that's still `isPaused`
 * (offline) to IndexedDB, but it can't serialise a closure, so a mutation resumed after a reload
 * needs its `mutationFn` re-registered on the client via `setMutationDefaults`. Reading the
 * requester through `getActiveRequester()` (rather than a hook-scoped `request`) means the exact
 * same function works whether it's called live or resumed with no component around it.
 */
export const mutationKeys = {
  vote: ["offline-mutation", "vote"],
  updateRequest: ["offline-mutation", "updateRequest"],
  setStatus: ["offline-mutation", "setStatus"],
  setPriority: ["offline-mutation", "setPriority"],
  setVisibility: ["offline-mutation", "setVisibility"],
  deleteRequest: ["offline-mutation", "deleteRequest"],
  updateChecklistItem: ["offline-mutation", "updateChecklistItem"],
  deleteChecklistItem: ["offline-mutation", "deleteChecklistItem"],
  createRequest: ["offline-mutation", "createRequest"],
  createChecklistItem: ["offline-mutation", "createChecklistItem"],
  createApp: ["offline-mutation", "createApp"],
  inviteUser: ["offline-mutation", "inviteUser"],
  setUserRole: ["offline-mutation", "setUserRole"],
  setUserAccess: ["offline-mutation", "setUserAccess"],
  removeInvitation: ["offline-mutation", "removeInvitation"],
  setUserApps: ["offline-mutation", "setUserApps"],
  setAppUsers: ["offline-mutation", "setAppUsers"],
  updateApp: ["offline-mutation", "updateApp"],
  deleteApp: ["offline-mutation", "deleteApp"],
} as const;

export async function voteMutationFn({ id, voted }: { id: string; voted: boolean }) {
  await getActiveRequester()(`/items/${encodeURIComponent(id)}/vote`, { method: voted ? "DELETE" : "POST" });
}

export type UpdateRequestInput = {
  id: string;
  appId?: string;
  title?: string;
  description?: string | null;
  type?: ItemType;
  parentId?: string | null;
  /** Client-only: the other end of a link/unlink. Never sent to the server. */
  relatedRequestId?: string;
};

export async function updateRequestMutationFn({ id, relatedRequestId, ...changes }: UpdateRequestInput) {
  void relatedRequestId;
  await getActiveRequester()(`/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export async function setStatusMutationFn({ id, status }: { id: string; status: ItemStatus }) {
  await getActiveRequester()(`/items/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function setPriorityMutationFn({ id, priority }: { id: string; priority: ItemPriority }) {
  await getActiveRequester()(`/items/${encodeURIComponent(id)}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });
}

export async function setVisibilityMutationFn({ id, visibility }: { id: string; visibility: Visibility }) {
  await getActiveRequester()(`/items/${encodeURIComponent(id)}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ visibility }),
  });
}

export async function deleteRequestMutationFn(id: string) {
  await getActiveRequester()(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type UpdateChecklistItemInput = { id: string; requestId: string; title?: string; done?: boolean };

export async function updateChecklistItemMutationFn({ id, requestId, ...changes }: UpdateChecklistItemInput) {
  void requestId;
  await getActiveRequester()(`/checklist/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export async function deleteChecklistItemMutationFn({ id }: { id: string; requestId: string }) {
  await getActiveRequester()(`/checklist/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- Creates (client-generated id) -----------------------------------------------------------

export type CreateRequestInput = {
  id: string;
  appId: string;
  title: string;
  description: string;
  type: ItemType;
  priority: ItemPriority;
  effort: ItemEffort;
  visibility: Visibility;
};

export async function createRequestMutationFn(input: CreateRequestInput) {
  await getActiveRequester()("/items", { method: "POST", body: JSON.stringify(input) });
}

export type CreateChecklistItemInput = { id: string; requestId: string; title: string };

export async function createChecklistItemMutationFn({ id, requestId, title }: CreateChecklistItemInput) {
  await getActiveRequester()(`/items/${encodeURIComponent(requestId)}/checklist`, {
    method: "POST",
    body: JSON.stringify({ id, title }),
  });
}

export type CreateAppInput = { id: string; name: string; logoUrl?: string | null; description: string };

export async function createAppMutationFn(input: CreateAppInput) {
  await getActiveRequester()("/apps", { method: "POST", body: JSON.stringify(input) });
}

export type InviteUserInput = { id: string; email: string; name: string; role: Role };

export async function inviteUserMutationFn(input: InviteUserInput) {
  await getActiveRequester()("/users/invitations", { method: "POST", body: JSON.stringify(input) });
}

// --- Admin (people & apps management) ----------------------------------------------------------

export async function setUserRoleMutationFn({ id, role }: { id: string; role: Role }) {
  await getActiveRequester()(`/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export async function setUserAccessMutationFn({ id, active }: { id: string; active: boolean }) {
  await getActiveRequester()(`/users/${encodeURIComponent(id)}/access`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function removeInvitationMutationFn(id: string) {
  await getActiveRequester()(`/users/${encodeURIComponent(id)}/invitation`, { method: "DELETE" });
}

export async function setUserAppsMutationFn({ userId, appIds }: { userId: string; appIds: string[] }) {
  await getActiveRequester()(`/users/${encodeURIComponent(userId)}/apps`, {
    method: "PUT",
    body: JSON.stringify({ appIds }),
  });
}

export async function setAppUsersMutationFn({ appId, userIds }: { appId: string; userIds: string[] }) {
  await getActiveRequester()(`/apps/${encodeURIComponent(appId)}/users`, {
    method: "PUT",
    body: JSON.stringify({ userIds }),
  });
}

export type UpdateAppInput = {
  id: string;
  name?: string;
  logoUrl?: string | null;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export async function updateAppMutationFn({ id, ...changes }: UpdateAppInput) {
  await getActiveRequester()(`/apps/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export async function deleteAppMutationFn(id: string) {
  await getActiveRequester()(`/apps/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function registerOfflineMutationDefaults(client: QueryClient) {
  client.setMutationDefaults(mutationKeys.vote, { mutationFn: voteMutationFn });
  client.setMutationDefaults(mutationKeys.updateRequest, { mutationFn: updateRequestMutationFn });
  client.setMutationDefaults(mutationKeys.setStatus, { mutationFn: setStatusMutationFn });
  client.setMutationDefaults(mutationKeys.setPriority, { mutationFn: setPriorityMutationFn });
  client.setMutationDefaults(mutationKeys.setVisibility, { mutationFn: setVisibilityMutationFn });
  client.setMutationDefaults(mutationKeys.deleteRequest, { mutationFn: deleteRequestMutationFn });
  client.setMutationDefaults(mutationKeys.updateChecklistItem, { mutationFn: updateChecklistItemMutationFn });
  client.setMutationDefaults(mutationKeys.deleteChecklistItem, { mutationFn: deleteChecklistItemMutationFn });
  client.setMutationDefaults(mutationKeys.createRequest, { mutationFn: createRequestMutationFn });
  client.setMutationDefaults(mutationKeys.createChecklistItem, { mutationFn: createChecklistItemMutationFn });
  client.setMutationDefaults(mutationKeys.createApp, { mutationFn: createAppMutationFn });
  client.setMutationDefaults(mutationKeys.inviteUser, { mutationFn: inviteUserMutationFn });
  client.setMutationDefaults(mutationKeys.setUserRole, { mutationFn: setUserRoleMutationFn });
  client.setMutationDefaults(mutationKeys.setUserAccess, { mutationFn: setUserAccessMutationFn });
  client.setMutationDefaults(mutationKeys.removeInvitation, { mutationFn: removeInvitationMutationFn });
  client.setMutationDefaults(mutationKeys.setUserApps, { mutationFn: setUserAppsMutationFn });
  client.setMutationDefaults(mutationKeys.setAppUsers, { mutationFn: setAppUsersMutationFn });
  client.setMutationDefaults(mutationKeys.updateApp, { mutationFn: updateAppMutationFn });
  client.setMutationDefaults(mutationKeys.deleteApp, { mutationFn: deleteAppMutationFn });
}
