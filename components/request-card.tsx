"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { classes, formatRelative } from "../lib/format";
import type { RequestSummary } from "../lib/domain";
import { AdminChip, InternalChip, StatusPill, TypeChip } from "./badges";
import { useAuth, useLanguage } from "./providers";
import { AppIcon, Avatar, SubtaskProgress } from "./ui/primitives";
import { VoteButton } from "./vote-button";

function useAuthorLabel() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  return (request: RequestSummary) => (request.creatorId === profile?.id ? t.you : request.creatorName);
}

/** Board card. Deliberately limited to the summary fields the specification allows. */
export function RequestCard({ request }: { request: RequestSummary }) {
  const { t } = useLanguage();
  const authorLabel = useAuthorLabel();

  return (
    <article className={classes("request-card", request.status === "discarded" && "request-card-discarded")}>
      <div className="request-card-flags">
        <TypeChip type={request.type} />
        {request.visibility === "internal" && <InternalChip />}
        {request.creatorRole === "admin" && <AdminChip />}
      </div>

      <h3 className="request-card-title">
        <Link href={`/r/${encodeURIComponent(request.id)}`} className="card-link">
          {request.title}
        </Link>
      </h3>

      {request.subtaskCount > 0 && (
        <SubtaskProgress done={request.completedSubtasks} total={request.subtaskCount} label={t.subtasksDone} />
      )}

      <div className="request-card-footer">
        <span className="request-card-author">
          <Avatar name={request.creatorName} url={request.creatorAvatarUrl} admin={request.creatorRole === "admin"} />
          <span>{authorLabel(request)}</span>
        </span>
        <VoteButton request={request} />
      </div>
    </article>
  );
}

/** Dense row used by the list view, the triage inbox and every cross-app listing. */
export function RequestRow({
  request,
  appLabel,
  appLogoUrl,
  showStatus,
  selected,
  onSelect,
  selectLabel,
  actions,
}: {
  request: RequestSummary;
  appLabel?: string;
  appLogoUrl?: string | null;
  showStatus?: boolean;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  selectLabel?: string;
  actions?: ReactNode;
}) {
  const { t, language } = useLanguage();
  const authorLabel = useAuthorLabel();

  return (
    <article className={classes("request-row", selected && "request-row-selected")}>
      {onSelect && (
        <input
          type="checkbox"
          className="checkbox card-overlay"
          checked={!!selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`${selectLabel ?? ""}: ${request.title}`}
          style={{ marginTop: 3 }}
        />
      )}

      <div className="request-row-body">
        <div className="request-row-head">
          {appLabel && (
            <span className="chip chip-neutral">
              {appLogoUrl && <AppIcon name={appLabel} logoUrl={appLogoUrl} className="chip-logo" />}
              {appLabel}
            </span>
          )}
          <TypeChip type={request.type} />
          {showStatus && <StatusPill status={request.status} />}
          {request.visibility === "internal" && <InternalChip />}
          {request.creatorRole === "admin" && <AdminChip />}
        </div>

        <h3 className={classes("request-row-title", request.status === "discarded" && "subtask-done")}>
          <Link href={`/r/${encodeURIComponent(request.id)}`} className="card-link">
            {request.title}
          </Link>
        </h3>

        {request.subtaskCount > 0 && (
          <SubtaskProgress done={request.completedSubtasks} total={request.subtaskCount} label={t.subtasksDone} />
        )}

        <div className="meta-row">
          <Avatar name={request.creatorName} url={request.creatorAvatarUrl} admin={request.creatorRole === "admin"} />
          <span>{authorLabel(request)}</span>
          <span className="meta-dot" aria-hidden="true" />
          <time dateTime={new Date(request.updatedAt).toISOString()}>{formatRelative(request.updatedAt, language)}</time>
        </div>

        {actions && <div className="request-row-actions card-overlay">{actions}</div>}
      </div>

      <div className="request-row-side">
        <VoteButton request={request} />
      </div>
    </article>
  );
}
