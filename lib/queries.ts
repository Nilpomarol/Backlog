"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth, useT } from "../components/providers";
import {
  ApiError,
  toApplication,
  toManagedApplication,
  toManagedUser,
  toRequestDetail,
  toRequestSummary,
  toSimilarRequest,
  type Requester,
} from "./api";
import {
  createAppMutationFn,
  createChecklistItemMutationFn,
  createRequestMutationFn,
  deleteAppMutationFn,
  deleteChecklistItemMutationFn,
  deleteRequestMutationFn,
  inviteUserMutationFn,
  mutationKeys,
  removeInvitationMutationFn,
  setAppUsersMutationFn,
  setPriorityMutationFn,
  setStatusMutationFn,
  setUserAccessMutationFn,
  setUserAppsMutationFn,
  setUserRoleMutationFn,
  setVisibilityMutationFn,
  updateAppMutationFn,
  updateChecklistItemMutationFn,
  updateRequestMutationFn,
  voteMutationFn,
  type CreateAppInput,
  type CreateChecklistItemInput,
  type CreateRequestInput,
  type InviteUserInput,
  type UpdateAppInput,
  type UpdateChecklistItemInput,
  type UpdateRequestInput,
} from "./offline-mutations";
import type {
  Application,
  ItemPriority,
  ItemStatus,
  ManagedApplication,
  ManagedUser,
  Profile,
  RequestDetail,
  RequestSummary,
  Role,
  SimilarRequest,
  Visibility,
} from "./domain";

type Row = Record<string, unknown>;
type Envelope<T> = { data: T };

export type CrossAppRequest = RequestSummary & { appName?: string; appLogoUrl?: string | null };

export const queryKeys = {
  apps: ["apps"] as const,
  managedApps: ["apps", "manage"] as const,
  users: ["users"] as const,
  userApps: (userId: string) => ["access", "user", userId] as const,
  appUsers: (appId: string) => ["access", "app", appId] as const,
  appItems: (appId: string) => ["items", "app", appId] as const,
  allItems: (status?: string) => ["items", "all", status ?? "any"] as const,
  request: (id: string) => ["request", id] as const,
  similar: (appId: string, title: string) => ["similar", appId, title] as const,
};

/** Everything that can change when a request is written to. */
function invalidateRequestData(client: QueryClient, requestId?: string) {
  void client.invalidateQueries({ queryKey: ["items"] });
  void client.invalidateQueries({ queryKey: queryKeys.apps });
  if (requestId) void client.invalidateQueries({ queryKey: queryKeys.request(requestId) });
}

/** Maps an API failure onto localised, actionable copy. */
export function useErrorMessage() {
  const t = useT();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "rate_limited":
            return t.errorRateLimited;
          case "forbidden":
          case "access_denied":
            return t.errorForbidden;
          case "offline":
            return t.errorOffline;
          case "not_found":
            return t.notFoundTitle;
          case "invalid_request":
          case "conflict":
            return error.message;
          default:
            return t.errorGeneric;
        }
      }
      return t.errorGeneric;
    },
    [t],
  );
}

// --- Reads --------------------------------------------------------------------------------

export function useApps() {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.apps,
    enabled: status === "ready",
    queryFn: async () => {
      const payload = await request<Envelope<Row[]>>("/apps");
      return payload.data.map(toApplication);
    },
  });
}

export function useAppItems(appId: string | undefined) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.appItems(appId ?? ""),
    enabled: status === "ready" && !!appId,
    queryFn: async () => {
      const payload = await request<Envelope<Row[]>>(`/apps/${encodeURIComponent(appId!)}/items`);
      return payload.data.map(toRequestSummary) as RequestSummary[];
    },
  });
}

/** Requests across every active app. Backs the overview and "my requests". */
export function useAllItems(itemStatus?: ItemStatus, options?: { enabled?: boolean }) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.allItems(itemStatus),
    enabled: status === "ready" && options?.enabled !== false,
    queryFn: async () => {
      const query = itemStatus ? `?status=${itemStatus}` : "";
      const payload = await request<Envelope<Row[]>>(`/items${query}`);
      return payload.data.map(toRequestSummary) as CrossAppRequest[];
    },
  });
}

