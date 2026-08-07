"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { classes, initials } from "../../lib/format";

// --- Button ---------------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-quiet";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, loading, icon, children, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={classes(
        "btn",
        `btn-${variant}`,
        size !== "md" && `btn-${size}`,
        block && "btn-block",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md";
  tone?: "default" | "danger";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", tone = "default", children, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={classes("icon-btn", size === "sm" && "icon-btn-sm", tone === "danger" && "icon-btn-danger", className)}
      {...rest}
    >
      {children}
    </button>
  );
});

// --- Field wrapper --------------------------------------------------------------------------

type FieldProps = {
  label: string;
  htmlFor?: string;
  optional?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  /** Rendered under the control, right-aligned (character counters). */
  trailing?: ReactNode;
};

export function Field({ label, htmlFor, optional, hint, error, children, trailing }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="field-optional">{optional}</span>}
      </label>
      {children}
      {trailing}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          {error}
        </p>
      )}
    </div>
  );
}

/** Field + input in one, wiring up id, aria-invalid and aria-describedby. */
export function TextField({
  label,
  optional,
  hint,
  error,
  large,
  trailing,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  optional?: string;
  hint?: string;
  error?: string;
  large?: boolean;
  trailing?: ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="field-optional">{optional}</span>}
      </label>
      <input
        id={id}
        className={classes("input", large && "input-lg")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {trailing}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          <AlertCircle size={13} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  label,
  optional,
  hint,
  error,
  trailing,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  optional?: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="field-optional">{optional}</span>}
      </label>
      <textarea
        id={id}
        className="textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {trailing}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          <AlertCircle size={13} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" aria-describedby={hint ? `${id}-hint` : undefined} {...rest}>
        {children}
      </select>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={classes("input", className)} {...rest} />;
});

// --- Segmented control ----------------------------------------------------------------------

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: ReactNode };

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  block,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  block?: boolean;
}) {
  return (
    <div className={classes("segmented", block && "segmented-block")} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="segmented-item"
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

// --- Avatar ---------------------------------------------------------------------------------

export function Avatar({
  name,
  url,
  size = "sm",
  admin,
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  admin?: boolean;
}) {
  return (
    <span
      className={classes("avatar", size === "md" && "avatar-md", size === "lg" && "avatar-lg", admin && "avatar-admin")}
      aria-hidden="true"
    >
      {url ? (
        // User-chosen HTTPS avatar hosts cannot use a fixed next/image allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

// --- AppIcon ----------------------------------------------------------------------------------

/** An app's mark: its logo image when set, otherwise the first letter of its name. */
export function AppIcon({
  name,
  logoUrl,
  className,
  style,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={classes("app-icon", className)} style={style} aria-hidden="true">
      {logoUrl ? (
        // App-chosen HTTPS logo hosts cannot use a fixed next/image allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
      ) : (
        name.trim().charAt(0).toUpperCase() || "•"
      )}
    </span>
  );
}

// --- Progress -------------------------------------------------------------------------------

export function SubtaskProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = total > 0 && done === total;
  return (
    <div className="progress-row">
      <span
        className="progress-track"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done}/${total} ${label}`}
      >
        <span className={classes("progress-fill", complete && "progress-fill-complete")} style={{ width: `${percent}%` }} />
      </span>
      <span>
        {done}/{total}
      </span>
    </div>
  );
}

// --- Loading --------------------------------------------------------------------------------

export function Spinner({ label }: { label: string }) {
  return <Loader2 size={16} className="spin" aria-label={label} role="status" />;
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-line" style={{ width: "38%" }} />
      <div className="skeleton skeleton-line" style={{ width: "92%" }} />
      <div className="skeleton skeleton-line" style={{ width: "64%" }} />
    </div>
  );
}

export function SkeletonList({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div className="request-list" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
