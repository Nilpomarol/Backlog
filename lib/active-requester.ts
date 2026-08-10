import type { Requester } from "./api";

let activeRequester: Requester | null = null;

/**
 * Updated whenever the authenticated fetcher changes (sign-in, account switch). Offline-queueable
 * mutations read through this instead of closing over a hook-scoped `request`, so a mutation
 * resumed after a page reload — when the component that originally called it no longer exists —
 * can still execute.
 */
export function setActiveRequester(requester: Requester) {
  activeRequester = requester;
}

export function getActiveRequester(): Requester {
  if (!activeRequester) throw new Error("No authenticated request available yet.");
  return activeRequester;
}