export function useRequest(id: string | undefined) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.request(id ?? ""),
    enabled: status === "ready" && !!id,
    retry: false,
    queryFn: async () => {
      const payload = await request<Envelope<Row & { children: Row[] }>>(`/items/${encodeURIComponent(id!)}`);
      return toRequestDetail(payload.data);
    },
  });
}

export function useSimilarRequests(appId: string, title: string) {
  const { request, status } = useAuth();
  const trimmed = title.trim();
  return useQuery({
    queryKey: queryKeys.similar(appId, trimmed.toLowerCase()),
    enabled: status === "ready" && !!appId && trimmed.length >= 3,
    staleTime: 60_000,
    queryFn: async () => {
      const payload = await request<Envelope<Row[]>>(
        `/apps/${encodeURIComponent(appId)}/items/similar?title=${encodeURIComponent(trimmed)}`,
      );
      return payload.data.map(toSimilarRequest) as SimilarRequest[];
    },
  });
}

export function useManagedApps(enabled: boolean) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.managedApps,
    enabled: enabled && status === "ready",
    queryFn: async () => {
      const payload = await request<Envelope<Row[]>>("/apps/manage");
      return payload.data.map(toManagedApplication) as ManagedApplication[];
    },
  });
}

export function useManagedUsers(enabled: boolean) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.users,
    enabled: enabled && status === "ready",
    queryFn: async () => {
      const payload = await request<Envelope<Row[]>>("/users");
      return payload.data.map(toManagedUser) as ManagedUser[];
    },
  });
}

/** The app ids a single user has been granted access to. Admin-only. */
export function useUserApps(userId: string | undefined, enabled: boolean) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.userApps(userId ?? ""),
    enabled: enabled && status === "ready" && !!userId,
    queryFn: async () => {
      const payload = await request<Envelope<string[]>>(`/users/${encodeURIComponent(userId!)}/apps`);
      return payload.data;
    },
  });
}

/** The user ids granted access to a single app. Admin-only. */
export function useAppUsers(appId: string | undefined, enabled: boolean) {
  const { request, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.appUsers(appId ?? ""),
    enabled: enabled && status === "ready" && !!appId,
    queryFn: async () => {
      const payload = await request<Envelope<string[]>>(`/apps/${encodeURIComponent(appId!)}/users`);
      return payload.data;
    },
  });
}

// --- Optimistic writes --------------------------------------------------------------------

type VoteInput = { id: string; voted: boolean };

/**
 * Voting is the lightest interaction in the product, so it updates instantly and rolls back on
 * failure. Every cached list and the detail view are patched together.
 */
export function useVote() {
  const client = useQueryClient();

  return useMutation({
    mutationKey: mutationKeys.vote,
    mutationFn: voteMutationFn,
    onMutate: async ({ id, voted }: VoteInput) => {
      await client.cancelQueries({ queryKey: ["items"] });
      await client.cancelQueries({ queryKey: queryKeys.request(id) });
      const previousLists = client.getQueriesData<RequestSummary[]>({ queryKey: ["items"] });
      const previousDetail = client.getQueryData<RequestDetail>(queryKeys.request(id));

      const patch = <T extends RequestSummary>(item: T): T =>
        item.id === id ? { ...item, voted: !voted, votes: item.votes + (voted ? -1 : 1) } : item;

      client.setQueriesData<RequestSummary[]>({ queryKey: ["items"] }, (list) => list?.map(patch));
      client.setQueryData<RequestDetail>(queryKeys.request(id), (detail) => (detail ? patch(detail) : detail));

      return { previousLists, previousDetail, id };
    },
    onError: (_error, _input, context) => {
      context?.previousLists.forEach(([key, value]) => client.setQueryData(key, value));
      if (context?.previousDetail) client.setQueryData(queryKeys.request(context.id), context.previousDetail);
    },
    onSettled: (_data, _error, { id }) => invalidateRequestData(client, id),
  });
}

/** Snapshots every cached list and the detail view for a request, so a failed optimistic
 *  write can be rolled back to exactly what was on screen before it. */
async function snapshotRequestCaches(client: QueryClient, id: string) {
  await client.cancelQueries({ queryKey: ["items"] });
  await client.cancelQueries({ queryKey: queryKeys.request(id) });
  return {
    previousLists: client.getQueriesData<RequestSummary[]>({ queryKey: ["items"] }),
    previousDetail: client.getQueryData<RequestDetail>(queryKeys.request(id)),
  };
}

