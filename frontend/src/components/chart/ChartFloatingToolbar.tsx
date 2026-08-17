import { useMemo } from "react";
import type { Chart, Overlay } from "klinecharts";
import { useI18n } from "../../lib/i18n";

const COLORS = ["#089981", "#f23645", "#2962ff", "#d1d4dc"];
const WIDTHS = [1, 2, 3];

interface Props {
  chart: Chart | null;
  overlayId: string | null;
  onClose: () => void;
}

/** Floating toolbar that appears next to a selected drawing. */
export function ChartFloatingToolbar({ chart, overlayId, onClose }: Props) {
  const { t } = useI18n();

  const pos = useMemo(() => {
    if (!chart || !overlayId) return null;
    const overlay = chart.getOverlayById(overlayId) as Overlay | null;
    if (!overlay || overlay.points.length === 0) return null;
    const pt = overlay.points[0];
    const finder = { paneId: overlay.paneId ?? "candle_pane" };
    const coord = chart.convertToPixel(pt as never, finder);
    if (Array.isArray(coord)) return { x: coord[0]?.x ?? 0, y: (coord[0]?.y ?? 0) - 8 };
    return { x: (coord as { x: number })?.x ?? 0, y: ((coord as { y: number })?.y ?? 0) - 8 };
  }, [chart, overlayId]);

  if (!pos) return null;

  const applyStyle = (styles: Record<string, unknown>) => {
    if (!chart || !overlayId) return;
    chart.overrideOverlay({ id: overlayId, styles } as never);
  };
  const remove = () => {
    if (!chart || !overlayId) return;
    chart.removeOverlay({ id: overlayId });
    onClose();
  };

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-float border border-border bg-panel px-1.5 py-1 shadow-float"
      style={{ left: Math.max(60, pos.x), top: Math.max(2, pos.y) }}
      data-testid="floating-toolbar"
    >
      <span className="px-1 text-[10px] uppercase text-muted">{t("toolbar.color")}</span>
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => applyStyle({ line: { color: c } })}
          className="h-4 w-4 rounded-full border border-border"
          style={{ background: c }}
        />
      ))}
      <span className="ml-1 px-1 text-[10px] uppercase text-muted">{t("toolbar.width")}</span>
      {WIDTHS.map((w) => (
        <button
          key={w}
          onClick={() => applyStyle({ line: { size: w } })}
          className="rounded-chip px-1.5 text-[11px] text-muted hover:bg-hover hover:text-text"
        >
          {w}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        onClick={remove}
        className="rounded-chip px-1.5 text-xs text-muted hover:bg-hover hover:text-down"
        data-testid="toolbar-delete"
      >
        {t("toolbar.delete")}
      </button>
      <button onClick={onClose} className="rounded-chip px-1.5 text-xs text-muted hover:bg-hover hover:text-text">
        ✕
      </button>
    </div>
  );
}
