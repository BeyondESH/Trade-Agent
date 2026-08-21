import React from "react";

export interface SeriesLane {
  name: string;
  color: string;
  values: number[];
  fill?: boolean;
}

/** Inline-SVG multi-lane line chart (one lane per series, own y-domain). */
export const SeriesChart: React.FC<{
  lanes: SeriesLane[];
  height?: number;
  className?: string;
}> = ({ lanes, height = 160, className = "" }) => {
  const n = Math.max(0, ...lanes.map((l) => l.values.length));
  if (n < 2 || lanes.length === 0) return null;
  const per = height / lanes.length;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
    >
      {lanes.map((lane, li) => {
        const min = Math.min(...lane.values);
        const max = Math.max(...lane.values);
        const range = max - min || 1;
        const pts = lane.values
          .map(
            (v, i) =>
              `${(i / (n - 1)) * 100},${li * per + per - ((v - min) / range) * (per - 2)}`,
          )
          .join(" ");
        const fillPts = `${pts} 100,${li * per + per} 0,${li * per + per}`;
        return (
          <g key={lane.name}>
            {lane.fill && <polygon points={fillPts} fill={lane.color} opacity={0.12} />}
            <polyline points={pts} fill="none" stroke={lane.color} strokeWidth={1.2} />
            <text
              x={1}
              y={li * per + 10}
              fontSize={4}
              fill={lane.color}
              fontWeight={600}
            >
              {lane.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
