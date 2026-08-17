import type { DrawingToolType } from "../types/trading";

/**
 * Map the template DrawingToolbar tools (26 kinds) to klinecharts overlay
 * names. Built-in klinecharts overlays (segment, straightLine, ...) are
 * registered by the core; the additional tools (rect, triangle, fibonacci
 * family, gannBox, waves, abcd, ...) come from the vendored klinecharts-pro
 * extension pack (`@klinecharts/pro` registers them on import).
 */
export const DRAWING_TOOL_OVERLAYS: Record<DrawingToolType, string | null> = {
  cursor: null,
  crosshair: null,
  dot: "dot",
  eraser: null,
  trendline: "segment",
  ray: "rayLine",
  info_line: "simpleTag",
  horizontal_line: "horizontalStraightLine",
  horizontal_ray: "horizontalRayLine",
  vertical_line: "verticalStraightLine",
  parallel_channel: "parallelStraightLine",
  fib_retracement: "fibonacciLine",
  fib_extension: "fibonacciExtension",
  pitchfork: "fibonacciSpeedResistanceFan",
  rectangle: "rect",
  circle: "circle",
  brush: "parallelStraightLine",
  highlighter: "highlighter",
  text: "simpleAnnotation",
  callout: "simpleTag",
  price_label: "priceLine",
  long_position: "priceLine",
  short_position: "priceLine",
  price_range: "priceChannelLine",
  date_range: "verticalSegment",
  measure: "segment",
};

/** Resolve the overlay name for a template drawing tool; null = no overlay. */
export function overlayForTool(tool: DrawingToolType): string | null {
  return DRAWING_TOOL_OVERLAYS[tool] ?? null;
}
