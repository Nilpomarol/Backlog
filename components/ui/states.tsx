"use client";

import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { classes } from "../../lib/format";
import { Button } from "./primitives";

/**
 * Empty states are deliberately distinct by cause. "Nothing matched your filters" and "nothing
 * exists yet" look identical in most products, which reads as breakage.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
  tone?: "neutral" | "success";
}) {
  return (
    <div
      className={classes("empty-state", compact && "empty-state-compact", tone === "success" && "empty-state-success")}
    >
      <span className="empty-state-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="error-state-body">
        <p className="error-state-title">{title}</p>
        <p>{message}</p>
      </div>
      {onRetry && retryLabel && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
