import { markRouteTransitionStart } from "./lib/route-transition";

/**
 * vinext's (and Next.js's) client instrumentation hook: called at the start of every app-router
 * navigation, including browser back/forward. Wired to the shell's loading bar via
 * lib/route-transition.ts — see AppShell in components/app-shell.tsx for where it's cleared.
 */
export function onRouterTransitionStart() {
  markRouteTransitionStart();
}
