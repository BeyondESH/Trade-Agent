export interface ToastItem {
  id: string;
  text: string;
}

interface Props {
  toasts: ToastItem[];
}

/** Top-right floating toast stack (alert triggers, app notices). */
export function ToastStack({ toasts }: Props) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-modal border border-border bg-panel px-3 py-2 text-xs text-text shadow-float"
          data-testid={`toast-${toast.id}`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
