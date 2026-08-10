"use client";

import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export function useOnlineStatus() {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
