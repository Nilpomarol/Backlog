"use client";

import { Bug, ChevronDown, ChevronsUp, ChevronUp, CircleDashed, Feather, Gauge, Lightbulb, Lock, Minus, Mountain, Search, ShieldCheck, TrendingUp, Wrench } from "lucide-react";
import type { ItemEffort, ItemPriority, ItemStatus, ItemType } from "../lib/domain";
import { useLanguage } from "./providers";
import { effortLabels, priorityLabels, statusLabels, statusLabelsSingular, typeLabels } from "../lib/i18n";

/** Type is always icon + colour + label: never colour alone (WCAG 1.4.1). */
const typeIcons: Record<ItemType, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  improvement: TrendingUp,
  task: Wrench,
  investigation: Search,
};

export function TypeChip({
  type,
  size = 12,
  iconOnly = false,
}: {
  type: ItemType;
  size?: number;
  /** Renders as a small colour-coded icon badge with no label, for contexts where the title
   *  should lead — the icon shape alone still separates types, so a tooltip/aria-label carries
   *  the name for anyone who can't tell from colour and shape (WCAG 1.4.1). */
  iconOnly?: boolean;
}) {
  const { language } = useLanguage();
  const Icon = typeIcons[type];
  const label = typeLabels[language][type];

  if (iconOnly) {
    return (
      <span className={`type-badge type-badge-${type}`} role="img" aria-label={label} title={label}>
        <Icon size={size} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={`chip chip-${type}`}>
      <Icon size={size} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Priority is always icon + colour + label too, same WCAG rationale as type above. */
const priorityIcons: Record<ItemPriority, typeof ChevronsUp> = {
  urgent: ChevronsUp,
  high: ChevronUp,
  medium: Minus,
  low: ChevronDown,
  none: CircleDashed,
};

export function PriorityChip({
  priority,
  size = 12,
  iconOnly = false,
}: {
  priority: ItemPriority;
  size?: number;
  /** Same "quiet corner marker" variant as `TypeChip`'s — icon + colour + tooltip, no label. */
  iconOnly?: boolean;
}) {
  const { language } = useLanguage();
  const Icon = priorityIcons[priority];
  const label = priorityLabels[language][priority];

  if (iconOnly) {
    return (
      <span className={`priority-badge priority-badge-${priority}`} role="img" aria-label={label} title={label}>
        <Icon size={size} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={`chip chip-priority-${priority}`}>
      <Icon size={size} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Smallest first, matching ITEM_EFFORTS — "unknown" reuses priority's "none" glyph since both
 *  mean "nobody has estimated this yet". */
const effortIcons: Record<ItemEffort, typeof Feather> = {
  small: Feather,
  medium: Gauge,
  large: Mountain,
  unknown: CircleDashed,
};

export function EffortChip({ effort, size = 12 }: { effort: ItemEffort; size?: number }) {
  const { language } = useLanguage();
  const Icon = effortIcons[effort];
  return (
    <span className="chip chip-neutral">
      <Icon size={size} aria-hidden="true" />
      {effortLabels[language][effort]}
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

export function InternalChip({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const { t } = useLanguage();

  if (iconOnly) {
    return (
      <span className="internal-badge" role="img" aria-label={t.internal} title={t.internal}>
        <Lock size={12} aria-hidden="true" />
      </span>
    );
  }

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

export function usePriorityLabel() {
  const { language } = useLanguage();
  return (priority: ItemPriority) => priorityLabels[language][priority];
}

export { effortIcons, priorityIcons, typeIcons };
