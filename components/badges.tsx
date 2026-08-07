"use client";

import { Bug, Lightbulb, Lock, ShieldCheck, TrendingUp, Wrench } from "lucide-react";
import type { ItemStatus, ItemType } from "../lib/domain";
import { useLanguage } from "./providers";
import { statusLabels, statusLabelsSingular, typeLabels } from "../lib/i18n";

/** Type is always icon + colour + label: never colour alone (WCAG 1.4.1). */
const typeIcons: Record<ItemType, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  improvement: TrendingUp,
  task: Wrench,
};

export function TypeChip({ type, size = 12 }: { type: ItemType; size?: number }) {
  const { language } = useLanguage();
  const Icon = typeIcons[type];
  return (
    <span className={`chip chip-${type}`}>
      <Icon size={size} aria-hidden="true" />
      {typeLabels[language][type]}
    </span>
  );
}

export function StatusDot({ status }: { status: ItemStatus }) {
  return <span className={`status-dot status-dot-${status}`} aria-hidden="true" />;
}

export function StatusPill({ status, plural }: { status: ItemStatus; plural?: boolean }) {
  const { language } = useLanguage();
  const labels = plural ? statusLabels : statusLabelsSingular;
  return (
    <span className={`status-pill status-pill-${status}`}>
      <StatusDot status={status} />
      {labels[language][status]}
    </span>
  );
}

export function InternalChip() {
  const { t } = useLanguage();
  return (
    <span className="chip chip-internal">
      <Lock size={11} aria-hidden="true" />
      {t.internal}
    </span>
  );
}

export function AdminChip() {
  const { t } = useLanguage();
  return (
    <span className="chip chip-neutral">
      <ShieldCheck size={11} aria-hidden="true" />
      {t.adminCreated}
    </span>
  );
}

export function useStatusLabel() {
  const { language } = useLanguage();
  return (status: ItemStatus, plural = false) =>
    (plural ? statusLabels : statusLabelsSingular)[language][status];
}

export function useTypeLabel() {
  const { language } = useLanguage();
  return (type: ItemType) => typeLabels[language][type];
}

export { typeIcons };