function restoreRequestCaches(
  client: QueryClient,
  id: string,
  context: { previousLists: [readonly unknown[], RequestSummary[] | undefined][]; previousDetail?: RequestDetail } | undefined,
) {
  context?.previousLists.forEach(([key, value]) => client.setQueryData(key, value));
  if (context?.previousDetail) client.setQueryData(queryKeys.request(id), context.previousDetail);
}

/** Applies `patch` to a request wherever it's cached: every matching list and the detail view. */
function patchRequestCaches(client: QueryClient, id: string, patch: (item: RequestSummary) => RequestSummary) {
  client.setQueriesData<RequestSummary[]>({ queryKey: ["items"] }, (list) =>
    list?.map((item) => (item.id === id ? patch(item) : item)),
  );
  client.setQueryData<RequestDetail>(queryKeys.request(id), (detail) => (detail ? { ...detail, ...patch(detail) } : detail));
}

// --- Request writes -----------------------------------------------------------------------

/**
 * The id is generated by the caller (crypto.randomUUID()) rather than returned from the server,
 * so the optimistic insert below already has its real id — the caller can navigate straight to
 * /r/:id without waiting on a round trip, online or off. See api/router.ts's `clientId` schema.
 */
export function useCreateRequest() {
  const { profile } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.createRequest,
    mutationFn: createRequestMutationFn,
    onMutate: (input: CreateRequestInput) => {
      const previousLists = client.getQueriesData<RequestSummary[]>({ queryKey: ["items"] });
      const summary: RequestSummary = {
        id: input.id,
        appId: input.appId,
        title: input.title,
        description: input.description || null,
        type: input.type,
        status: "backlog",
        priority: input.priority,
        effort: input.effort,
        visibility: input.visibility,
        parentId: null,
        parentTitle: null,
        creatorId: profile?.id ?? "",
        creatorName: profile?.name ?? "",
        creatorAvatarUrl: profile?.avatarUrl ?? null,
        creatorRole: profile?.role ?? "user",
        votes: 0,
        voted: false,
        subtaskCount: 0,
        completedSubtasks: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      client.setQueriesData<RequestSummary[]>({ queryKey: ["items"] }, (list) => (list ? [summary, ...list] : list));
      client.setQueryData<RequestDetail>(queryKeys.request(input.id), { ...summary, children: [], checklist: [], parent: null });
      return { previousLists, id: input.id };
    },
    onError: (_error, _input, context) => {
      context?.previousLists.forEach(([key, value]) => client.setQueryData(key, value));
      if (context?.id) client.removeQueries({ queryKey: queryKeys.request(context.id) });
    },
    onSuccess: (_data, { id }) => invalidateRequestData(client, id),
  });
}

export function useUpdateRequest() {
  const client = useQueryClient();
  type Input = UpdateRequestInput;
  return useMutation({
    mutationKey: mutationKeys.updateRequest,
    mutationFn: updateRequestMutationFn,
    onMutate: async ({ id, relatedRequestId, ...changes }: Input) => {
      void relatedRequestId;
      const snapshot = await snapshotRequestCaches(client, id);
      patchRequestCaches(client, id, (item) => ({ ...item, ...changes }));
      return { ...snapshot, id };
    },
    onError: (_error, _input, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSettled: (_data, _error, { id, relatedRequestId }) => {
      invalidateRequestData(client, id);
      if (relatedRequestId) void client.invalidateQueries({ queryKey: queryKeys.request(relatedRequestId) });
    },
  });
}

export function useSetStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setStatus,
    mutationFn: setStatusMutationFn,
    onMutate: async ({ id, status }: { id: string; status: ItemStatus }) => {
      const snapshot = await snapshotRequestCaches(client, id);
      patchRequestCaches(client, id, (item) => ({ ...item, status }));
      return { ...snapshot, id };
    },
    onError: (_error, _input, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSettled: (_data, _error, { id }) => invalidateRequestData(client, id),
  });
}

