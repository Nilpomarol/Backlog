"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { classes } from "../lib/format";
import type { Subtask } from "../lib/domain";
import {
  useAddSubtask,
  useDeleteSubtask,
  useErrorMessage,
  useRenameSubtask,
  useReorderSubtasks,
  useToggleSubtask,
} from "../lib/queries";
import { useT } from "./providers";
import { Button, IconButton, SubtaskProgress } from "./ui/primitives";
import { useToast } from "./ui/toast";

export function SubtaskList({
  requestId,
  subtasks,
  canManage,
}: {
  requestId: string;
  subtasks: Subtask[];
  canManage: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const describeError = useErrorMessage();

  const toggle = useToggleSubtask();
  const rename = useRenameSubtask();
  const remove = useDeleteSubtask();
  const reorder = useReorderSubtasks();
  const add = useAddSubtask();

  const [draft, setDraft] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});

  const onError = (error: unknown) => toast(describeError(error), { tone: "error" });
  const done = subtasks.filter((subtask) => subtask.completed).length;

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= subtasks.length) return;
    const ids = subtasks.map((subtask) => subtask.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ requestId, ids }, { onError });
  }

  function submitAdd() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    add.mutate({ requestId, title }, { onError });
  }

  return (
    <section className="detail-section" aria-labelledby="subtasks-heading">
      <div className="detail-section-title">
        <h2 id="subtasks-heading" style={{ font: "inherit", letterSpacing: "inherit" }}>
          {t.subtasks}
        </h2>
        {subtasks.length > 0 && (
          <span style={{ minWidth: 120 }}>
            <SubtaskProgress done={done} total={subtasks.length} label={t.subtasksDone} />
          </span>
        )}
      </div>

      {subtasks.length === 0 ? (
        <p className="field-hint">{t.noSubtasks}</p>
      ) : (
        <ul className="subtask-list">
          {subtasks.map((subtask, index) => (
            <li className="subtask-row" key={subtask.id}>
              <input
                type="checkbox"
                className="checkbox"
                checked={subtask.completed}
                disabled={!canManage}
                aria-label={subtask.title}
                onChange={(event) =>
                  toggle.mutate(
                    { requestId, subtaskId: subtask.id, completed: event.target.checked },
                    { onError },
                  )
                }
              />

              {canManage ? (
                <input
                  className={classes("subtask-input", subtask.completed && "subtask-done")}
                  value={titles[subtask.id] ?? subtask.title}
                  aria-label={t.editSubtask}
                  onChange={(event) => setTitles((current) => ({ ...current, [subtask.id]: event.target.value }))}
                  onBlur={() => {
                    const next = (titles[subtask.id] ?? subtask.title).trim();
                    setTitles((current) => {
                      const next2 = { ...current };
                      delete next2[subtask.id];
                      return next2;
                    });
                    if (next && next !== subtask.title) {
                      rename.mutate({ requestId, subtaskId: subtask.id, title: next }, { onError });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setTitles((current) => {
                        const next = { ...current };
                        delete next[subtask.id];
                        return next;
                      });
                    }
                  }}
                />
              ) : (
                <span className={classes("subtask-title", subtask.completed && "subtask-done")}>{subtask.title}</span>
              )}

              {canManage && (
                <span className="subtask-actions">
                  <IconButton
                    label={`${t.moveUp}: ${subtask.title}`}
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`${t.moveDown}: ${subtask.title}`}
                    size="sm"
                    disabled={index === subtasks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`${t.deleteSubtask}: ${subtask.title}`}
                    size="sm"
                    tone="danger"
                    onClick={() => remove.mutate({ requestId, subtaskId: subtask.id }, { onError })}
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
          <Button variant="secondary" icon={<Plus size={15} aria-hidden="true" />} disabled={!draft.trim()} onClick={submitAdd}>
            {t.addSubtask}
          </Button>
        </div>
      )}
    </section>
  );
}
