"use client";

import { PlusCircle, Star } from "lucide-react";
import { ACTIVE_STATUSES } from "../../lib/domain";
import { useAllItems, useErrorMessage, type CrossAppRequest } from "../../lib/queries";
import { useAuth, useT } from "../providers";
import { RequestRow } from "../request-card";
import { SkeletonList } from "../ui/primitives";
import { EmptyState, ErrorState } from "../ui/states";

function Group({ title, items, empty }: { title: string; items: CrossAppRequest[]; empty: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-header">
        <h2 className="t-heading">{title}</h2>
        {items.length > 0 && <span className="result-count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        empty
      ) : (
        <div className="request-list">
          {items.map((item) => (
            <RequestRow key={item.id} request={item} appLabel={item.appName} appLogoUrl={item.appLogoUrl} showStatus />
          ))}
        </div>
      )}
    </section>
  );
}

export function MinePage() {
  const t = useT();
  const { profile } = useAuth();
  const { data: items, isPending, isError, error, refetch } = useAllItems();
  const describeError = useErrorMessage();

  const list = items ?? [];
  const mine = list.filter((item) => item.creatorId === profile?.id);
  const open = mine
    .filter((item) => ACTIVE_STATUSES.includes(item.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const closed = mine
    .filter((item) => !ACTIVE_STATUSES.includes(item.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const voted = list
    .filter((item) => item.voted && item.creatorId !== profile?.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h1 className="t-display">{t.mineTitle}</h1>
        <p className="page-subtitle">{t.mineSubtitle}</p>
      </header>

      {isError ? (
        <ErrorState
          title={t.errorLoading}
          message={describeError(error)}
          onRetry={() => void refetch()}
          retryLabel={t.retry}
        />
      ) : isPending ? (
        <SkeletonList count={4} label={t.loading} />
      ) : (
        <>
          <Group
            title={t.yourOpen}
            items={open}
            empty={<EmptyState icon={PlusCircle} compact title={t.noOpenRequests} body={t.noOpenRequestsBody} />}
          />
          {closed.length > 0 && <Group title={t.yourClosed} items={closed} empty={null} />}
          <Group
            title={t.youVotedFor}
            items={voted}
            empty={<EmptyState icon={Star} compact title={t.noVotes} />}
          />
        </>
      )}
    </div>
  );
}
