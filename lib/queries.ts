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
import type {
  Application,
  ItemStatus,
  ItemType,
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

/** Requests across every active app. Backs the overview, triage inbox and "my requests". */
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
  const { request } = useAuth();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, voted }: VoteInput) => {
      await request(`/items/${encodeURIComponent(id)}/vote`, { method: voted ? "DELETE" : "POST" });
    },
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

export function useCreateRequest() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      appId: string;
      title: string;
      description: string;
      type: ItemType;
      visibility: Visibility;
    }) => {
      const payload = await request<Envelope<{ id: string }>>("/items", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return payload.data;
    },
    onSuccess: () => invalidateRequestData(client),
  });
}

export function useUpdateRequest() {
  const { request } = useAuth();
  const client = useQueryClient();
  type Input = {
    id: string;
    appId?: string;
    title?: string;
    description?: string | null;
    type?: ItemType;
  };
  return useMutation({
    mutationFn: async ({ id, ...changes }: Input) => {
      await request(`/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
    },
    onMutate: async ({ id, ...changes }: Input) => {
      const snapshot = await snapshotRequestCaches(client, id);
      patchRequestCaches(client, id, (item) => ({ ...item, ...changes }));
      return { ...snapshot, id };
    },
    onError: (_error, _input, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSettled: (_data, _error, { id }) => invalidateRequestData(client, id),
  });
}

export function useSetStatus() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ItemStatus }) => {
      await request(`/items/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onMutate: async ({ id, status }: { id: string; status: ItemStatus }) => {
      const snapshot = await snapshotRequestCaches(client, id);
      patchRequestCaches(client, id, (item) => ({ ...item, status }));
      return { ...snapshot, id };
    },
    onError: (_error, _input, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSettled: (_data, _error, { id }) => invalidateRequestData(client, id),
  });
}

export function useSetVisibility() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: Visibility }) => {
      await request(`/items/${encodeURIComponent(id)}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ visibility }),
      });
    },
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
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await request(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    onMutate: async (id: string) => {
      const snapshot = await snapshotRequestCaches(client, id);
      client.setQueriesData<RequestSummary[]>({ queryKey: ["items"] }, (list) => list?.filter((item) => item.id !== id));
      return { ...snapshot, id };
    },
    onError: (_error, _id, context) => restoreRequestCaches(client, context?.id ?? "", context),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: queryKeys.request(id) });
      invalidateRequestData(client);
    },
  });
}

// --- Child (subtask) card writes ------------------------------------------------------------

/** Creates a linked subtask card under a parent request. No optimistic patch — the new card's
 *  id comes from the server, and it needs a full row (status, votes, etc.) to render. */
export function useCreateChildRequest() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, title }: { requestId: string; title: string }) => {
      const payload = await request<Envelope<{ id: string }>>(`/items/${encodeURIComponent(requestId)}/children`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      return payload.data;
    },
    onSuccess: (_data, { requestId }) => invalidateRequestData(client, requestId),
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
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; name: string; role: Role }) => {
      await request("/users/invitations", { method: "POST", body: JSON.stringify(input) });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useSetUserRole() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      await request(`/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useSetUserAccess() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await request(`/users/${encodeURIComponent(id)}/access`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useRemoveInvitation() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await request(`/users/${encodeURIComponent(id)}/invitation`, { method: "DELETE" });
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
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, appIds }: { userId: string; appIds: string[] }) => {
      await request(`/users/${encodeURIComponent(userId)}/apps`, { method: "PUT", body: JSON.stringify({ appIds }) });
    },
    onSuccess: (_data, { userId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.userApps(userId) });
      invalidateAccess(client);
    },
  });
}

/** Replace the full set of users who may access an app (App settings). */
export function useSetAppUsers() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ appId, userIds }: { appId: string; userIds: string[] }) => {
      await request(`/apps/${encodeURIComponent(appId)}/users`, { method: "PUT", body: JSON.stringify({ userIds }) });
    },
    onSuccess: (_data, { appId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.appUsers(appId) });
      invalidateAccess(client);
    },
  });
}

export function useCreateApp() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; logoUrl?: string | null; description: string }) => {
      await request("/apps", { method: "POST", body: JSON.stringify(input) });
    },
    onSuccess: () => invalidateApps(client),
  });
}

export function useUpdateApp() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...changes
    }: {
      id: string;
      name?: string;
      logoUrl?: string | null;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    }) => {
      await request(`/apps/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
    },
    onSuccess: () => invalidateApps(client),
  });
}

export function useDeleteApp() {
  const { request } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await request(`/apps/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    onSuccess: () => invalidateApps(client),
  });
}

export type { Application, ManagedApplication, ManagedUser, RequestDetail, RequestSummary, Requester };
