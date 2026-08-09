"use client";

import { CornerDownRight, ListChecks } from "lucide-react";
import Link from "next/link";
import type { DragEvent, ReactNode } from "react";
import { classes, formatRelative } from "../lib/format";
import type { RequestSummary } from "../lib/domain";
import { InternalChip, PriorityChip, StatusPill, TypeChip } from "./badges";
import { useAuth, useLanguage } from "./providers";
import { AppIcon, Avatar } from "./ui/primitives";
import { VoteButton } from "./vote-button";

/** Compact "done/total" indicator folded into the meta line rather than its own row. */
function SubtaskMeta({ request, label }: { request: RequestSummary; label: string }) {
  if (request.subtaskCount === 0) return null;
  return (
    <>
      <span className="meta-dot" aria-hidden="true" />
      <span
        className={classes(
          "meta-subtasks",
          request.completedSubtasks === request.subtaskCount && "meta-subtasks-complete",
        )}
        aria-label={`${request.completedSubtasks}/${request.subtaskCount} ${label}`}
      >
        <ListChecks size={11} aria-hidden="true" />
        {request.completedSubtasks}/{request.subtaskCount}
      </span>
    </>
  );
}

/** Contextual backlink to a parent request. Plain text link, not a chip — it names a specific
 *  other request rather than categorising this one. */
function SubtaskOfLink({ request }: { request: RequestSummary }) {
  const { t } = useLanguage();
  if (!request.parentId) return null;
  return (
    <Link href={`/r/${encodeURIComponent(request.parentId)}`} className="subtask-of-link card-overlay" draggable={false}>
      <CornerDownRight size={11} aria-hidden="true" />
      <span>
        {t.subtaskOf} {request.parentTitle}
      </span>
    </Link>
  );
}

function useAuthorLabel() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  return (request: RequestSummary) => (request.creatorId === profile?.id ? t.you : request.creatorName);
}

/**
 * Board card. The title leads; type and internal-only are quiet icon badges in the top-right
 * corner rather than labelled chips competing with it for the first read. Everything else (who
 * created it, whether it's a subtask) is plain text below.
 */
export function RequestCard({
  request,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  request: RequestSummary;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}) {
  const { t, language } = useLanguage();
  const authorLabel = useAuthorLabel();

  return (
    <article
      className={classes(
        "request-card",
        request.status === "discarded" && "request-card-discarded",
        dragging && "request-card-dragging",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="request-card-top">
        <h3 className="request-card-title">
          <Link href={`/r/${encodeURIComponent(request.id)}`} className="card-link" draggable={false}>
            {request.title}
          </Link>
        </h3>
        <div className="request-card-badges">
          {request.priority !== "none" && <PriorityChip priority={request.priority} iconOnly />}
          <TypeChip type={request.type} iconOnly />
          {request.visibility === "internal" && <InternalChip iconOnly />}
        </div>
      </div>

      <SubtaskOfLink request={request} />

      <div className="request-card-footer">
        <Avatar name={request.creatorName} url={request.creatorAvatarUrl} admin={request.creatorRole === "admin"} />
        <span className="request-card-meta">
          <span className="request-card-author">{authorLabel(request)}</span>
          <span className="meta-dot" aria-hidden="true" />
          <time dateTime={new Date(request.updatedAt).toISOString()}>
            {formatRelative(request.updatedAt, language)}
          </time>
          <SubtaskMeta request={request} label={t.subtasksDone} />
        </span>
        <VoteButton request={request} />
      </div>
    </article>
  );
}

/** Dense row used by the list view and every cross-app listing. */
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
          {request.priority !== "none" && <PriorityChip priority={request.priority} />}
          {request.visibility === "internal" && <InternalChip />}
        </div>

        <h3 className={classes("request-row-title", request.status === "discarded" && "subtask-done")}>
          <Link href={`/r/${encodeURIComponent(request.id)}`} className="card-link">
            {request.title}
          </Link>
        </h3>

        <SubtaskOfLink request={request} />

        <div className="meta-row">
          <Avatar name={request.creatorName} url={request.creatorAvatarUrl} admin={request.creatorRole === "admin"} />
          <span>{authorLabel(request)}</span>
          <span className="meta-dot" aria-hidden="true" />
          <time dateTime={new Date(request.updatedAt).toISOString()}>{formatRelative(request.updatedAt, language)}</time>
          <SubtaskMeta request={request} label={t.subtasksDone} />
        </div>

        {actions && <div className="request-row-actions card-overlay">{actions}</div>}
      </div>

      <div className="request-row-side">
        <VoteButton request={request} />
      </div>
    </article>
  );
}
