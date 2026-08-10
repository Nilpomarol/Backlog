"use client";

import { useEffect } from "react";

/** Registered only in production so the cache never fights the dev server's HMR. */
export function ServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
