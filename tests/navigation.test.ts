import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discardNavigation,
  navigate,
  pushOverlayHistory,
} from "../lib/local-navigation";

type Entry = { url: string; state: Record<string, unknown> | null };
type Listener = { callback: EventListener; once: boolean };

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function installBrowser(pathname: string) {
  let url = new URL(pathname, "https://backlog.test");
  let index = 0;
  const entries: Entry[] = [{ url: url.href, state: null }];
  const listeners = new Map<string, Listener[]>();
  const scrollTo = vi.fn();

  const location = {
    get href() {
      return url.href;
    },
    get pathname() {
      return url.pathname;
    },
    get search() {
      return url.search;
    },
    get hash() {
      return url.hash;
    },
    get origin() {
      return url.origin;
    },
    assign(next: string) {
      url = new URL(next, url);
    },
  };

  function update(next?: string | URL | null) {
    if (next) url = new URL(String(next), url);
  }

  function dispatch(type: string) {
    const event = new Event(type);
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener.callback(event);
      if (listener.once) listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  }

  const history = {
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    pushState(state: Record<string, unknown>, _title: string, next?: string | URL | null) {
      update(next);
      entries.splice(index + 1, entries.length, { url: url.href, state });
      index += 1;
    },
    replaceState(state: Record<string, unknown>, _title: string, next?: string | URL | null) {
      update(next);
      entries[index] = { url: url.href, state };
    },
    go(delta: number) {
      const next = Math.max(0, Math.min(entries.length - 1, index + delta));
      if (next === index) return;
      index = next;
      url = new URL(entries[index].url);
      dispatch("popstate");
    },
    back() {
      history.go(-1);
    },
  };

  const browser = {
    location,
    history,
    scrollTo,
    addEventListener(type: string, callback: EventListener, options?: AddEventListenerOptions | boolean) {
      const once = typeof options === "object" && !!options.once;
      listeners.set(type, [...(listeners.get(type) ?? []), { callback, once }]);
    },
    removeEventListener(type: string, callback: EventListener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry.callback !== callback));
    },
    dispatchEvent(event: Event) {
      dispatch(event.type);
      return true;
    },
  };

  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  return { entries, history, location, scrollTo };
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("local navigation history", () => {
  it("replaces a temporary overlay entry when navigation leaves the sheet", () => {
    const browser = installBrowser("/a/atlas");
    pushOverlayHistory("composer");

    navigate("/r/new-request");

    expect(browser.history.length).toBe(2);
    expect(browser.location.pathname).toBe("/r/new-request");
    const navigation = browser.history.state!.backlogNavigation as Record<string, unknown>;
    expect(navigation).toMatchObject({
      href: "/r/new-request",
      fromHref: "/a/atlas",
    });
    expect(navigation).not.toHaveProperty("overlay");
    browser.history.back();
    expect(browser.location.pathname).toBe("/a/atlas");
  });

  it("stores the contextual back target on every task entry", () => {
    const browser = installBrowser("/r/parent");
    navigate("/r/child");

    expect(browser.history.state!.backlogNavigation).toMatchObject({ fromHref: "/r/parent" });
  });

  it("honours scroll false for URL-backed board filters", () => {
    const browser = installBrowser("/a/atlas");
    navigate("?view=list", { replace: true, scroll: false });

    expect(browser.location.search).toBe("?view=list");
    expect(browser.scrollTo).not.toHaveBeenCalled();
  });

  it("skips both the deleted task and confirmation overlay when returning to its board", () => {
    const browser = installBrowser("/a/atlas");
    navigate("/r/deleted");
    pushOverlayHistory("confirm-delete");

    discardNavigation("/a/atlas");

    expect(browser.location.pathname).toBe("/a/atlas");
    browser.history.back();
    expect(browser.location.pathname).toBe("/a/atlas");
  });
});
