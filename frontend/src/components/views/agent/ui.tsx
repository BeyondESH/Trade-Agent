import React from "react";
import { ThemeMode } from "../../../types/trading";

export function cardCls(theme: ThemeMode): string {
  return `rounded-xl border ${
    theme === "dark" ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"
  }`;
}

export function inputCls(theme: ThemeMode): string {
  return `w-full px-2 py-1.5 rounded-md border text-sm font-mono outline-none ${
    theme === "dark"
      ? "bg-[#131722] border-[#2a2e39] text-[#d1d4dc] focus:border-[#2962ff]"
      : "bg-[#f0f3fa] border-[#cbcfd9] text-[#131722] focus:border-[#2962ff]"
  }`;
}

export function selectCls(theme: ThemeMode): string {
  return `px-2 py-1.5 rounded-md border text-sm outline-none ${
    theme === "dark"
      ? "bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]"
      : "bg-white border-[#cbcfd9] text-[#131722]"
  }`;
}

export function btnCls(theme: ThemeMode, variant: "primary" | "ghost" = "primary"): string {
  if (variant === "primary") {
    return "px-3 py-1.5 rounded-md text-sm font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  }
  return `px-3 py-1.5 rounded-md text-sm font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    theme === "dark"
      ? "border-[#2a2e39] text-[#d1d4dc] hover:bg-[#2a2e39]"
      : "border-[#cbcfd9] text-[#131722] hover:bg-[#f0f3fa]"
  }`;
}

export const Panel: React.FC<{
  title: string;
  theme: ThemeMode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, theme, right, children, className = "" }) => (
  <div className={`${cardCls(theme)} p-4 flex flex-col gap-3 ${className}`}>
    <div className="flex items-center justify-between border-b pb-2 border-gray-500/20">
      <span className="font-bold text-sm">{title}</span>
      {right}
    </div>
    {children}
  </div>
);

export const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className = "" }) => (
  <label className={`flex flex-col gap-1 text-xs ${className}`}>
    <span className="text-gray-400 font-medium">{label}</span>
    {children}
  </label>
);

export const fmtPct = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  return `${(v * 100).toFixed(2)}%`;
};

export const fmtNum = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
};

export const fmtTime = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};
