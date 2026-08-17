import type { ReactNode } from "react";
import type { TKey } from "../lib/i18n";
import { useI18n } from "../lib/i18n";
import { AlertIcon, BrokerIcon, DataWindowIcon, DomIcon, WatchlistIcon } from "../ui/icons";

export type RightTabId = "watchlist" | "alerts" | "datawindow" | "dom" | "broker";

export interface RightTabDef {
  id: RightTabId;
  labelKey: TKey;
  icon: ReactNode;
}

export const MIN_PANEL_WIDTH = 260;
export const MAX_PANEL_WIDTH = 500;

export function rightTabIcons(): Omit<RightTabDef, "labelKey">[] {
  return [
    { id: "watchlist", icon: <WatchlistIcon size={20} /> },
    { id: "alerts", icon: <AlertIcon size={20} /> },
    { id: "datawindow", icon: <DataWindowIcon size={20} /> },
    { id: "dom", icon: <DomIcon size={20} /> },
    { id: "broker", icon: <BrokerIcon size={20} /> },
  ];
}

interface Props {
  tabs: RightTabDef[];
  activeTab: RightTabId | null;
  onTabChange: (id: RightTabId) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  renderPanel: (tab: RightTabId) => ReactNode;
}

/** 44px icon rail + collapsible 260-500px panel. */
export function TVRightSidebar({
  tabs,
  activeTab,
  onTabChange,
  panelOpen,
  onTogglePanel,
  width,
  onWidthChange,
  renderPanel,
}: Props) {
  const { t } = useI18n();

  const startWidthDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => {
      onWidthChange(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startW - (ev.clientX - startX))));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="flex shrink-0" data-testid="tv-right-sidebar">
      {/* icon rail */}
      <div className="flex w-11 shrink-0 flex-col items-stretch border-l border-border bg-panel py-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id && panelOpen;
          return (
            <button
              key={tab.id}
              title={t(tab.labelKey)}
              onClick={() => {
                if (activeTab === tab.id && panelOpen) {
                  onTogglePanel();
                } else {
                  onTabChange(tab.id);
                  if (!panelOpen) onTogglePanel();
                }
              }}
              className={`relative flex h-9 w-full items-center justify-center transition ${
                active ? "text-text" : "text-muted hover:bg-hover hover:text-text"
              }`}
              data-testid={`rail-${tab.id}`}
            >
              {active && <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-accent" />}
              {tab.icon}
            </button>
          );
        })}
      </div>

      {/* panel */}
      {panelOpen && activeTab && (
        <div
          className="relative flex flex-col border-l border-border bg-panel"
          style={{ width }}
          data-testid="right-panel"
        >
          <div
            onMouseDown={startWidthDrag}
            className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-accent/30"
            data-testid="right-panel-drag"
          />
          <div className="min-h-0 flex-1 overflow-hidden">{renderPanel(activeTab)}</div>
        </div>
      )}
    </div>
  );
}
