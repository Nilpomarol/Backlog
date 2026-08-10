"use client";

import { Link2, Plus, Trash2, Unlink } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import { canEditRequest, type RequestDetail } from "../lib/domain";
import {
  useAppItems,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useErrorMessage,
  useUpdateChecklistItem,
  useUpdateRequest,
} from "../lib/queries";
import { StatusPill } from "./badges";
import { useAuth, useT } from "./providers";
import { Button, IconButton, TextField } from "./ui/primitives";
import { Dialog } from "./ui/overlay";
import { useToast } from "./ui/toast";
import { classes } from "../lib/format";

/** A simple "do these things" checklist scoped to this request — distinct from the linked
 *  cards below, which are other, independently-created requests attached to this one. */
function ChecklistSection({ request, canManage }: { request: RequestDetail; canManage: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const describeError = useErrorMessage();
  const create = useCreateChecklistItem();
  const update = useUpdateChecklistItem();
  const remove = useDeleteChecklistItem();
  const [draft, setDraft] = useState("");

  const onError = (error: unknown) => toast(describeError(error), { tone: "error" });

  function submitAdd() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    create.mutate({ id: crypto.randomUUID(), requestId: request.id, title }, { onError });
  }

  return (
    <section className="detail-section" aria-labelledby="checklist-heading">
      <div className="detail-section-title">
        <h2 id="checklist-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
          {t.checklist}
        </h2>
      </div>

      {request.checklist.length === 0 ? (
        <p className="field-hint">{t.noChecklistItems}</p>
      ) : (
        <ul className="subtask-list">
          {request.checklist.map((entry) => (
            <li className="subtask-row" key={entry.id}>
              <input
                type="checkbox"
                className="checkbox"
                checked={entry.done}
                disabled={!canManage || (update.isPending && !update.isPaused)}
                onChange={(event) =>
                  update.mutate({ id: entry.id, requestId: request.id, done: event.target.checked }, { onError })
                }
                aria-label={entry.title}
              />
              <span className={classes("subtask-title", entry.done && "subtask-done")}>{entry.title}</span>
              {canManage && (
                <span className="subtask-actions">
                  <IconButton
                    label={`${t.deleteChecklistItem}: ${entry.title}`}
                    size="sm"
                    tone="danger"
                    onClick={() => remove.mutate({ id: entry.id, requestId: request.id }, { onError })}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="subtask-add-row" style={{ marginTop: request.checklist.length ? "var(--space-2)" : 0 }}>
          <input
            className="input"
            value={draft}
            placeholder={t.newChecklistItemPlaceholder}
            aria-label={t.addChecklistItem}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitAdd();
              }
            }}
          />
          <Button
            variant="secondary"
            icon={<Plus size={15} aria-hidden="true" />}
            disabled={!draft.trim() || (create.isPending && !create.isPaused)}
            onClick={submitAdd}
          >
            {t.addChecklistItem}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Search the request's own app for an existing, unlinked, childless card to attach here. Not a
 *  creation form — the card must already exist (made through the normal "new request" flow). */
function LinkCardDialog({ request, onClose }: { request: RequestDetail; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const describeError = useErrorMessage();
  const { profile } = useAuth();
  const { data: appItems = [], isPending } = useAppItems(request.appId);
  const link = useUpdateRequest();
  const [query, setQuery] = useState("");

  const onError = (error: unknown) => toast(describeError(error), { tone: "error" });

  const normalizedQuery = query.trim().toLowerCase();
  const candidates = appItems
    .filter(
      (item) =>
        item.id !== request.id &&
        !item.parentId &&
        item.status !== "discarded" &&
        item.subtaskCount === 0 &&
        canEditRequest(profile, item) &&
        (!normalizedQuery || item.title.toLowerCase().includes(normalizedQuery)),
    )
    .slice(0, 20);

  return (
    <Dialog open onClose={onClose} title={t.linkCardTitle} closeLabel={t.close}>
      <TextField
        label={t.linkCardSearchLabel}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.linkCardSearchPlaceholder}
        autoFocus
      />
      {!isPending && candidates.length === 0 ? (
        <p className="field-hint">{t.linkCardEmpty}</p>
      ) : (
        <ul className="subtask-list">
          {candidates.map((candidate) => (
            <li className="subtask-row" key={candidate.id}>
              <span className="subtask-title">{candidate.title}</span>
              <Button
                size="sm"
                variant="secondary"
                loading={link.isPending && !link.isPaused}
                onClick={() => {
                  link.mutate(
                    { id: candidate.id, parentId: request.id, relatedRequestId: request.id },
                    { onError },
                  );
                  toast(t.toastLinked);
                  onClose();
                }}
              >
                {t.link}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Other, independently-created requests attached under this one — not lesser "subtask"
 *  entities, just regular cards with parentId set (see components/pages/new-request.tsx for
 *  how they're created, and PATCH /items/:id for how they're linked). */
function LinkedCardsSection({ request, canManage }: { request: RequestDetail; canManage: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const describeError = useErrorMessage();
  const unlink = useUpdateRequest();
  const [linkOpen, setLinkOpen] = useState(false);

  const onError = (error: unknown) => toast(describeError(error), { tone: "error" });

  return (
    <section className="detail-section" aria-labelledby="linked-cards-heading">
      <div className="detail-section-title">
        <h2 id="linked-cards-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
          {t.linkedCards}
        </h2>
        {canManage && (
          <Button size="sm" variant="ghost" icon={<Link2 size={14} aria-hidden="true" />} onClick={() => setLinkOpen(true)}>
            {t.linkCard}
          </Button>
        )}
      </div>

      {request.children.length === 0 ? (
        <p className="field-hint">{t.noLinkedCards}</p>
      ) : (
        <ul className="subtask-list">
          {request.children.map((child) => (
            <li className="subtask-row" key={child.id}>
              <StatusPill status={child.status} />
              <NextLink href={`/r/${encodeURIComponent(child.id)}`} className="subtask-title card-link">
                {child.title}
              </NextLink>
              {canManage && (
                <span className="subtask-actions">
                  <IconButton
                    label={`${t.unlinkCard}: ${child.title}`}
                    size="sm"
                    onClick={() =>
                      unlink.mutate(
                        { id: child.id, parentId: null, relatedRequestId: request.id },
                        { onError, onSuccess: () => toast(t.toastUnlinked) },
                      )
                    }
                  >
                    <Unlink size={14} aria-hidden="true" />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {linkOpen && <LinkCardDialog request={request} onClose={() => setLinkOpen(false)} />}
    </section>
  );
}

export function ChildCardList({ request, canManage }: { request: RequestDetail; canManage: boolean }) {
  return (
    <>
      <ChecklistSection request={request} canManage={canManage} />
      <LinkedCardsSection request={request} canManage={canManage} />
    </>
  );
}
