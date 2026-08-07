"use client";

import { CircleCheck, Lock, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAllItems, useErrorMessage, useSetStatus, useSetVisibility } from "../../lib/queries";
import { useAuth, useT } from "../providers";
import { RequestRow } from "../request-card";
import { Button, SkeletonList } from "../ui/primitives";
import { EmptyState, ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";

export function InboxPage() {
  const t = useT();
  const router = useRouter();
  const { profile, status: authStatus } = useAuth();
  const isAdmin = profile?.role === "admin";

  // Triage is an administrator surface; members are returned to their overview.
  useEffect(() => {
    if (authStatus === "ready" && !isAdmin) router.replace("/");
  }, [authStatus, isAdmin, router]);

  // Shares the sidebar's cross-app query rather than issuing a second, narrower one.
  const { data: items, isPending, isError, error, refetch } = useAllItems();
  const describeError = useErrorMessage();
  const setStatus = useSetStatus();
  const setVisibility = useSetVisibility();
  const { toast } = useToast();

  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.status === "backlog")
        .sort((a, b) => b.votes - a.votes || b.updatedAt - a.updatedAt),
    [items],
  );

  // Derived rather than pruned in an effect: a row that leaves the list simply deselects.
  const activeSelection = useMemo(
    () => selected.filter((id) => list.some((item) => item.id === id)),
    [selected, list],
  );

  const onError = (failure: unknown) => toast(describeError(failure), { tone: "error" });

  function move(id: string, status: "in_progress" | "discarded") {
    setStatus.mutate(
      { id, status },
      {
        onError,
        onSuccess: () =>
          toast(status === "discarded" ? t.toastDiscarded : t.toastStatusChanged, {
            actionLabel: t.undo,
            onAction: () => setStatus.mutate({ id, status: "backlog" }, { onError }),
          }),
      },
    );
  }

  async function bulk(action: (id: string) => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      for (const id of activeSelection) await action(id);
      toast(message);
      setSelected([]);
    } catch (failure) {
      onError(failure);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h1 className="t-display">{t.inboxTitle}</h1>
        <p className="page-subtitle">{t.inboxSubtitle}</p>
      </header>

      {isError ? (
        <ErrorState
          title={t.errorLoading}
          message={describeError(error)}
          onRetry={() => void refetch()}
          retryLabel={t.retry}
        />
      ) : isPending ? (
        <SkeletonList count={5} label={t.loading} />
      ) : list.length === 0 ? (
        <EmptyState icon={CircleCheck} tone="success" title={t.nothingToTriage} body={t.nothingToTriageBody} />
      ) : (
        <>
          <div className="request-list">
            {list.map((item) => (
              <RequestRow
                key={item.id}
                request={item}
                appLabel={item.appName}
                appLogoUrl={item.appLogoUrl}
                selectLabel={t.selectRequest}
                selected={activeSelection.includes(item.id)}
                onSelect={(checked) =>
                  setSelected((current) => (checked ? [...current, item.id] : current.filter((id) => id !== item.id)))
                }
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Play size={14} aria-hidden="true" />}
                      onClick={() => move(item.id, "in_progress")}
                    >
                      {t.start}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() => move(item.id, "discarded")}
                    >
                      {t.discard}
                    </Button>
                  </>
                }
              />
            ))}
          </div>

          {activeSelection.length > 0 && (
            <div className="bulk-bar" role="region" aria-label={t.bulkActions}>
              <span className="bulk-bar-count">{t.selectedCount(activeSelection.length)}</span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                icon={<Play size={14} aria-hidden="true" />}
                onClick={() =>
                  void bulk((id) => setStatus.mutateAsync({ id, status: "in_progress" }), t.toastStatusChanged)
                }
              >
                {t.start}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                icon={<Trash2 size={14} aria-hidden="true" />}
                onClick={() => void bulk((id) => setStatus.mutateAsync({ id, status: "discarded" }), t.toastDiscarded)}
              >
                {t.discard}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                icon={<Lock size={14} aria-hidden="true" />}
                onClick={() =>
                  void bulk(
                    (id) => setVisibility.mutateAsync({ id, visibility: "internal" }),
                    t.toastVisibilityChanged,
                  )
                }
              >
                {t.makeInternal}
              </Button>
              <span className="toolbar-spacer" />
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                {t.clearSelection}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
