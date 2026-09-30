import { BookOpen, ChevronDown, ChevronUp, Filter, Maximize2, Minimize2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useState } from "react";
import type { SymbolInfo } from "../../types/trading";
import { NotesPanel } from "./NotesPanel";
import { ScreenerPanel } from "./ScreenerPanel";

interface Props {
  symbol: SymbolInfo;
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onOpenChange?: (open: boolean) => void;
  theme: "dark" | "light";
}

type BottomTab = "screener" | "notes";

const DRAWER_SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

export const BottomDock: React.FC<Props> = ({
  symbol,
  symbols,
  onSelectSymbol,
  onOpenChange,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<BottomTab>("screener");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const reduce = useReducedMotion();

  const setOpen = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  const toggleTab = (tab: BottomTab) => {
    if (activeTab === tab && isOpen) {
      setOpen(false);
    } else {
      setActiveTab(tab);
      setOpen(true);
    }
  };

  const tabs = [
    {
      id: "screener" as BottomTab,
      label: "Stock / Crypto Screener",
      icon: Filter,
    },
    { id: "notes" as BottomTab, label: "Text Notes", icon: BookOpen },
  ];

  return (
    <div
      id="tradingview-bottom-dock"
      className="flex flex-col flex-none border-t border-line bg-surface z-20 select-none"
    >
      {/* Tab Navigation Header Bar */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-line bg-surface text-xs">
        <div className="flex items-center gap-1 h-full overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id && isOpen;

            return (
              <button
                key={tab.id}
                id={`bottom-tab-${tab.id}`}
                onClick={() => toggleTab(tab.id)}
                className={`relative h-full flex items-center gap-1.5 px-3 font-medium transition-colors ${
                  isActive ? "text-signal font-semibold" : "text-muted hover:text-content"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="bottom-dock-tab-underline"
                    transition={reduce ? { duration: 0 } : DRAWER_SPRING}
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-signal"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Toggle Controls */}
        <div className="flex items-center gap-1">
          {isOpen && (
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1 rounded-md text-muted hover:bg-surface-2 hover:text-content"
              title={isMaximized ? "Restore Height" : "Maximize Panel"}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            onClick={() => setOpen(!isOpen)}
            className="p-1 rounded-md text-muted hover:bg-surface-2 hover:text-content"
            title={isOpen ? "Collapse Panel" : "Expand Panel"}
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Drawer — springs open to its content height; the
          inner min-height is what isMaximized raises. No inner clipping. */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="bottom-drawer"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : DRAWER_SPRING}
            className="overflow-hidden"
          >
            <div className={isMaximized ? "min-h-[420px]" : "min-h-[230px]"}>
              {activeTab === "screener" && (
                <ScreenerPanel symbols={symbols} onSelectSymbol={onSelectSymbol} theme={theme} />
              )}

              {activeTab === "notes" && <NotesPanel symbol={symbol} theme={theme} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