export function useSetPriority() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setPriority,
    mutationFn: setPriorityMutationFn,
    onMutate: async ({ id, priority }: { id: string; priority: ItemPriority }) => {
      const snapshot = await snapshotRequestCaches(client, id);
      patchRequestCaches(client, id, (item) => ({ ...item, priority }));
      return { ...snapshot, id };
    },
    onError: (_error, _input, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSettled: (_data, _error, { id }) => invalidateRequestData(client, id),
  });
}

export function useSetVisibility() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setVisibility,
    mutationFn: setVisibilityMutationFn,
    onMutate: async ({ id, visibility }: { id: string; visibility: Visibility }) => {
      const snapshot = await snapshotRequestCaches(client, id);
      patchRequestCaches(client, id, (item) => ({ ...item, visibility }));
      return { ...snapshot, id };
    },
    onError: (_error, _input, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSettled: (_data, _error, { id }) => invalidateRequestData(client, id),
  });
}

export function useDeleteRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteRequest,
    mutationFn: deleteRequestMutationFn,
    onMutate: async (id: string) => {
      const snapshot = await snapshotRequestCaches(client, id);
      client.setQueriesData<RequestSummary[]>({ queryKey: ["items"] }, (list) => list?.filter((item) => item.id !== id));
      return { ...snapshot, id };
    },
    onError: (_error, _id, context) => restoreRequestCaches(client, context?.id ?? "", context),
    // Deliberately doesn't touch queryKeys.request(id): the deleted item's own detail page is
    // typically still mounted right here (navigating away on success, see request-detail.tsx),
    // and removing or invalidating an actively-observed query forces an immediate refetch —
    // which 404s, flips the page to "not found", and unmounts everything (including the confirm
    // dialog) before that navigation finishes. Left alone, it's just garbage-collected on unmount.
    onSuccess: () => invalidateRequestData(client),
  });
}

// --- Checklist writes -----------------------------------------------------------------------
// A checklist item is deliberately not a full request: no optimistic patch on create (its id
// comes from the server), but toggling/renaming/deleting patch the parent's cached detail
// directly since both id and requestId are already known client-side.

export function useCreateChecklistItem() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.createChecklistItem,
    mutationFn: createChecklistItemMutationFn,
    onMutate: ({ id, requestId, title }: CreateChecklistItemInput) => {
      const now = Date.now();
      const previous = patchChecklistCache(client, requestId, (list) => [
        ...list,
        { id, requestId, title, done: false, sortOrder: list.length, createdAt: now, updatedAt: now },
      ]);
      return { previous, requestId };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.request(context.requestId), context.previous);
    },
    onSettled: (_data, _error, { requestId }) => void client.invalidateQueries({ queryKey: queryKeys.request(requestId) }),
  });
}

type ChecklistPatchInput = UpdateChecklistItemInput;

function patchChecklistCache(client: QueryClient, requestId: string, patch: (list: RequestDetail["checklist"]) => RequestDetail["checklist"]) {
  const previous = client.getQueryData<RequestDetail>(queryKeys.request(requestId));
  client.setQueryData<RequestDetail>(queryKeys.request(requestId), (detail) =>
    detail ? { ...detail, checklist: patch(detail.checklist) } : detail,
  );
  return previous;
}

export function useUpdateChecklistItem() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.updateChecklistItem,
    mutationFn: updateChecklistItemMutationFn,
    onMutate: async ({ id, requestId, ...changes }: ChecklistPatchInput) => {
      await client.cancelQueries({ queryKey: queryKeys.request(requestId) });
      const previous = patchChecklistCache(client, requestId, (list) =>
        list.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
      );
      return { previous, requestId };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.request(context.requestId), context.previous);
    },
    onSettled: (_data, _error, { requestId }) => void client.invalidateQueries({ queryKey: queryKeys.request(requestId) }),
  });
}

export function useDeleteChecklistItem() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteChecklistItem,
    mutationFn: deleteChecklistItemMutationFn,
    onMutate: async ({ id, requestId }: { id: string; requestId: string }) => {
      await client.cancelQueries({ queryKey: queryKeys.request(requestId) });
      const previous = patchChecklistCache(client, requestId, (list) => list.filter((entry) => entry.id !== id));
      return { previous, requestId };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.request(context.requestId), context.previous);
    },
    onSettled: (_data, _error, { requestId }) => void client.invalidateQueries({ queryKey: queryKeys.request(requestId) }),
  });
}

