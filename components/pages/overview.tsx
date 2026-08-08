"use client";

import { ArrowRight, Inbox, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { ACTIVE_STATUSES, BOARD_STATUSES, type Application, type RequestSummary } from "../../lib/domain";
import { statusLabels } from "../../lib/i18n";
import { useAllItems, useApps, useErrorMessage, type CrossAppRequest } from "../../lib/queries";
import { PriorityChip, StatusDot, TypeChip } from "../badges";
import { useAuth, useLanguage, useT } from "../providers";
import { AppIcon, SkeletonList } from "../ui/primitives";
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

/** A compact preview of one app's board: the same four workflow columns as the real board,
 *  trimmed to a handful of cards each — enough to see what's moving without leaving the page. */
function AppBoard({ app, items }: { app: Application; items: RequestSummary[] }) {
  const t = useT();
  const { language } = useLanguage();
  const href = `/a/${encodeURIComponent(app.id)}`;

  return (
    <section className="app-board">
      <div className="app-board-header">
        <Link href={href} className="app-board-title-group">
          <AppIcon name={app.name} logoUrl={app.logoUrl} className="page-app-icon" />
          <span style={{ minWidth: 0 }}>
            <span className="app-board-name">{app.name}</span>
            {app.description ? (
              <span className="app-board-desc">{app.description}</span>
            ) : (
              <span className="app-board-stat">
                {app.activeItemCount} {t.activeShort}
              </span>
            )}
          </span>
        </Link>
        <div className="app-board-actions">
          <Link href={`${href}/new`} className="icon-btn" aria-label={t.newRequest}>
            <Plus size={16} aria-hidden="true" />
          </Link>
          <Link href={href} className="btn btn-secondary btn-sm">
            {t.seeApp}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="app-board-empty">
          <span>{t.appBoardEmpty}</span>
          <Link href={`${href}/new`} className="btn btn-secondary btn-sm">
            <Plus size={14} aria-hidden="true" />
            {t.newRequest}
          </Link>
        </div>
      ) : (
        <div className="board" style={{ ["--board-columns" as string]: BOARD_STATUSES.length }}>
          {BOARD_STATUSES.map((status) => {
            const columnItems = items.filter((item) => item.status === status).sort(byVotes);
            return (
              <section className={`board-column board-column-${status}`} key={status}>
                <div className="column-header">
                  <StatusDot status={status} />
                  <span className="column-heading">
                    <span className="column-title">{statusLabels[language][status]}</span>
                  </span>
                  <span className="column-count">{columnItems.length}</span>
                </div>
                <div className="card-stack">
                  {columnItems.length === 0 ? (
                    <div className="column-empty">{t.columnEmpty}</div>
                  ) : (
                    <>
                      {columnItems.slice(0, MAX_PER_COLUMN).map((item) => (
                        <MiniCard key={item.id} request={item} />
                      ))}
                      {columnItems.length > MAX_PER_COLUMN && (
                        <Link href={href} className="mini-card-more">
                          {t.moreCount(columnItems.length - MAX_PER_COLUMN)}
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </section>
            );
          })}
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

  const untriagedCount = list.filter((item) => item.status === "backlog").length;
  const mineOpenCount = list.filter(
    (item) => item.creatorId === profile?.id && ACTIVE_STATUSES.includes(item.status),
  ).length;

  const isPending = appsPending || itemsPending;
  const isError = appsError || itemsError;
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
          message={describeError(appsErrorValue ?? itemsErrorValue)}
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
          {isAdmin
            ? untriagedCount > 0 && (
                <Link href="/inbox" className="overview-banner">
                  <span className="overview-banner-icon">
                    <Inbox size={16} aria-hidden="true" />
                  </span>
                  <span className="overview-banner-text">{t.triageNeeded(untriagedCount)}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )
            : mineOpenCount > 0 && (
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
            (apps ?? []).map((app) => <AppBoard key={app.id} app={app} items={byApp.get(app.id) ?? []} />)
          )}
        </>
      )}
    </div>
  );
}
