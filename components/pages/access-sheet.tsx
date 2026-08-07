"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "../ui/overlay";
import { Button, SkeletonList } from "../ui/primitives";

export type AccessOption = { id: string; primary: string; secondary?: string; media: ReactNode };

export type AccessSheetCopy = {
  save: string;
  cancel: string;
  close: string;
  loading: string;
  empty: string;
  selectedCount: (count: number) => string;
};

/**
 * A checkbox list inside a Sheet for editing a set of access grants. Both settings screens use it:
 * People picks apps for a person, Apps picks people for an app. The parent owns loading/saving and
 * supplies the current membership; this component tracks the working selection until save.
 */
export function AccessSheet({
  open,
  onClose,
  title,
  subtitle,
  options,
  initialSelected,
  loading,
  saving,
  onSave,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  options: AccessOption[];
  initialSelected: string[] | undefined;
  loading: boolean;
  saving: boolean;
  onSave: (ids: string[]) => void;
  copy: AccessSheetCopy;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  // Seed the working selection from the loaded grants once per open session, adjusting state during
  // render (React's endorsed alternative to a synchronising effect). Closing arms the next re-seed.
  if (!open && seeded) setSeeded(false);
  if (open && !seeded && initialSelected) {
    setSeeded(true);
    setSelected(new Set(initialSelected));
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      closeLabel={copy.close}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button variant="primary" loading={saving} disabled={loading} onClick={() => onSave([...selected])}>
            {copy.save}
          </Button>
        </>
      }
    >
      {loading ? (
        <SkeletonList count={4} label={copy.loading} />
      ) : options.length === 0 ? (
        <p className="field-hint">{copy.empty}</p>
      ) : (
        <>
          <p className="access-count field-hint">{copy.selectedCount(selected.size)}</p>
          <ul className="access-list">
            {options.map((option) => (
              <li key={option.id}>
                <label className="access-row">
                  <input
                    type="checkbox"
                    className="access-check"
                    checked={selected.has(option.id)}
                    onChange={() => toggle(option.id)}
                  />
                  {option.media}
                  <span className="access-row-body">
                    <span className="access-row-primary">{option.primary}</span>
                    {option.secondary && <span className="access-row-secondary">{option.secondary}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
