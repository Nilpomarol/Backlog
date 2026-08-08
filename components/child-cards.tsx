"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ITEM_PRIORITIES, ITEM_TYPES, type ItemPriority, type ItemType, type RequestDetail } from "../lib/domain";
import { priorityLabels, typeLabels } from "../lib/i18n";
import { useCreateChildRequest, useDeleteRequest, useErrorMessage } from "../lib/queries";
import { StatusPill, typeIcons } from "./badges";
import { useLanguage, useT } from "./providers";
import { Button, IconButton, TextAreaField } from "./ui/primitives";
import { useToast } from "./ui/toast";

const DESCRIPTION_MAX = 4000;

/** Lists a request's linked subtask cards — each one is its own board card with its own status,
 *  so it can sit in a different column than its parent. Replaces the old inline checklist. */
export function ChildCardList({ request, canManage }: { request: RequestDetail; canManage: boolean }) {
  const t = useT();
  const { language } = useLanguage();
  const { toast } = useToast();
  const describeError = useErrorMessage();

  const create = useCreateChildRequest();
  const remove = useDeleteRequest();

  const [draft, setDraft] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ItemType>("task");
  const [priority, setPriority] = useState<ItemPriority>("none");

  const onError = (error: unknown) => toast(describeError(error), { tone: "error" });

  function resetForm() {
    setDraft("");
    setDescription("");
    setType("task");
    setPriority("none");
    setDetailsOpen(false);
  }

  function submitAdd() {
    const title = draft.trim();
    if (!title) return;
    create.mutate(
      { requestId: request.id, title, description: description.trim(), type, priority },
      { onError, onSuccess: resetForm },
    );
  }

  return (
    <section className="detail-section" aria-labelledby="subtasks-heading">
      <div className="detail-section-title">
        <h2 id="subtasks-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
          {t.subtasks}
        </h2>
      </div>

      {request.children.length === 0 ? (
        <p className="field-hint">{t.noSubtasks}</p>
      ) : (
        <ul className="subtask-list">
          {request.children.map((child) => (
            <li className="subtask-row" key={child.id}>
              <StatusPill status={child.status} />
              <Link href={`/r/${encodeURIComponent(child.id)}`} className="subtask-title card-link">
                {child.title}
              </Link>
              {canManage && (
                <span className="subtask-actions">
                  <IconButton
                    label={`${t.deleteSubtask}: ${child.title}`}
                    size="sm"
                    tone="danger"
                    onClick={() => remove.mutate(child.id, { onError })}
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
        <div className="subtask-add">
          <div className="subtask-add-row">
            <input
              className="input"
              value={draft}
              placeholder={t.newSubtaskPlaceholder}
              aria-label={t.addSubtask}
              maxLength={160}
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
              disabled={!draft.trim() || create.isPending}
              onClick={submitAdd}
            >
              {t.addSubtask}
            </Button>
          </div>

          <button
            type="button"
            className="disclosure-trigger"
            aria-expanded={detailsOpen}
            aria-controls="subtask-details"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <ChevronDown size={14} aria-hidden="true" />
            {detailsOpen ? t.hideDetails : t.addDetails}
          </button>

          {detailsOpen && (
            <div className="disclosure-body" id="subtask-details">
              <div className="type-picker" role="radiogroup" aria-label={t.typeLabel}>
                {ITEM_TYPES.map((value) => {
                  const Icon = typeIcons[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={type === value}
                      className={`type-option type-option-${value}`}
                      onClick={() => setType(value)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {typeLabels[language][value]}
                    </button>
                  );
                })}
              </div>

              <TextAreaField
                label={t.descriptionLabel}
                optional={t.optional}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t.descriptionPlaceholder}
                maxLength={DESCRIPTION_MAX}
                rows={3}
              />

              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label" htmlFor="subtask-priority">
                  {t.priority}
                </label>
                <select
                  id="subtask-priority"
                  className="select"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as ItemPriority)}
                >
                  {ITEM_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {priorityLabels[language][value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
