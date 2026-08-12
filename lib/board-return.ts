"use client";

import { usePreviousHref } from "./local-navigation";

/** A safe contextual Back target stored on the current browser-history entry. */
export function useBackHref(appId: string) {
  const fallback = `/a/${encodeURIComponent(appId)}`;
  const previous = usePreviousHref();
  if (!previous || previous === window.location.pathname + window.location.search + window.location.hash) return fallback;
  return previous.startsWith("/") && !previous.startsWith("//") ? previous : fallback;
}