// --- Profile, people, apps ------------------------------------------------------------------

export function useUpdateProfile() {
  const { request, setProfile } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; avatarUrl: string | null }) => {
      const payload = await request<Envelope<Profile>>("/me", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      return payload.data;
    },
    onSuccess: (profile) => {
      setProfile(profile);
      void client.invalidateQueries({ queryKey: ["items"] });
      void client.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useInviteUser() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.inviteUser,
    mutationFn: inviteUserMutationFn,
    onMutate: (input: InviteUserInput) => {
      const previous = client.getQueryData<ManagedUser[]>(queryKeys.users);
      const entry: ManagedUser = {
        id: input.id,
        email: input.email,
        name: input.name,
        avatarUrl: null,
        role: input.role,
        status: "pending",
        accessCount: 0,
      };
      client.setQueryData<ManagedUser[]>(queryKeys.users, (list) => (list ? [...list, entry] : list));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.users, context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useSetUserRole() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setUserRole,
    mutationFn: setUserRoleMutationFn,
    onMutate: ({ id, role }: { id: string; role: Role }) => {
      const previous = client.getQueryData<ManagedUser[]>(queryKeys.users);
      client.setQueryData<ManagedUser[]>(queryKeys.users, (list) => list?.map((user) => (user.id === id ? { ...user, role } : user)));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.users, context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useSetUserAccess() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setUserAccess,
    mutationFn: setUserAccessMutationFn,
    onMutate: ({ id, active }: { id: string; active: boolean }) => {
      const previous = client.getQueryData<ManagedUser[]>(queryKeys.users);
      // "linked" is the common case on restore; if the account was actually never signed in
      // (still "pending" before it got revoked), this briefly shows the wrong section until the
      // background refetch corrects it — an acceptable simplification for how rarely that happens.
      client.setQueryData<ManagedUser[]>(queryKeys.users, (list) =>
        list?.map((user) => (user.id === id ? { ...user, status: active ? "linked" : "revoked" } : user)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.users, context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useRemoveInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.removeInvitation,
    mutationFn: removeInvitationMutationFn,
    onMutate: (id: string) => {
      const previous = client.getQueryData<ManagedUser[]>(queryKeys.users);
      client.setQueryData<ManagedUser[]>(queryKeys.users, (list) => list?.filter((user) => user.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(queryKeys.users, context.previous);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

function invalidateApps(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.apps });
  void client.invalidateQueries({ queryKey: queryKeys.managedApps });
}

/** A grant change alters what the affected people can see, so refresh access, apps and items.
 *  It also changes each person's access count in the People roster, so refresh the user list too. */
function invalidateAccess(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ["access"] });
  void client.invalidateQueries({ queryKey: queryKeys.users });
  void client.invalidateQueries({ queryKey: queryKeys.apps });
  void client.invalidateQueries({ queryKey: ["items"] });
}

/** Replace the full set of apps a user may access (People settings). */
export function useSetUserApps() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setUserApps,
    mutationFn: setUserAppsMutationFn,
    onMutate: ({ userId, appIds }: { userId: string; appIds: string[] }) => {
      const previousUserApps = client.getQueryData<string[]>(queryKeys.userApps(userId));
      const previousUsers = client.getQueryData<ManagedUser[]>(queryKeys.users);
      client.setQueryData(queryKeys.userApps(userId), appIds);
      client.setQueryData<ManagedUser[]>(queryKeys.users, (list) =>
        list?.map((user) => (user.id === userId ? { ...user, accessCount: appIds.length } : user)),
      );
      return { previousUserApps, previousUsers };
    },
    onError: (_error, { userId }, context) => {
      if (context?.previousUserApps) client.setQueryData(queryKeys.userApps(userId), context.previousUserApps);
      if (context?.previousUsers) client.setQueryData(queryKeys.users, context.previousUsers);
    },
    onSettled: (_data, _error, { userId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.userApps(userId) });
      invalidateAccess(client);
    },
  });
}

/** Replace the full set of users who may access an app (App settings). */
export function useSetAppUsers() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.setAppUsers,
    mutationFn: setAppUsersMutationFn,
    onMutate: ({ appId, userIds }: { appId: string; userIds: string[] }) => {
      const previous = client.getQueryData<string[]>(queryKeys.appUsers(appId));
      client.setQueryData(queryKeys.appUsers(appId), userIds);
      return { previous };
    },
    onError: (_error, { appId }, context) => {
      if (context?.previous) client.setQueryData(queryKeys.appUsers(appId), context.previous);
    },
    onSettled: (_data, _error, { appId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.appUsers(appId) });
      invalidateAccess(client);
    },
  });
}

