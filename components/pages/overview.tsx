"use client";

import { ArrowRight, Inbox, Plus, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { ACTIVE_STATUSES, BOARD_STATUSES, type Application, type ItemStatus, type RequestSummary } from "../../lib/domain";
import { statusLabels } from "../../lib/i18n";
import { Link } from "../../lib/local-navigation";
import { useAllItems, useApps, useErrorMessage, type CrossAppRequest } from "../../lib/queries";
import { PriorityChip, StatusDot, TypeChip } from "../badges";
import { useAuth, useLanguage, useT } from "../providers";
import { NewRequestSheet } from "./new-request";
import { AppIcon, Button, IconButton, SkeletonList } from "../ui/primitives";
import { EmptyState, ErrorState } from "../ui/states";

/** Cards shown per column before the rest collapse into a "+N more" link to the real board. */
const MAX_PER_COLUMN = 4;

function byVotes(a: RequestSummary, b: RequestSummary) {
  return b.votes - a.votes || b.updatedAt - a.updatedAt;
}

function MiniCard({ request }: { request: RequestSummary }) {
  return (
    <Link href={`/r/${encodeURIComponent(request.id)}`} className="mini-card">
      <span className="mini-card-badges">
        {request.priority !== "none" && <PriorityChip priority={request.priority} iconOnly size={11} />}
        <TypeChip type={request.type} iconOnly size={11} />
      </span>
      <span className="mini-card-title">{request.title}</span>
      {request.votes > 0 && <span className="mini-card-votes">{request.votes}</span>}
    </Link>
  );
}

/** One status's count across every app the user can see — the home page's at-a-glance KPI row. */
function KpiTile({ status, count }: { status: ItemStatus; count: number }) {
  const { language } = useLanguage();
  return (
    <div className="kpi-tile">
      <span className="kpi-value">{count}</span>
      <span className="kpi-label">
        <StatusDot status={status} />
        {statusLabels[language][status]}
      </span>
    </div>
  );
}

/** A compact preview of one app's board: the same four workflow columns as the real board,
 *  trimmed to a handful of cards each — enough to see what's moving without leaving the page. */
function AppBoard({
  app,
  items,
  onAddRequest,
}: {
  app: Application;
  items: RequestSummary[];
  onAddRequest: (appId: string) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const href = `/a/${encodeURIComponent(app.id)}`;

  const columns = BOARD_STATUSES.map((status) => ({
    status,
    items: items.filter((item) => item.status === status).sort(byVotes),
  })).filter((column) => column.items.length > 0);

  return (
    <section className="app-board">
      <div className="app-board-header">
        <Link href={href} className="app-board-title-group">
          <AppIcon name={app.name} logoUrl={app.logoUrl} className="page-app-icon" />
          <span className="app-board-title-text">
            <span className="app-board-name">{app.name}</span>
            <span className="app-board-stat">
              {app.activeItemCount} {t.activeShort}
            </span>
          </span>
        </Link>
        <div className="app-board-actions">
          <IconButton label={t.newRequest} onClick={() => onAddRequest(app.id)}>
            <Plus size={16} aria-hidden="true" />
          </IconButton>
          <Link href={href} className="btn btn-secondary btn-sm">
            {t.seeApp}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="app-board-empty">
          <span>{t.appBoardEmpty}</span>
          <Button variant="secondary" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => onAddRequest(app.id)}>
            {t.newRequest}
          </Button>
        </div>
      ) : (
        <div className="board" style={{ ["--board-columns" as string]: columns.length }}>
          {columns.map(({ status, items: columnItems }) => (
            <section className={`board-column board-column-${status}`} key={status}>
              <div className="column-header">
                <StatusDot status={status} />
                <span className="column-heading">
                  <span className="column-title">{statusLabels[language][status]}</span>
                </span>
                <span className="column-count">{columnItems.length}</span>
              </div>
              <div className="card-stack">
                {columnItems.slice(0, MAX_PER_COLUMN).map((item) => (
                  <MiniCard key={item.id} request={item} />
                ))}
                {columnItems.length > MAX_PER_COLUMN && (
                  <Link href={href} className="mini-card-more">
                    {t.moreCount(columnItems.length - MAX_PER_COLUMN)}
                  </Link>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export function OverviewPage() {
  const t = useT();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: apps, isPending: appsPending, isError: appsError, error: appsErrorValue, refetch: refetchApps } = useApps();
  const { data: items, isPending: itemsPending, isError: itemsError, error: itemsErrorValue, refetch: refetchItems } = useAllItems();
  const describeError = useErrorMessage();

  const list = items ?? [];
  const byApp = useMemo(() => {
    const map = new Map<string, CrossAppRequest[]>();
    for (const item of items ?? []) {
      const bucket = map.get(item.appId);
      if (bucket) bucket.push(item);
      else map.set(item.appId, [item]);
    }
    return map;
  }, [items]);

  const mineOpenCount = list.filter(
    (item) => item.creatorId === profile?.id && ACTIVE_STATUSES.includes(item.status),
  ).length;

  // Adding a request from the overview opens the sheet right here instead of navigating to the
  // app's board — the overview is a cross-app landing page, so submitting should leave you on it.
  const [newRequestAppId, setNewRequestAppId] = useState<string | null>(null);
  const [newRequestKey, setNewRequestKey] = useState(0);
  const openNewRequest = (appId: string) => {
    setNewRequestKey((key) => key + 1);
    setNewRequestAppId(appId);
  };

  const isPending = appsPending || itemsPending;
  // A failed background refresh must not hide a last-known-good offline copy.
  const isError = (appsError && apps === undefined) || (itemsError && items === undefined);
  const firstName = profile?.name.split(" ")[0] ?? "";

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-display">{t.overviewTitle}</h1>
        {firstName && <p className="page-subtitle">{t.overviewGreeting(firstName)}</p>}
      </header>

      {isError ? (
        <ErrorState
          title={t.errorLoading}
          message={describeError(apps === undefined ? appsErrorValue : itemsErrorValue)}
          onRetry={() => {
            void refetchApps();
            void refetchItems();
          }}
          retryLabel={t.retry}
        />
      ) : isPending ? (
        <SkeletonList count={4} label={t.loading} />
      ) : (
        <>
          {(apps ?? []).length > 0 && (
            <div className="kpi-grid">
              {BOARD_STATUSES.map((status) => (
                <KpiTile key={status} status={status} count={list.filter((item) => item.status === status).length} />
              ))}
            </div>
          )}

          {!isAdmin && mineOpenCount > 0 && (
            <Link href="/mine" className="overview-banner">
              <span className="overview-banner-icon">
                <Star size={16} aria-hidden="true" />
              </span>
              <span className="overview-banner-text">{t.openRequestsBanner(mineOpenCount)}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}

          {(apps ?? []).length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t.noAppsTitle}
              body={t.noAppsBody}
              action={
                isAdmin ? (
                  <Link href="/settings/apps" className="btn btn-primary">
                    {t.newApp}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            (apps ?? []).map((app) => (
              <AppBoard key={app.id} app={app} items={byApp.get(app.id) ?? []} onAddRequest={openNewRequest} />
            ))
          )}
        </>
      )}

      {newRequestAppId && (
        <NewRequestSheet
          key={newRequestKey}
          appId={newRequestAppId}
          open={!!newRequestAppId}
          onClose={() => setNewRequestAppId(null)}
          navigateOnCreate={false}
        />
      )}
    </div>
  );
}
