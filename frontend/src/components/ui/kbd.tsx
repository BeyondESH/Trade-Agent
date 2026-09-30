import type React from "react";
import { cn } from "../../lib/utils";

/** Keyboard hint chip. Uses tabular figures so shortcuts align in a column. */
export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <kbd
    className={cn(
      "ta-num inline-flex h-4 min-w-4 items-center justify-center rounded border border-line/70 bg-surface-2 px-1 text-2xs font-semibold text-muted",
      className,
    )}
  >
    {children}
  </kbd>
);
