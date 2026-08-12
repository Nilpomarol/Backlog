"use client";

import {
  createElement,
  useMemo,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { markRouteTransitionEnd, markRouteTransitionStart } from "./route-transition";

const NAVIGATION_EVENT = "backlog:navigation";
const STATE_KEY = "backlogNavigation";

type NavigationMeta = {
  href: string;
  fromHref: string | null;
  index: number;
  overlay?: string;
};

type NavigationState = Record<string, unknown> & { [STATE_KEY]?: NavigationMeta };

function relativeUrl(url: Pick<Location, "pathname" | "search" | "hash"> = window.location) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function currentUrl() {
  return relativeUrl();
}

function serverUrl() {
  return "/";
}

function stateWithMeta(meta: NavigationMeta): NavigationState {
  return { ...(window.history.state ?? {}), [STATE_KEY]: meta };
}

function currentMeta(): NavigationMeta {
  const state = window.history.state as NavigationState | null;
  return state?.[STATE_KEY] ?? { href: currentUrl(), fromHref: null, index: 0 };
}

function emitNavigation() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(NAVIGATION_EVENT, listener);
  };
}

type NavigateOptions = { replace?: boolean; scroll?: boolean };

function commitNavigation(href: string, options: NavigateOptions = {}) {
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }

  const relative = relativeUrl(target);
  const current = currentUrl();
  if (relative === current) {
    markRouteTransitionEnd();
    return;
  }

  markRouteTransitionStart();
  const previous = currentMeta();
  const samePath = target.pathname === window.location.pathname;
  const overlayNavigation = !!previous.overlay && !options.replace;
  const replace = !!options.replace || overlayNavigation;
  const meta: NavigationMeta = options.replace
    ? {
        ...previous,
        href: relative,
        // Query-string edits inside a sheet remain part of that sheet's history entry. A real
        // route replacement consumes the overlay marker.
        overlay: samePath ? previous.overlay : undefined,
      }
    : {
        href: relative,
        fromHref: current,
        index: previous.index + 1,
      };

  if (replace) window.history.replaceState(stateWithMeta(meta), "", relative);
  else window.history.pushState(stateWithMeta(meta), "", relative);
  emitNavigation();
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "auto" });
  markRouteTransitionEnd();
}

export function navigate(href: string, options?: NavigateOptions) {
  commitNavigation(href, options);
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

/** The route that led to the current history entry, kept per entry rather than globally. */
export function usePreviousHref() {
  useSyncExternalStore(subscribe, currentUrl, serverUrl);
  if (typeof window === "undefined") return null;
  return currentMeta().fromHref;
}

/**
 * Marks a same-URL history entry as belonging to an overlay. Real navigations replace this
 * temporary entry, so sheets never leave an inert extra Back step behind.
 */
export function pushOverlayHistory(token: string) {
  const meta = currentMeta();
  window.history.pushState(stateWithMeta({ ...meta, overlay: token }), "");
}

export function isOverlayHistory(token: string) {
  return currentMeta().overlay === token;
}

export function stripOverlayHistory(token: string) {
  const meta = currentMeta();
  if (meta.overlay !== token) return;
  const rest = { ...meta };
  delete rest.overlay;
  window.history.replaceState(stateWithMeta(rest), "");
}

/** Removes the current page from the usable Back path, primarily after destructive deletion. */
export function discardNavigation(href: string) {
  const target = relativeUrl(new URL(href, window.location.href));
  const meta = currentMeta();
  if (meta.overlay) {
    // The dialog's React cleanup must not issue its own history.back() while this navigation is
    // already consuming the temporary entry.
    stripOverlayHistory(meta.overlay);
    if (meta.fromHref === target) {
      window.history.go(-2);
      return;
    }
    window.addEventListener(
      "popstate",
      () => commitNavigation(target, { replace: true }),
      { once: true },
    );
    window.history.back();
    return;
  }
  if (meta.fromHref === target) window.history.back();
  else commitNavigation(target, { replace: true });
}

export function useRouter() {
  return useMemo(
    () => ({
      push: (href: string, options?: { scroll?: boolean }) => commitNavigation(href, options),
      replace: (href: string, options?: { scroll?: boolean }) =>
        commitNavigation(href, { ...options, replace: true }),
      back: () => window.history.back(),
      /**
       * Removes a task from the usable Back path after deletion. If the task was reached from
       * its board, skip both the confirmation overlay and task entries; direct links safely
       * replace the task entry after first consuming the overlay.
       */
      discard: discardNavigation,
      refresh: () => emitNavigation(),
    }),
    [],
  );
}

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
};

/** The sole internal-link implementation; external, download, modified, and hash clicks stay native. */
export function Link({ href, replace, scroll, onClick, ...props }: LinkProps) {
  function handleClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target ||
      props.download ||
      href.startsWith("#")
    ) {
      return;
    }
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) return;
    event.preventDefault();
    commitNavigation(target.href, { replace, scroll });
  }

  return createElement("a", { href, onClick: handleClick, ...props });
}
