import type {
  Application,
  ItemPriority,
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

export type ApiErrorCode =
  | "unauthorized"
  | "access_denied"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "conflict"
  | "payload_too_large"
  | "service_unavailable"
  | "internal_error"
  | "offline";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;

/** Builds an authenticated JSON requester bound to a Firebase ID-token supplier. */
export function createRequester(getToken: () => Promise<string>): Requester {
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      });
    } catch {
      throw new ApiError("offline", 0, "Network request failed.");
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      throw new ApiError(
        (payload?.error?.code as ApiErrorCode) ?? "internal_error",
        response.status,
        payload?.error?.message ?? `Request failed (${response.status}).`,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };
}

// --- Row coercion -------------------------------------------------------------------------
// libSQL returns loosely typed rows; these normalise them once at the boundary so the rest of
// the application works with real types.

type Row = Record<string, unknown>;

const str = (value: unknown) => String(value ?? "");
const nullableStr = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const num = (value: unknown) => Number(value ?? 0);
const bool = (value: unknown) => Boolean(Number(value ?? 0));

export function toRequestSummary(row: Row): RequestSummary & { appName?: string; appLogoUrl?: string | null } {
  return {
    id: str(row.id),
    appId: str(row.appId),
    title: str(row.title),
    description: nullableStr(row.description),
    type: str(row.type) as ItemType,
    status: str(row.status) as ItemStatus,
    priority: str(row.priority) as ItemPriority,
    visibility: str(row.visibility) as Visibility,
    parentId: nullableStr(row.parentId),
    parentTitle: nullableStr(row.parentTitle),
    creatorId: str(row.creatorId),
    creatorName: str(row.creatorName),
    creatorAvatarUrl: nullableStr(row.creatorAvatarUrl),
    creatorRole: str(row.creatorRole) === "admin" ? "admin" : "user",
    votes: num(row.votes),
    voted: bool(row.voted),
    subtaskCount: num(row.subtaskCount),
    completedSubtasks: num(row.completedSubtasks),
    createdAt: num(row.createdAt),
    updatedAt: num(row.updatedAt),
    ...(row.appName !== undefined ? { appName: str(row.appName), appLogoUrl: nullableStr(row.appLogoUrl) } : {}),
  };
}

export function toRequestDetail(row: Row & { children?: Row[] }): RequestDetail {
  const summary = toRequestSummary(row);
  return {
    ...summary,
    children: (row.children ?? []).map(toRequestSummary),
    parent: summary.parentId ? { id: summary.parentId, title: summary.parentTitle ?? "" } : null,
  };
}

export function toApplication(row: Row): Application {
  return {
    id: str(row.id),
    name: str(row.name),
    logoUrl: nullableStr(row.logoUrl),
    description: nullableStr(row.description),
    sortOrder: num(row.sortOrder),
    activeItemCount: num(row.activeItemCount),
  };
}

export function toManagedApplication(row: Row): ManagedApplication {
  return {
    id: str(row.id),
    name: str(row.name),
    logoUrl: nullableStr(row.logoUrl),
    description: nullableStr(row.description),
    sortOrder: num(row.sortOrder),
    isActive: bool(row.isActive),
    itemCount: num(row.itemCount),
  };
}

export function toManagedUser(row: Row): ManagedUser {
  return {
    id: str(row.id),
    email: str(row.email),
    name: str(row.name),
    avatarUrl: nullableStr(row.avatarUrl),
    role: str(row.role) === "admin" ? "admin" : "user",
    status: str(row.status) as ManagedUser["status"],
    accessCount: num(row.accessCount),
  };
}

export function toSimilarRequest(row: Row): SimilarRequest {
  return {
    id: str(row.id),
    title: str(row.title),
    type: str(row.type) as ItemType,
    votes: num(row.votes),
  };
}

export type { Application, ManagedApplication, ManagedUser, Profile, RequestDetail, RequestSummary, Role, SimilarRequest };
