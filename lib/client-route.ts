export type ClientRoute =
  | { kind: "overview" }
  | { kind: "mine" }
  | { kind: "app"; appId: string; compose: boolean }
  | { kind: "request"; requestId: string }
  | { kind: "settings-profile" }
  | { kind: "settings-people" }
  | { kind: "settings-apps" }
  | { kind: "not-found" };

function decoded(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Pure route matching keeps the cached document independent from server/RSC routing. */
export function clientRoute(pathname: string): ClientRoute {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/") return { kind: "overview" };
  if (normalized === "/mine") return { kind: "mine" };
  if (normalized === "/settings" || normalized === "/settings/profile") return { kind: "settings-profile" };
  if (normalized === "/settings/apps") return { kind: "settings-apps" };
  if (normalized === "/settings/people") return { kind: "settings-people" };

  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] === "a" && parts[1] && parts.length === 2) {
    return { kind: "app", appId: decoded(parts[1]), compose: false };
  }
  if (parts[0] === "a" && parts[1] && parts[2] === "new" && parts.length === 3) {
    return { kind: "app", appId: decoded(parts[1]), compose: true };
  }
  if (parts[0] === "r" && parts[1] && parts.length === 2) {
    return { kind: "request", requestId: decoded(parts[1]) };
  }
  return { kind: "not-found" };
}
