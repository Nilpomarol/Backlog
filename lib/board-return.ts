"use client";

import { useEffect, useState } from "react";

/**
 * Remembers the single page the user was on immediately before the current one, so in-page
 * "back" links (breadcrumbs) return to wherever the user actually came from — a filtered board,
 * a parent task, a subtask, whatever — instead of a fixed destination. Updated globally on every
 * navigation (see AppShell in components/app-shell.tsx), not just from the board, so e.g.
 * subtask → parent → back correctly returns to the subtask rather than jumping to the board.
 *
 * This approximates one level of router.back() without the risk of leaving the app entirely
 * when the user arrived via a direct link or bookmark — browser back would exit the app in that
 * case, since there's no in-app history to go to; this always falls back to a safe in-app
 * destination instead.
 */
const KEY = "backlog:lastVisited";

export function rememberVisitedUrl(url: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, url);
  } catch {
    // Storage can be unavailable (private browsing, quota) — losing this nicety is fine.
  }
}

function readVisitedUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Resolves to the given app's board on first (server) render, then swaps in the remembered
 *  previous page after mount if one exists — avoids a hydration mismatch from reading
 *  sessionStorage during render. */
export function useBackHref(appId: string) {
  const fallback = `/a/${encodeURIComponent(appId)}`;
  const [href, setHref] = useState(fallback);

  useEffect(() => {
    // Deliberately client-only: sessionStorage isn't available during SSR, and reading it
    // during render (rather than after mount) would make the server and client's first render
    // disagree, which React flags as a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(readVisitedUrl() ?? fallback);
    // fallback is derived from appId, so appId alone is the real dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  return href;
}
