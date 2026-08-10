"use client";

import { useMemo, useSyncExternalStore } from "react";
import { markRouteTransitionEnd, markRouteTransitionStart } from "./route-transition";

const NAVIGATION_EVENT = "backlog:navigation";

function currentUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function serverUrl() {
  return "/";
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(NAVIGATION_EVENT, listener);
  };
}

function commitNavigation(href: string, replace: boolean) {
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }

  markRouteTransitionStart();
  const relative = `${target.pathname}${target.search}${target.hash}`;
  if (replace) window.history.replaceState(window.history.state, "", relative);
  else window.history.pushState(window.history.state, "", relative);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo({ top: 0, behavior: "auto" });
  markRouteTransitionEnd();
}

export function navigate(href: string, options?: { replace?: boolean }) {
  commitNavigation(href, options?.replace ?? false);
}

export function usePathname() {
  const url = useSyncExternalStore(subscribe, currentUrl, serverUrl);
  return url.split(/[?#]/, 1)[0] || "/";
}

export function useSearchParams() {
  const url = useSyncExternalStore(subscribe, currentUrl, serverUrl);
  const search = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#", 1)[0] : "";
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRouter() {
  return useMemo(
    () => ({
      push: (href: string, options?: { scroll?: boolean }) => {
        void options;
        commitNavigation(href, false);
      },
      replace: (href: string, options?: { scroll?: boolean }) => {
        void options;
        commitNavigation(href, true);
      },
      back: () => window.history.back(),
      refresh: () => window.dispatchEvent(new Event(NAVIGATION_EVENT)),
    }),
    [],
  );
}

/**
 * Next/Vinext links normally fetch an RSC payload before changing routes. Capturing local links
 * here turns the application into a route-independent client shell, so navigation never depends
 * on a network response and the same cached document can boot every route.
 */
export function installLocalLinkNavigation() {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    commitNavigation(url.href, false);
  };

  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
