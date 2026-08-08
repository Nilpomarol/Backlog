"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { RequestDetail } from "../lib/domain";
import { useCreateChildRequest, useDeleteRequest, useErrorMessage } from "../lib/queries";
import { StatusPill } from "./badges";
import { useT } from "./providers";
import { Button, IconButton } from "./ui/primitives";
import { useToast } from "./ui/toast";

/** Lists a request's linked subtask cards — each one is its own board card with its own status,
 *  so it can sit in a different column than its parent. Replaces the old inline checklist. */
export function ChildCardList({ request, canManage }: { request: RequestDetail; canManage: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const describeError = useErrorMessage();

  const create = useCreateChildRequest();
  const remove = useDeleteRequest();

  const [draft, setDraft] = useState("");

  const onError = (error: unknown) => toast(describeError(error), { tone: "error" });

  function submitAdd() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    create.mutate({ requestId: request.id, title }, { onError });
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
      )}
    </section>
  );
}
