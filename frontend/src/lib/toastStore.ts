import { useEffect, useState } from "react";

export interface Toast {
  id: string;
  title: string;
  message?: string;
}

type ToastListener = (toasts: Toast[]) => void;

const DEFAULT_TTL_MS = 5000;

let toasts: Toast[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function getToasts(): Toast[] {
  return toasts;
}

export function subscribeToasts(fn: ToastListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(): void {
  for (const fn of [...listeners]) {
    try {
      fn(toasts);
    } catch {
      /* listener errors must not break the store */
    }
  }
}

/** Append a toast, deduped by id, auto-dismissing after `ttlMs`. */
export function pushToast(toast: Toast, ttlMs: number = DEFAULT_TTL_MS): void {
  if (toasts.some((t) => t.id === toast.id)) return;
  toasts = [...toasts, toast];
  emit();
  scheduleDismiss(toast.id, ttlMs);
}

/** Remove a toast by id (also used by the auto-dismiss timer). */
export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function scheduleDismiss(id: string, ttlMs: number): void {
  if (timers.has(id)) return;
  const handle = setTimeout(() => {
    timers.delete(id);
    dismissToast(id);
  }, ttlMs);
  timers.set(id, handle);
}

/** React binding: re-renders the caller whenever the toast list changes. */
export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(() => getToasts());
  useEffect(() => subscribeToasts(setList), []);
  return list;
}
