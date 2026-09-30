import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface Props {
  value: number;
  format: (value: number) => string;
  /** Colour the value itself by sign. Off by default (value stays neutral). */
  tone?: "neutral" | "signed";
  className?: string;
}

/**
 * A quote cell that washes jade/coral the instant its value changes, then
 * decays. This is the terminal's heartbeat: it makes the feed legible at a
 * glance without a single pixel of layout shifting.
 */
export const FlashNumber: React.FC<Props> = ({ value, format, tone = "neutral", className }) => {
  const previous = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (previous.current === value) return;
    const direction = value > previous.current ? "up" : "down";
    previous.current = value;
    setFlash(direction);
    const timer = window.setTimeout(() => setFlash(null), 460);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span
      className={cn(
        "ta-num rounded-sm px-0.5 transition-colors duration-300",
        flash === "up" && "bg-up/25",
        flash === "down" && "bg-down/25",
        tone === "signed" && (value >= 0 ? "text-up" : "text-down"),
        className,
      )}
    >
      {format(value)}
    </span>
  );
};
