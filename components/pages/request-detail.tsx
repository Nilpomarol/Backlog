"use client";

import {
  ArrowLeft,
  Check,
  Eye,
  FileQuestion,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderInput,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  ALL_STATUSES,
  ITEM_PRIORITIES,
  canEditRequest,
  canChangeWorkflow,
  canManageSubtasks,
  voteBlockedReason,
  type ItemPriority,
  type ItemStatus,
} from "../../lib/domain";
import { useBackHref } from "../../lib/board-return";
import { formatDateTime, formatRelative } from "../../lib/format";
import { statusLabelsSingular } from "../../lib/i18n";
import { useRouter } from "../../lib/local-navigation";
import {
  useApps,
  useDeleteRequest,
  useErrorMessage,
  useRequest,
  useSetPriority,
  useSetStatus,
  useSetVisibility,
  useUpdateRequest,
} from "../../lib/queries";
import { AdminChip, EffortChip, InternalChip, PriorityChip, StatusDot, StatusPill, TypeChip, priorityIcons, usePriorityLabel } from "../badges";
import { ChildCardList } from "../child-cards";
import { useAuth, useLanguage } from "../providers";
import { Avatar, Button, SkeletonList } from "../ui/primitives";
import { ConfirmDialog, Dialog, Menu, MenuItem, MenuSeparator } from "../ui/overlay";
import { EmptyState, ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";
import { VoteButton } from "../vote-button";

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const describeError = useErrorMessage();

  const { data: request, isPending, isError, error, refetch } = useRequest(requestId);
  const { data: apps = [] } = useApps();

  const update = useUpdateRequest();
  const setStatus = useSetStatus();
  const setPriority = useSetPriority();
  const setVisibility = useSetVisibility();
  const remove = useDeleteRequest();
  const priorityLabel = usePriorityLabel();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");

  // Returns to wherever the user actually came from (filtered board, parent task, subtask...)
  // instead of resetting to the bare board — see lib/board-return.ts.
  const boardHref = useBackHref(request?.appId ?? "");

  const onError = (failure: unknown) => toast(describeError(failure), { tone: "error" });

  if (isError && request === undefined) {
    const notFound = error instanceof Error && "code" in error && (error as { code: string }).code === "not_found";
    return (
      <div className="page page-prose">
        {notFound ? (
          <EmptyState
            icon={FileQuestion}
            title={t.notFoundTitle}
            body={t.notFoundBody}
            action={
              <Link href="/" className="btn btn-secondary">
                {t.backToBacklog}
              </Link>
            }
          />
        ) : (
          <ErrorState
            title={t.errorLoading}
            message={describeError(error)}
            onRetry={() => void refetch()}
            retryLabel={t.retry}
          />
        )}
      </div>
    );
  }

  if (isPending || !request) {
    return (
      <div className="page page-prose">
        <SkeletonList count={3} label={t.loading} />
      </div>
    );
  }

  const app = apps.find((entry) => entry.id === request.appId);
  const mayEdit = canEditRequest(profile, request);
  const mayWorkflow = canChangeWorkflow(profile);
  const maySubtasks = canManageSubtasks(profile, request);
  const isOwnRequest = request.creatorId === profile?.id;
  const blocked = voteBlockedReason(profile, request);
  const voteReason = blocked === "own" ? t.voteOwnReason : blocked === "internal" ? t.voteInternalReason : null;

  function saveTitle() {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (next.length < 3 || next === request!.title) {
      setTitleDraft(request!.title);
      return;
    }
    update.mutate({ id: request!.id, title: next }, { onError, onSuccess: () => toast(t.toastSaved) });
  }

  function saveDescription() {
    const next = descriptionDraft.trim();
    setEditingDescription(false);
    if (next === (request!.description ?? "")) return;
    update.mutate(
      { id: request!.id, description: next || null },
      { onError, onSuccess: () => toast(t.toastSaved) },
    );
  }

  function changeStatus(status: ItemStatus) {
    const previous = request!.status;
    setStatus.mutate(
      { id: request!.id, status },
      {
        onError,
        onSuccess: () =>
          toast(status === "discarded" ? t.toastDiscarded : t.toastStatusChanged, {
            actionLabel: t.undo,
            onAction: () => setStatus.mutate({ id: request!.id, status: previous }, { onError }),
          }),
      },
    );
  }

  function changePriority(priority: ItemPriority) {
    const previous = request!.priority;
    setPriority.mutate(
      { id: request!.id, priority },
      {
        onError,
        onSuccess: () =>
          toast(t.toastPriorityChanged, {
            actionLabel: t.undo,
            onAction: () => setPriority.mutate({ id: request!.id, priority: previous }, { onError }),
          }),
      },
    );
  }

  return (
    <div className="page page-prose">
      <nav className="breadcrumb" aria-label={t.backTo}>
        <Link href={boardHref} className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} aria-hidden="true" />
          {app?.name ?? t.backToBacklog}
        </Link>
        {request.parent && (
          <Link href={`/r/${encodeURIComponent(request.parent.id)}`} className="chip chip-neutral">
            {t.subtaskOf} {request.parent.title}
          </Link>
        )}
      </nav>

      <header className="detail-header">
        <div className="detail-flags">
          <TypeChip type={request.type} />
          <StatusPill status={request.status} />
          <PriorityChip priority={request.priority} />
          {request.effort !== "unknown" && <EffortChip effort={request.effort} />}
          {request.visibility === "internal" && <InternalChip />}
          {request.creatorRole === "admin" && <AdminChip />}

          <span style={{ marginLeft: "auto" }}>
            {(mayEdit || mayWorkflow) && (
              <Menu
                label={t.requestActions}
                trigger={(props) => (
                  <button type="button" className="icon-btn" aria-label={t.requestActions} {...props}>
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    {mayEdit && (
                      <MenuItem
                        icon={<FolderInput size={15} aria-hidden="true" />}
                        onClick={() => {
                          setMoveTarget(request.appId);
                          setMoveOpen(true);
                          close();
                        }}
                      >
                        {t.moveToApp}
                      </MenuItem>
                    )}
                    {mayWorkflow && (
                      <MenuItem
                        icon={
                          request.visibility === "internal" ? (
                            <Eye size={15} aria-hidden="true" />
                          ) : (
                            <Lock size={15} aria-hidden="true" />
                          )
                        }
                        onClick={() => {
                          setVisibility.mutate(
                            {
                              id: request.id,
                              visibility: request.visibility === "internal" ? "shared" : "internal",
                            },
                            { onError, onSuccess: () => toast(t.toastVisibilityChanged) },
                          );
                          close();
                        }}
                      >
                        {request.visibility === "internal" ? t.makeShared : t.makeInternal}
                      </MenuItem>
                    )}
                    {mayEdit && (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          danger
                          icon={<Trash2 size={15} aria-hidden="true" />}
                          onClick={() => {
                            setConfirmDelete(true);
                            close();
                          }}
                        >
                          {t.deleteRequest}
                        </MenuItem>
                      </>
                    )}
                  </>
                )}
              </Menu>
            )}
          </span>
        </div>

        {editingTitle ? (
          <div>
            <input
              className="input input-lg"
              value={titleDraft}
              autoFocus
              maxLength={160}
              aria-label={t.editTitle}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveTitle();
                }
                if (event.key === "Escape") {
                  setTitleDraft(request.title);
                  setEditingTitle(false);
                }
              }}
            />
            <div className="edit-actions">
              <Button size="sm" variant="primary" onClick={saveTitle}>
                {t.saveChanges}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTitleDraft(request.title);
                  setEditingTitle(false);
                }}
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : mayEdit ? (
          <button
            type="button"
            className="editable"
            onClick={() => {
              setTitleDraft(request.title);
              setEditingTitle(true);
            }}
            aria-label={t.editTitle}
          >
            <h1 className="detail-title">{request.title}</h1>
            <Pencil size={16} className="editable-pencil" aria-hidden="true" />
          </button>
        ) : (
          <h1 className="detail-title">{request.title}</h1>
        )}

        <div className="detail-byline">
          <Avatar name={request.creatorName} url={request.creatorAvatarUrl} admin={request.creatorRole === "admin"} />
          <span>
            {t.reportedBy} <strong>{isOwnRequest ? t.you : request.creatorName}</strong>
          </span>
          <span className="meta-dot" aria-hidden="true" />
          <time dateTime={new Date(request.createdAt).toISOString()} title={formatDateTime(request.createdAt, language)}>
            {formatRelative(request.createdAt, language)}
          </time>
          {request.updatedAt > request.createdAt + 1000 && (
            <>
              <span className="meta-dot" aria-hidden="true" />
              <span>
                {t.updatedOn}{" "}
                <time dateTime={new Date(request.updatedAt).toISOString()}>
                  {formatRelative(request.updatedAt, language)}
                </time>
              </span>
            </>
          )}
        </div>
      </header>

      {/* Description */}
      <section className="detail-section" aria-labelledby="description-heading">
        <div className="detail-section-title">
          <h2 id="description-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
            {t.description}
          </h2>
        </div>

        {editingDescription ? (
          <div>
            <textarea
              className="textarea"
              value={descriptionDraft}
              autoFocus
              rows={6}
              maxLength={4000}
              aria-label={t.editDescription}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDescriptionDraft(request.description ?? "");
                  setEditingDescription(false);
                }
              }}
            />
            <div className="edit-actions">
              <Button size="sm" variant="primary" onClick={saveDescription}>
                {t.saveChanges}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDescriptionDraft(request.description ?? "");
                  setEditingDescription(false);
                }}
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : mayEdit ? (
          <button
            type="button"
            className="editable"
            onClick={() => {
              setDescriptionDraft(request.description ?? "");
              setEditingDescription(true);
            }}
            aria-label={t.editDescription}
          >
            <span className={`detail-description${request.description ? "" : " detail-description-empty"}`}>
              {request.description || t.addDescription}
            </span>
            <Pencil size={15} className="editable-pencil" aria-hidden="true" />
          </button>
        ) : (
          <p className={`detail-description${request.description ? "" : " detail-description-empty"}`}>
            {request.description || t.noDescription}
          </p>
        )}
      </section>

      {/* Vote */}
      <section className="detail-section" aria-labelledby="vote-heading">
        <h2 id="vote-heading" className="sr-only">
          {t.votes}
        </h2>
        <div className="vote-panel">
          <VoteButton request={request} size="lg" />
          {voteReason && <span className="vote-panel-reason">{voteReason}</span>}
        </div>
      </section>

      {/* Subtasks */}
      {!request.parentId && <ChildCardList request={request} canManage={maySubtasks} />}

      {/* Status — only administrators can change it, and everyone already sees the current
          state as a pill in the header, so this section is theirs alone. */}
      {mayWorkflow && (
        <section className="detail-section" aria-labelledby="status-heading">
          <div className="detail-section-title">
            <h2 id="status-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
              {t.status}
            </h2>
          </div>
          <div className="stepper" role="group" aria-label={t.changeStatus}>
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className="stepper-step"
                aria-current={request.status === status}
                disabled={(setStatus.isPending && !setStatus.isPaused) || request.status === status}
                onClick={() => changeStatus(status)}
              >
                {request.status === status ? <Check size={13} aria-hidden="true" /> : <StatusDot status={status} />}
                {statusLabelsSingular[language][status]}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Priority — same admin-only triage action as status, kept as its own section so it stays
          scannable rather than folded into the status stepper above. */}
      {mayWorkflow && (
        <section className="detail-section" aria-labelledby="priority-heading">
          <div className="detail-section-title">
            <h2 id="priority-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
              {t.priority}
            </h2>
          </div>
          <div className="stepper" role="group" aria-label={t.changePriority}>
            {ITEM_PRIORITIES.map((priority) => {
              const Icon = priorityIcons[priority];
              return (
                <button
                  key={priority}
                  type="button"
                  className="stepper-step"
                  aria-current={request.priority === priority}
                  disabled={(setPriority.isPending && !setPriority.isPaused) || request.priority === priority}
                  onClick={() => changePriority(priority)}
                >
                  {request.priority === priority ? <Check size={13} aria-hidden="true" /> : <Icon size={13} aria-hidden="true" />}
                  {priorityLabel(priority)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.deleteConfirmTitle}
        body={t.deleteConfirmBody}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive
        busy={remove.isPending && !remove.isPaused}
        onConfirm={() => {
          remove.mutate({ id: request.id, baseUpdatedAt: request.updatedAt }, { onError });
          toast(t.toastDeleted);
          setConfirmDelete(false);
          // The board remains a valid destination even when the delete is queued offline.
          router.push(`/a/${encodeURIComponent(request.appId)}`);
        }}
      />

      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={t.moveToAppTitle}
        closeLabel={t.close}
        actions={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              variant="primary"
              loading={update.isPending && !update.isPaused}
              disabled={moveTarget === request.appId}
              onClick={() => {
                update.mutate(
                  { id: request.id, appId: moveTarget },
                  { onError },
                );
                toast(t.toastMoved);
                setMoveOpen(false);
              }}
            >
              {t.move}
            </Button>
          </>
        }
      >
        <p className="dialog-body">{t.moveToAppBody}</p>
        <div className="field">
          <label className="field-label" htmlFor="move-target">
            {t.appLabel}
          </label>
          <select
            id="move-target"
            className="select"
            value={moveTarget}
            onChange={(event) => setMoveTarget(event.target.value)}
          >
            {apps.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      </Dialog>
    </div>
  );
}
