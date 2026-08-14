import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.css";

export const LAYOUT_VERSION = 2;
export const STORAGE_KEY = "raibro-terminal-layout";

export interface PanelDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface SavedLayout {
  version: number;
  grid: PanelDef[];
}

export const DEFAULT_LAYOUT: PanelDef[] = [
  { id: "market-list", x: 0, y: 0, w: 3, h: 12, minW: 2, minH: 4 },
  { id: "chart", x: 3, y: 0, w: 6, h: 9, minW: 4, minH: 4 },
  { id: "right-panel", x: 9, y: 0, w: 3, h: 12, minW: 2, minH: 4 },
  { id: "ai-panel", x: 3, y: 9, w: 6, h: 3, minW: 4, minH: 2 },
];

export function loadSavedLayout(): PanelDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const saved = JSON.parse(raw) as SavedLayout;
    if (saved.version !== LAYOUT_VERSION || !Array.isArray(saved.grid) || saved.grid.length === 0) {
      return DEFAULT_LAYOUT;
    }
    return saved.grid;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function clearSavedLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

interface Props {
  panelIds: string[];
  children: (id: string) => ReactNode;
  onPanelResize?: (id: string) => void;
  onPanelMove?: (id: string) => void;
}

const VERTICAL_MARGIN = 6;

export function GridStackLayout({ panelIds, children, onPanelResize, onPanelMove }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<GridStack | null>(null);
  const [slots, setSlots] = useState<Map<string, HTMLElement>>(new Map());
  const panelIdsKey = panelIds.join(",");
  const callbacksRef = useRef({ onPanelResize, onPanelMove });
  callbacksRef.current = { onPanelResize, onPanelMove };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const grid = GridStack.init(
      {
        column: 12,
        cellHeight: 28,
        margin: VERTICAL_MARGIN,
        minRow: 12,
        float: false,
        animate: true,
        handle: ".panel-header",
        resizable: { handles: "e, se, s, w, sw, nw, ne, n" },
      },
      el,
    );
    if (!grid) return;
    gridRef.current = grid;

    const saved = loadSavedLayout();
    grid.batchUpdate();
    grid.removeAll();
    for (const panel of saved) {
      grid.addWidget({
        id: panel.id,
        x: panel.x,
        y: panel.y,
        w: panel.w,
        h: panel.h,
        minW: panel.minW,
        minH: panel.minH,
      });
    }
    grid.batchUpdate(false);

    const slotMap = new Map<string, HTMLElement>();
    el.querySelectorAll<HTMLDivElement>(".grid-stack-item").forEach((item) => {
      const id = item.getAttribute("gs-id");
      const content = item.querySelector<HTMLElement>(".grid-stack-item-content");
      if (id && content) slotMap.set(id, content);
    });
    setSlots(new Map(slotMap));

    // Fill the window: keep the grid height equal to the container height by
    // recomputing cellHeight from the available vertical space. Observe the
    // outer wrapper (whose height comes from flex layout), not the grid
    // element itself (whose height gridstack manages).
    const outer = containerRef.current?.parentElement ?? el;
    let raf = 0;
    const fillHeight = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rows = grid.getRow() || grid.opts.minRow || 12;
        const available = outer.clientHeight || outer.offsetHeight || window.innerHeight;
        const cellH = Math.max(24, available / rows);
        grid.cellHeight(cellH);
        grid.onResize();
      });
    };
    fillHeight();
    const ro = new ResizeObserver(fillHeight);
    ro.observe(outer);
    window.addEventListener("resize", fillHeight);

    grid.on("resizestop", (_event, el) => {
      const id = el?.getAttribute("gs-id") ?? "";
      callbacksRef.current.onPanelResize?.(id);
    });
    grid.on("dragstop", (_event, el) => {
      const id = el?.getAttribute("gs-id") ?? "";
      callbacksRef.current.onPanelMove?.(id);
    });
    grid.on("change", () => {
      try {
        const serialized = grid.save(false) as PanelDef[];
        const payload: SavedLayout = { version: LAYOUT_VERSION, grid: serialized };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* storage may be unavailable */
      }
    });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fillHeight);
      cancelAnimationFrame(raf);
      grid.removeAll(true);
      grid.destroy(false);
      gridRef.current = null;
      setSlots(new Map());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelIdsKey]);

  return (
    <div className="h-full min-h-0" data-testid="gridstack-layout">
      <div ref={containerRef} className="grid-stack h-full min-h-0" data-testid="gridstack-grid" />
      {panelIds.map((id) => {
        const slot = slots.get(id);
        if (!slot) return null;
        return createPortal(
          <div className="h-full min-h-0 overflow-hidden">{children(id)}</div>,
          slot,
        );
      })}
    </div>
  );
}
