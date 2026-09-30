import type React from "react";
import { cn } from "../../lib/utils";

/**
 * A loading placeholder shaped like the content it replaces, so the layout does
 * not jump when data lands. Shimmer only - no spinners in dense surfaces.
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden="true"
    className={cn("relative overflow-hidden rounded-md bg-surface-2", className)}
  >
    <div className="absolute inset-0 -translate-x-full animate-[ta-sweep_1.4s_infinite] bg-gradient-to-r from-transparent via-content/5 to-transparent" />
  </div>
);
