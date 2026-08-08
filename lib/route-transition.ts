/**
 * Tracks whether an app-router navigation is currently in flight, including back/forward —
 * vinext resolves those via an async RSC round-trip rather than an instant client-side
 * transition, so the existing top loading bar (previously wired only to React Query's
 * background refetches) had no signal for that gap at all. Fed by `instrumentation-client.ts`'s
 * `onRouterTransitionStart`; cleared once the new route actually commits (see AppShell) or,
 * failing that, by the safety timeout below so the bar can never get stuck on indefinitely.
 */
const STUCK_TIMEOUT_MS = 2500;

let pending = false;
let timeoutId: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function markRouteTransitionStart() {
  if (!pending) {
    pending = true;
    emit();
  }
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    timeoutId = null;
    markRouteTransitionEnd();
  }, STUCK_TIMEOUT_MS);
}

export function markRouteTransitionEnd() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (!pending) return;
  pending = false;
  emit();
}

export function isRouteTransitionPending() {
  return pending;
}

export function subscribeRouteTransition(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
