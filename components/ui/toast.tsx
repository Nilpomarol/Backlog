"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "neutral" | "error";

export type ToastOptions = {
  tone?: ToastTone;
  /** Label for an inline action, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds before auto-dismiss. Toasts with an action get longer by default. */
  duration?: number;
};

type Toast = ToastOptions & { id: number; message: string };

type ToastContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

export function ToastProvider({ children, dismissLabel = "Dismiss", regionLabel = "Notifications" }: {
  children: ReactNode;
  dismissLabel?: string;
  regionLabel?: string;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    const duration = options.duration ?? (options.actionLabel ? 7000 : 4000);
    setToasts((current) => [...current, { ...options, id, message }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-label={regionLabel}>
        {toasts.map((item) => (
          <div key={item.id} className={`toast${item.tone === "error" ? " toast-error" : ""}`}>
            <span className="toast-message">{item.message}</span>
            {item.actionLabel && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  item.onAction?.();
                  dismiss(item.id);
                }}
              >
                {item.actionLabel}
              </button>
            )}
            <button type="button" className="toast-close" onClick={() => dismiss(item.id)} aria-label={dismissLabel}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
