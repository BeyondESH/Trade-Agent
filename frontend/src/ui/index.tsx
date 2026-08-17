import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-panel border border-border rounded-modal flex flex-col min-h-0 ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border text-xs font-semibold text-muted uppercase tracking-wide">
          <span>{title}</span>
          {right}
        </div>
      )}
      <div className="p-3 overflow-auto min-h-0">{children}</div>
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "up" | "down";
};
const BTN_STYLES: Record<string, string> = {
  primary: "bg-accent text-black hover:brightness-110",
  ghost: "bg-panel2 text-text border border-border hover:border-muted",
  up: "bg-up text-black hover:brightness-110",
  down: "bg-down text-white hover:brightness-110",
};
export function Button({ variant = "ghost", className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`px-3 py-1.5 rounded-btn text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition ${BTN_STYLES[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`bg-base border border-border rounded-btn px-2 py-1.5 text-[13px] text-text tnum outline-none focus:border-accent w-full ${className}`}
      {...rest}
    />
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border px-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition ${
            active === t.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = "muted", children }: { tone?: "up" | "down" | "muted"; children: ReactNode }) {
  const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-muted";
  return <span className={`tnum ${c}`}>{children}</span>;
}
