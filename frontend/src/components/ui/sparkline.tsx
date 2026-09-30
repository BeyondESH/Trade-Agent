import type React from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";

interface Props {
  values: number[];
  up: boolean;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * A close-price sparkline with a gradient area fill and a marker on the last
 * point. Deliberately not a chart: no axes, no labels, one job - let the eye
 * read direction and shape in a 28px row.
 */
export const Sparkline: React.FC<Props> = ({
  values,
  up,
  width = 96,
  height = 28,
  strokeWidth = 1.5,
  className,
}) => {
  const gradientId = useId();
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 1 - ((v - min) / range) * (height - 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} ${width.toFixed(2)},${height} 0,${height}`;
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("overflow-visible", up ? "text-up" : "text-down", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.9} fill="currentColor" />
    </svg>
  );
};
