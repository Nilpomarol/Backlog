"use client";

import { Check, ChevronDown, X } from "lucide-react";
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
import { markRouteTransitionEnd } from "../../lib/route-transition";
import { Button, IconButton } from "./primitives";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab inside `container`, closes on Escape, and returns focus to whatever was focused
 * before the overlay opened.
 */
function useFocusTrap(container: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  // onClose is a fresh closure on every render of the caller (e.g. it closes over form state
  // that changes on each keystroke). Reading it via a ref keeps the effect below from re-running
  // — and re-stealing focus to the first focusable element — on every parent re-render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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
        onCloseRef.current();
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
  }, [container, open]);
}

/**
 * Makes a back-press (physical button or mobile swipe gesture) close this overlay instead of
 * navigating the whole page away — the behaviour people expect from a sheet/dialog. While open,
 * a same-URL history entry is pushed; popping it (via back) closes the overlay. Closing any
 * other way (X, backdrop, Escape, confirming an action) pops that entry back off, but only if
 * nothing else has navigated in the meantime — if the overlay is closing because a real
 * navigation already happened (e.g. delete-then-redirect), history.state no longer belongs to
 * us and we leave it alone rather than fight that navigation.
 *
 * Controls opened inside the overlay (e.g. filter chips) may call `router.replace()` while it's
 * open, which rewrites this same history entry's URL in place rather than pushing a new one. If
 * that happened, popping the entry via `history.back()` would silently discard those changes by
 * landing back on the URL the entry had when it was pushed. So: only go back if the URL is still
 * what it was at open time; otherwise just strip our marker in place, leaving the entry (and its
 * updated URL) intact.
 */
function useHistoryBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const openedAtHref = window.location.href;
    window.history.pushState({ vinextOverlay: true }, "");
    let consumedByPopstate = false;

    function onPopState() {
      consumedByPopstate = true;
      // The resulting same-URL "back" doesn't change the page's content, so the route-transition
      // indicator (wired to real navigations) would otherwise wait on a commit that never comes.
      markRouteTransitionEnd();
      onCloseRef.current();
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (consumedByPopstate) return;
      const state = window.history.state as { vinextOverlay?: boolean } | null;
      if (!state?.vinextOverlay) return;
      if (window.location.href === openedAtHref) {
        window.history.back();
      } else {
        const { vinextOverlay: _vinextOverlay, ...rest } = state;
        window.history.replaceState(rest, "");
      }
    };
  }, [open]);
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
  useHistoryBackToClose(open, onClose);
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
  useHistoryBackToClose(open, onClose);
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
  panelClassName,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "up" | "down";
  /** Extra class on the popover panel — lets a form-field dropdown (see Dropdown below) span
   *  the trigger's width instead of the action-menu default of hugging its right edge. */
  panelClassName?: string;
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
        <div className={classes("menu", align === "up" && "menu-up", panelClassName)} role="menu" aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

// --- Dropdown (single-choice field, styled like a select but with icons) --------------------

export type DropdownOption<T extends string> = { value: T; label: string; icon?: ReactNode };

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  id,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  label: string;
  id?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu
      label={label}
      panelClassName="dropdown-panel"
      trigger={(props) => (
        <button type="button" id={id} className="dropdown-trigger" {...props}>
          <span className="dropdown-trigger-value">
            {current?.icon}
            {current?.label}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          {options.map((option) => (
            <MenuItem
              key={option.value}
              icon={option.icon}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              {option.label}
              {option.value === value && <Check size={14} aria-hidden="true" className="dropdown-check" />}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
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
