export type ClientRoute =
  | { kind: "overview" }
  | { kind: "mine" }
  | { kind: "app"; appId: string }
  | { kind: "request"; requestId: string }
  | { kind: "settings-profile" }
  | { kind: "settings-people" }
  | { kind: "settings-apps" };

function decoded(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Pure route matching keeps the cached document independent from server/RSC routing. */
export function clientRoute(pathname: string): ClientRoute {
  if (pathname === "/mine") return { kind: "mine" };
  if (pathname === "/settings/apps") return { kind: "settings-apps" };
  if (pathname === "/settings/people") return { kind: "settings-people" };
  if (pathname.startsWith("/settings")) return { kind: "settings-profile" };

  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "a" && parts[1]) return { kind: "app", appId: decoded(parts[1]) };
  if (parts[0] === "r" && parts[1]) return { kind: "request", requestId: decoded(parts[1]) };
  return { kind: "overview" };
}
