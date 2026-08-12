"use client";

import { ArrowLeft, Eye, FileQuestion, FolderInput, Lock, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  ALL_STATUSES,
  ITEM_EFFORTS,
  ITEM_PRIORITIES,
  ITEM_TYPES,
  canEditRequest,
  canChangeWorkflow,
  canManageSubtasks,
  voteBlockedReason,
  type ItemEffort,
  type ItemPriority,
  type ItemStatus,
  type ItemType,
  type Visibility,
} from "../../lib/domain";
import { useBackHref } from "../../lib/board-return";
import { formatDateTime, formatRelative } from "../../lib/format";
import { effortLabels, priorityLabels, statusLabelsSingular, typeLabels } from "../../lib/i18n";
import { Link, useRouter } from "../../lib/local-navigation";
import {
  useApps,
  useDeleteRequest,
  useErrorMessage,
  useRequest,
  useSetEffort,
  useSetPriority,
  useSetStatus,
  useSetVisibility,
  useUpdateRequest,
} from "../../lib/queries";
import { AdminChip, EffortChip, InternalChip, PriorityChip, StatusDot, StatusPill, TypeChip, effortIcons, priorityIcons, typeIcons } from "../badges";
import { ChildCardList } from "../child-cards";
import { useAuth, useLanguage } from "../providers";
import { Avatar, Button, IconButton, SkeletonList } from "../ui/primitives";
import { ConfirmDialog, Dialog, Dropdown, type DropdownOption } from "../ui/overlay";
import { EmptyState, ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";
import { VoteButton } from "../vote-button";
import { RequestDetailMobile } from "./request-detail-mobile";

/** Desktop (>=1024px) and phone are two independent components rendered together and toggled
 *  with CSS — see request-detail-mobile.tsx for why the phone layout isn't just this one
 *  reflowed, and .detail-viewport-desktop/.detail-viewport-mobile in globals.css for the toggle
 *  itself (same trick app-shell.tsx uses for the sidebar vs. the tabbar). */
export function RequestDetailPage({ requestId }: { requestId: string }) {
  return (
    <>
      <RequestDetailDesktop requestId={requestId} />
      <RequestDetailMobile requestId={requestId} />
    </>
  );
}

function RequestDetailDesktop({ requestId }: { requestId: string }) {
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
  const setEffort = useSetEffort();
  const setVisibility = useSetVisibility();
  const remove = useDeleteRequest();

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
      <div className="page page-prose detail-viewport-desktop">
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
      <div className="page page-prose detail-viewport-desktop">
        <SkeletonList count={3} label={t.loading} />
      </div>
    );
  }

  const app = apps.find((entry) => entry.id === request.appId);
  const mayEdit = canEditRequest(profile, request);
  const mayWorkflow = canChangeWorkflow(profile);
  const maySubtasks = canManageSubtasks(profile, request);
  const isOwnRequest = request.creatorId === profile?.id;
  const isAdmin = profile?.role === "admin";
  const blocked = voteBlockedReason(profile, request);
  const voteReason = blocked === "own" ? t.voteOwnReason : blocked === "internal" ? t.voteInternalReason : null;

  const statusOptions: DropdownOption<ItemStatus>[] = ALL_STATUSES.map((value) => ({
    value,
    label: statusLabelsSingular[language][value],
    icon: <StatusDot status={value} />,
  }));
  const priorityOptions: DropdownOption<ItemPriority>[] = ITEM_PRIORITIES.map((value) => {
    const Icon = priorityIcons[value];
    return { value, label: priorityLabels[language][value], icon: <Icon size={13} aria-hidden="true" /> };
  });
  const effortOptions: DropdownOption<ItemEffort>[] = ITEM_EFFORTS.map((value) => {
    const Icon = effortIcons[value];
    return { value, label: effortLabels[language][value], icon: <Icon size={13} aria-hidden="true" /> };
  });
  const typeOptions: DropdownOption<ItemType>[] = ITEM_TYPES.map((value) => {
    const Icon = typeIcons[value];
    return { value, label: typeLabels[language][value], icon: <Icon size={13} aria-hidden="true" /> };
  });
  const visibilityOptions: DropdownOption<Visibility>[] = [
    { value: "shared", label: t.shared, icon: <Eye size={13} aria-hidden="true" /> },
    { value: "internal", label: t.internal, icon: <Lock size={13} aria-hidden="true" /> },
  ];

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
    if (status === request!.status) return;
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
    if (priority === request!.priority) return;
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

  function changeEffort(effort: ItemEffort) {
    if (effort === request!.effort) return;
    const previous = request!.effort;
    setEffort.mutate(
      { id: request!.id, effort },
      {
        onError,
        onSuccess: () =>
          toast(t.toastEffortChanged, {
            actionLabel: t.undo,
            onAction: () => setEffort.mutate({ id: request!.id, effort: previous }, { onError }),
          }),
      },
    );
  }

  function changeType(type: ItemType) {
    if (type === request!.type) return;
    update.mutate({ id: request!.id, type }, { onError, onSuccess: () => toast(t.toastTypeChanged) });
  }

  function changeVisibility(visibility: Visibility) {
    if (visibility === request!.visibility) return;
    setVisibility.mutate(
      { id: request!.id, visibility },
      { onError, onSuccess: () => toast(t.toastVisibilityChanged) },
    );
  }

  return (
    <div className="page page-detail detail-viewport-desktop">
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

      {/* Header, body and properties share one grid: on mobile they stack in reading-priority
          order (title, then the long-form content, then at-a-glance properties last); from
          1024px the properties panel becomes a sticky right rail instead — see .detail-grid
          in globals.css. Source order here also drives desktop tab order (header, then body,
          then the sidebar), which now matches the visual left-to-right, top-to-bottom reading
          order too. */}
      <div className="detail-grid">
        <div className="detail-grid-header">
          <header className="detail-header">
            <div className="detail-flags">
              <TypeChip type={request.type} />
              {request.visibility === "internal" && <InternalChip />}
              {request.creatorRole === "admin" && <AdminChip />}
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
        </div>

        <div className="detail-grid-body">
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

          {/* Subtasks */}
          {!request.parentId && <ChildCardList request={request} canManage={maySubtasks} />}
        </div>

        <aside className="detail-grid-sidebar" aria-label={t.properties}>
          <div className="properties-panel">
            <p className="properties-panel-title">{t.properties}</p>

            <div className="property-row">
              <span className="property-label">{t.votes}</span>
              <div className="property-value">
                <VoteButton request={request} size="lg" />
              </div>
            </div>
            {!isAdmin && voteReason && <p className="property-hint">{voteReason}</p>}

            <div className="property-row">
              <span className="property-label">{t.status}</span>
              <div className="property-value">
                {mayWorkflow ? (
                  <Dropdown
                    compact
                    label={t.changeStatus}
                    value={request.status}
                    onChange={changeStatus}
                    disabled={setStatus.isPending && !setStatus.isPaused}
                    options={statusOptions}
                  />
                ) : (
                  <StatusPill status={request.status} />
                )}
              </div>
            </div>

            <div className="property-row">
              <span className="property-label">{t.priority}</span>
              <div className="property-value">
                {mayWorkflow ? (
                  <Dropdown
                    compact
                    label={t.changePriority}
                    value={request.priority}
                    onChange={changePriority}
                    disabled={setPriority.isPending && !setPriority.isPaused}
                    options={priorityOptions}
                  />
                ) : (
                  <PriorityChip priority={request.priority} />
                )}
              </div>
            </div>

            <div className="property-row">
              <span className="property-label">{t.effort}</span>
              <div className="property-value">
                {mayWorkflow ? (
                  <Dropdown
                    compact
                    label={t.changeEffort}
                    value={request.effort}
                    onChange={changeEffort}
                    disabled={setEffort.isPending && !setEffort.isPaused}
                    options={effortOptions}
                  />
                ) : (
                  <EffortChip effort={request.effort} />
                )}
              </div>
            </div>

            <div className="property-row">
              <span className="property-label">{t.type}</span>
              <div className="property-value">
                {mayEdit ? (
                  <Dropdown
                    compact
                    label={t.changeType}
                    value={request.type}
                    onChange={changeType}
                    disabled={update.isPending && !update.isPaused}
                    options={typeOptions}
                  />
                ) : (
                  <TypeChip type={request.type} />
                )}
              </div>
            </div>

            <div className="property-row">
              <span className="property-label">{t.visibility}</span>
              <div className="property-value">
                {mayWorkflow ? (
                  <Dropdown
                    compact
                    label={t.changeVisibility}
                    value={request.visibility}
                    onChange={changeVisibility}
                    disabled={setVisibility.isPending && !setVisibility.isPaused}
                    options={visibilityOptions}
                  />
                ) : request.visibility === "internal" ? (
                  <InternalChip />
                ) : (
                  <span className="chip chip-neutral">
                    <Eye size={11} aria-hidden="true" />
                    {t.shared}
                  </span>
                )}
              </div>
            </div>

            <div className="property-row">
              <span className="property-label">{t.appLabel}</span>
              <div className="property-value">
                <span className="property-value-text">{app?.name}</span>
                {mayEdit && (
                  <IconButton
                    label={t.changeApp}
                    size="sm"
                    onClick={() => {
                      setMoveTarget(request.appId);
                      setMoveOpen(true);
                    }}
                  >
                    <FolderInput size={14} aria-hidden="true" />
                  </IconButton>
                )}
              </div>
            </div>

            {mayEdit && (
              <div className="properties-panel-danger">
                <Button
                  variant="danger-quiet"
                  size="sm"
                  block
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  onClick={() => setConfirmDelete(true)}
                >
                  {t.deleteRequest}
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

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
          router.discard(`/a/${encodeURIComponent(request.appId)}`);
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