export function useCreateApp() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.createApp,
    mutationFn: createAppMutationFn,
    onMutate: (input: CreateAppInput) => {
      const previousManaged = client.getQueryData<ManagedApplication[]>(queryKeys.managedApps);
      const previousApps = client.getQueryData<Application[]>(queryKeys.apps);
      // The real sortOrder is server-computed (append-to-end); MAX_SAFE_INTEGER guarantees the
      // same visual result (sorts last) without needing to know the current max up front.
      const managedEntry: ManagedApplication = {
        id: input.id,
        name: input.name,
        logoUrl: input.logoUrl ?? null,
        description: input.description || null,
        sortOrder: Number.MAX_SAFE_INTEGER,
        isActive: true,
        itemCount: 0,
      };
      const appEntry: Application = {
        id: input.id,
        name: input.name,
        logoUrl: input.logoUrl ?? null,
        description: input.description || null,
        sortOrder: Number.MAX_SAFE_INTEGER,
        activeItemCount: 0,
      };
      client.setQueryData<ManagedApplication[]>(queryKeys.managedApps, (list) => (list ? [...list, managedEntry] : list));
      client.setQueryData<Application[]>(queryKeys.apps, (list) => (list ? [...list, appEntry] : list));
      return { previousManaged, previousApps };
    },
    onError: (_error, _input, context) => {
      if (context?.previousManaged) client.setQueryData(queryKeys.managedApps, context.previousManaged);
      if (context?.previousApps) client.setQueryData(queryKeys.apps, context.previousApps);
    },
    onSuccess: () => invalidateApps(client),
  });
}

export function useUpdateApp() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.updateApp,
    mutationFn: updateAppMutationFn,
    onMutate: ({ id, ...changes }: UpdateAppInput) => {
      const previousManaged = client.getQueryData<ManagedApplication[]>(queryKeys.managedApps);
      const previousApps = client.getQueryData<Application[]>(queryKeys.apps);
      client.setQueryData<ManagedApplication[]>(queryKeys.managedApps, (list) =>
        list?.map((app) => (app.id === id ? { ...app, ...changes } : app)),
      );
      // Reactivating an archived app isn't inserted here (its full Application shape isn't known
      // client-side) — it just reappears once the background refetch lands, same as an offline
      // reorder would.
      client.setQueryData<Application[]>(queryKeys.apps, (list) => {
        if (!list) return list;
        if (changes.isActive === false) return list.filter((app) => app.id !== id);
        return list.map((app) => (app.id === id ? { ...app, ...changes } : app));
      });
      return { previousManaged, previousApps };
    },
    onError: (_error, _input, context) => {
      if (context?.previousManaged) client.setQueryData(queryKeys.managedApps, context.previousManaged);
      if (context?.previousApps) client.setQueryData(queryKeys.apps, context.previousApps);
    },
    onSuccess: () => invalidateApps(client),
  });
}

export function useDeleteApp() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteApp,
    mutationFn: deleteAppMutationFn,
    onMutate: (id: string) => {
      const previousManaged = client.getQueryData<ManagedApplication[]>(queryKeys.managedApps);
      const previousApps = client.getQueryData<Application[]>(queryKeys.apps);
      client.setQueryData<ManagedApplication[]>(queryKeys.managedApps, (list) => list?.filter((app) => app.id !== id));
      client.setQueryData<Application[]>(queryKeys.apps, (list) => list?.filter((app) => app.id !== id));
      return { previousManaged, previousApps };
    },
    onError: (_error, _id, context) => {
      if (context?.previousManaged) client.setQueryData(queryKeys.managedApps, context.previousManaged);
      if (context?.previousApps) client.setQueryData(queryKeys.apps, context.previousApps);
    },
    onSuccess: () => invalidateApps(client),
  });
}

export type { Application, ManagedApplication, ManagedUser, RequestDetail, RequestSummary, Requester };
