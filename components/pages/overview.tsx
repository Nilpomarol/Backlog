"use client";

import { ArrowRight, CircleCheck, PlusCircle } from "lucide-react";
import Link from "next/link";
import { ACTIVE_STATUSES } from "../../lib/domain";
import { useAllItems, useApps, useErrorMessage, type CrossAppRequest } from "../../lib/queries";
import { RequestRow } from "../request-card";
import { useAuth, useT } from "../providers";
import { AppIcon, SkeletonList } from "../ui/primitives";
import { EmptyState, ErrorState } from "../ui/states";

function Section({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="t-heading">{title}</h2>
          {description && <p className="page-subtitle">{description}</p>}
        </div>
        {href && linkLabel && (
          <Link href={href} className="btn btn-ghost btn-sm">
            {linkLabel}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function AppTiles({ label }: { label: string }) {
  const t = useT();
  const { data: apps = [] } = useApps();
  if (apps.length === 0) return null;

  return (
    <Section title={label}>
      <div className="tile-grid">
        {apps.map((app) => (
          <Link key={app.id} href={`/a/${encodeURIComponent(app.id)}`} className="tile">
            <AppIcon name={app.name} logoUrl={app.logoUrl} className="tile-icon" />
            <span className="tile-body">
              <span className="tile-name">{app.name}</span>
              {app.description && <span className="tile-desc">{app.description}</span>}
              <span className="tile-count">
                {app.activeItemCount} {t.activeShort}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function byVotes(a: CrossAppRequest, b: CrossAppRequest) {
  return b.votes - a.votes || b.updatedAt - a.updatedAt;
}

export function OverviewPage() {
  const t = useT();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: items, isPending, isError, error, refetch } = useAllItems();
  const describeError = useErrorMessage();

  const list = items ?? [];
  const untriaged = list.filter((item) => item.status === "backlog").sort(byVotes);
  const inProgress = list.filter((item) => item.status === "in_progress" || item.status === "in_review");
  const mineOpen = list
    .filter((item) => item.creatorId === profile?.id && ACTIVE_STATUSES.includes(item.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = list
    .filter((item) => item.creatorId !== profile?.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h1 className="t-display">{t.overviewTitle}</h1>
      </header>

      {isError ? (
        <ErrorState title={t.errorLoading} message={describeError(error)} onRetry={() => void refetch()} retryLabel={t.retry} />
      ) : isPending ? (
        <SkeletonList count={4} label={t.loading} />
      ) : (
        <>
          {isAdmin ? (
            <Section
              title={t.needsTriage}
              description={t.needsTriageBody}
              href={untriaged.length > 0 ? "/inbox" : undefined}
              linkLabel={t.viewAll}
            >
              {untriaged.length === 0 ? (
                <EmptyState
                  icon={CircleCheck}
                  tone="success"
                  compact
                  title={t.nothingToTriage}
                  body={t.nothingToTriageBody}
                />
              ) : (
                <div className="request-list">
                  {untriaged.slice(0, 5).map((item) => (
                    <RequestRow key={item.id} request={item} appLabel={item.appName} appLogoUrl={item.appLogoUrl} />
                  ))}
                </div>
              )}
            </Section>
          ) : (
            <Section title={t.yourOpenRequests} href={mineOpen.length > 0 ? "/mine" : undefined} linkLabel={t.viewAll}>
              {mineOpen.length === 0 ? (
                <EmptyState
                  icon={PlusCircle}
                  compact
                  title={t.noOpenRequests}
                  body={t.noOpenRequestsBody}
                />
              ) : (
                <div className="request-list">
                  {mineOpen.slice(0, 5).map((item) => (
                    <RequestRow key={item.id} request={item} appLabel={item.appName} appLogoUrl={item.appLogoUrl} showStatus />
                  ))}
                </div>
              )}
            </Section>
          )}

          {inProgress.length > 0 && (
            <Section title={t.inProgressNow}>
              <div className="request-list">
                {inProgress.slice(0, 5).map((item) => (
                  <RequestRow key={item.id} request={item} appLabel={item.appName} appLogoUrl={item.appLogoUrl} showStatus />
                ))}
              </div>
            </Section>
          )}

          {!isAdmin && recent.length > 0 && (
            <Section title={t.recentlyUpdated}>
              <div className="request-list">
                {recent.map((item) => (
                  <RequestRow key={item.id} request={item} appLabel={item.appName} appLogoUrl={item.appLogoUrl} showStatus />
                ))}
              </div>
            </Section>
          )}

          <AppTiles label={t.yourApps} />
        </>
      )}
    </div>
  );
}
