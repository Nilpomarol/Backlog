"use client";

import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { classes } from "../../lib/format";
import { Button, IconButton } from "./primitives";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab inside `container`, closes on Escape, and returns focus to whatever was focused
 * before the overlay opened.
 */
function useFocusTrap(container: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = container.current;
    if (!node) return;

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables()[0];
    (first ?? node).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [container, open, onClose]);
}

// --- Dialog ---------------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <h2 className="dialog-title" id={titleId} style={{ flex: 1 }}>
            {title}
          </h2>
          <IconButton label={closeLabel} size="sm" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
        {children}
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  closeLabel,
  destructive,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="dialog-body">{body}</p>
    </Dialog>
  );
}

// --- Sheet (bottom sheet on mobile, side panel on desktop) -----------------------------------

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <header className="sheet-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="sheet-title" id={titleId}>
              {title}
            </h2>
            {subtitle && <p className="field-hint">{subtitle}</p>}
          </div>
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </>
  );
}

// --- Dropdown menu ----------------------------------------------------------------------------

export function Menu({
  trigger,
  children,
  label,
  align = "down",
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const closedByOutsideClick = useRef(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) {
        // The user is reaching for something else; don't drag focus back to the trigger.
        closedByOutsideClick.current = true;
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /**
   * Return focus to the trigger when the menu closes. This runs before the effects of anything
   * the menu item opened, so a dialog mounting in the same commit captures the trigger as its
   * focus-return target rather than the menu item that has just unmounted.
   */
  useEffect(() => {
    if (wasOpen.current && !open && !closedByOutsideClick.current) {
      anchor.current?.querySelector<HTMLElement>("button")?.focus();
    }
    if (!open) closedByOutsideClick.current = false;
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="menu-anchor" ref={anchor}>
      {trigger({ onClick: () => setOpen((value) => !value), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div className={classes("menu", align === "up" && "menu-up")} role="menu" aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  icon,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={classes("menu-item", danger && "menu-item-danger")}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label">{children}</div>;
}
