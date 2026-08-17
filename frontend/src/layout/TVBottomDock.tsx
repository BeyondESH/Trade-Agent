import type { ReactNode } from "react";
import type { TKey } from "../lib/i18n";
import { useI18n } from "../lib/i18n";

export type DockTabId = "ai" | "backtest" | "screener" | "broker";

export interface DockTabDef {
  id: DockTabId;
  labelKey: TKey;
}

export const DOCK_MIN_VH = 20;
export const DOCK_MAX_VH = 40;

interface Props {
  tabs: DockTabDef[];
  activeTab: DockTabId | null;
  onTabChange: (id: DockTabId) => void;
  expanded: boolean;
  onToggle: () => void;
  heightVh: number;
  onHeightChange: (vh: number) => void;
  renderPanel: (tab: DockTabId) => ReactNode;
}

/** Collapsed 30px tab bar that expands into a 20-40vh drawer. */
export function TVBottomDock({
  tabs,
  activeTab,
  onTabChange,
  expanded,
  onToggle,
  heightVh,
  onHeightChange,
  renderPanel,
}: Props) {
  const { t } = useI18n();

  const startHeightDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVh = heightVh;
    const vh = () => (window.innerHeight / 100);
    const move = (ev: MouseEvent) => {
      const dy = (startY - ev.clientY) / vh();
      onHeightChange(Math.min(DOCK_MAX_VH, Math.max(DOCK_MIN_VH, startVh + dy)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className="flex shrink-0 flex-col border-t border-border bg-panel"
      style={expanded ? { height: `${heightVh}vh` } : undefined}
      data-testid="tv-bottom-dock"
    >
      {/* drag handle when expanded */}
      {expanded && (
        <div
          onMouseDown={startHeightDrag}
          className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-accent/30"
          data-testid="dock-drag"
        />
      )}
      {/* tab bar */}
      <div className="flex h-[30px] shrink-0 items-center gap-0.5 px-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.id && expanded;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTab === tab.id && expanded) {
                  onToggle();
                } else {
                  onTabChange(tab.id);
                  if (!expanded) onToggle();
                }
              }}
              className={`relative h-full px-3 text-xs transition ${
                active ? "text-text" : "text-muted hover:bg-hover hover:text-text"
              }`}
              data-testid={`dock-tab-${tab.id}`}
            >
              {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />}
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>
      {/* content */}
      {expanded && activeTab && (
        <div className="min-h-0 flex-1 overflow-hidden border-t border-border" data-testid="dock-panel">
          {renderPanel(activeTab)}
        </div>
      )}
    </div>
  );
}
