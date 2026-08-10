"use client";

import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useOnlineStatus } from "../lib/connectivity";
import { clearSyncIssues, listSyncIssues, removeSyncIssue, subscribeSyncIssues, type SyncIssue } from "../lib/idb-storage";
import { useAuth, useT } from "./providers";
import { Button } from "./ui/primitives";

export function SyncStatus() {
  const t = useT();
  const online = useOnlineStatus();
  const client = useQueryClient();
  const { profile } = useAuth();
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [busy, setBusy] = useState(false);

  const mutationStates = useMutationState({
    filters: { predicate: (mutation) => mutation.options.mutationKey?.[0] === "offline-mutation" },
    select: (mutation) => ({ status: mutation.state.status, paused: mutation.state.isPaused }),
  });
  const queued = mutationStates.filter((state) => state.paused).length;
  const syncing = mutationStates.filter((state) => state.status === "pending" && !state.paused).length;
  const conflictCount = issues.filter((issue) => issue.code === "conflict").length;

  useEffect(() => {
    let active = true;
    const load = () => {
      if (!profile) return Promise.resolve([] as SyncIssue[]);
      return listSyncIssues(profile.id);
    };
    void load().then((next) => {
      if (active) setIssues(next);
    });
    const unsubscribe = subscribeSyncIssues(() => {
      void load().then((next) => {
        if (active) setIssues(next);
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [profile]);

  async function retryRejected() {
    if (!online || busy) return;
    setBusy(true);
    try {
      for (const issue of issues) {
        try {
          const variables =
            issue.code === "conflict" && typeof issue.variables === "object" && issue.variables
              ? { ...issue.variables, baseUpdatedAt: undefined }
              : issue.variables;
          await client.getMutationCache().build(client, { mutationKey: issue.mutationKey }).execute(variables);
          await removeSyncIssue(issue.id);
        } catch {
          break;
        }
      }
      if (profile) setIssues(await listSyncIssues(profile.id));
    } finally {
      setBusy(false);
    }
  }

  async function discardLocalChanges() {
    if (!profile || !online || busy) return;
    setBusy(true);
    try {
      await clearSyncIssues(profile.id);
      await client.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }

  if (online && queued === 0 && syncing === 0 && issues.length === 0) return null;

  return (
    <div className={`sync-bar${issues.length > 0 ? " sync-bar-error" : ""}`} role="status">
      <span className="sync-bar-message">
        {issues.length > 0 ? (
          <AlertTriangle size={15} aria-hidden="true" />
        ) : !online ? (
          <CloudOff size={15} aria-hidden="true" />
        ) : (
          <RefreshCw size={15} className={syncing > 0 ? "spin" : undefined} aria-hidden="true" />
        )}
        {issues.length > 0
          ? conflictCount > 0
            ? t.syncConflicts(conflictCount)
            : t.syncFailed(issues.length)
          : !online
            ? queued > 0
              ? t.syncOfflineQueued(queued)
              : t.errorOffline
            : syncing > 0
              ? t.syncingChanges(syncing)
              : t.syncQueued(queued)}
      </span>
      {issues.length > 0 && (
        <span className="sync-bar-actions">
          <Button size="sm" variant="secondary" loading={busy} disabled={!online} onClick={() => void retryRejected()}>
            {conflictCount > 0 ? t.keepLocalChanges : t.retrySync}
          </Button>
          <Button size="sm" variant="ghost" disabled={!online || busy} onClick={() => void discardLocalChanges()}>
            {t.useServerVersion}
          </Button>
        </span>
      )}
    </div>
  );
}
