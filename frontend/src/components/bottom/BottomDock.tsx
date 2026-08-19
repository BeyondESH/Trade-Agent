import React, { useState } from 'react';
import {
  SymbolInfo,
  AccountState,
  Position,
  Order,
  BacktestResult,
} from '../../types/trading';
import {
  LineChart,
  DollarSign,
  Filter,
  BookOpen,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { StrategyTester } from './StrategyTester';
import { TradingPanel } from './TradingPanel';
import { ScreenerPanel } from './ScreenerPanel';
import { NotesPanel } from './NotesPanel';

interface Props {
  symbol: SymbolInfo;
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  account: AccountState;
  positions: Position[];
  orders: Order[];
  onClosePosition: (id: string) => void;
  onCancelOrder: (id: string) => void;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  backtestResult: BacktestResult;
  onOpenChange?: (open: boolean) => void;
  theme: 'dark' | 'light';
}

type BottomTab = 'screener' | 'strategy' | 'trading' | 'notes';

export const BottomDock: React.FC<Props> = ({
  symbol,
  symbols,
  onSelectSymbol,
  account,
  positions,
  orders,
  onClosePosition,
  onCancelOrder,
  onOpenOrderModal,
  backtestResult,
  onOpenChange,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<BottomTab>('trading');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const isDark = theme === 'dark';

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
    { id: 'screener' as BottomTab, label: 'Stock / Crypto Screener', icon: Filter },
    { id: 'strategy' as BottomTab, label: 'Strategy Tester', icon: LineChart },
    { id: 'trading' as BottomTab, label: `Trading Panel (${positions.length})`, icon: DollarSign },
    { id: 'notes' as BottomTab, label: 'Text Notes', icon: BookOpen },
  ];

  return (
    <div
      id="tradingview-bottom-dock"
      className={`flex flex-col flex-none border-t transition-all z-20 select-none ${
        isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
      }`}
    >
      {/* Tab Navigation Header Bar */}
      <div
        className={`h-8 px-2 flex items-center justify-between border-b text-xs ${
          isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
        }`}
      >
        <div className="flex items-center gap-1 h-full overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id && isOpen;

            return (
              <button
                key={tab.id}
                id={`bottom-tab-${tab.id}`}
                onClick={() => toggleTab(tab.id)}
                className={`h-full flex items-center gap-1.5 px-3 font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-[#2962ff] text-[#2962ff] font-bold bg-[#2962ff]/5'
                    : isDark
                    ? 'border-transparent text-gray-400 hover:text-white hover:bg-[#1e222d]'
                    : 'border-transparent text-gray-600 hover:text-black hover:bg-gray-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Toggle Controls */}
        <div className="flex items-center gap-1">
          {isOpen && (
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white`}
              title={isMaximized ? 'Restore Height' : 'Maximize Panel'}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={() => setOpen(!isOpen)}
            className={`p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white`}
            title={isOpen ? 'Collapse Panel' : 'Expand Panel'}
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Drawer — height is content-driven so tall panels
          reveal fully via the workspace scroll; isMaximized sets a minimum
          target height for short content. No inner clipping. */}
      {isOpen && (
        <div
          className={`w-full transition-all ${
            isMaximized ? 'min-h-[420px]' : 'min-h-[230px]'
          }`}
        >
          {activeTab === 'strategy' && (
            <StrategyTester result={backtestResult} theme={theme} />
          )}

          {activeTab === 'trading' && (
            <TradingPanel
              account={account}
              positions={positions}
              orders={orders}
              onClosePosition={onClosePosition}
              onCancelOrder={onCancelOrder}
              onOpenOrderModal={onOpenOrderModal}
              theme={theme}
            />
          )}

          {activeTab === 'screener' && (
            <ScreenerPanel
              symbols={symbols}
              onSelectSymbol={onSelectSymbol}
              theme={theme}
            />
          )}

          {activeTab === 'notes' && <NotesPanel symbol={symbol} theme={theme} />}
        </div>
      )}
    </div>
  );
};
