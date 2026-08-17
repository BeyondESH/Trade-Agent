import { useI18n } from "../../lib/i18n";
import type { TickerListState } from "../../hooks/useTickerList";
import { MarketList } from "../market/MarketList";

interface Props {
  tickerState: TickerListState;
  active: string;
  onSelect: (symbol: string) => void;
}

/** Bottom dock screener tab — MarketList with Bitget-native fundamental columns. */
export function ScreenerPanel({ tickerState, active, onSelect }: Props) {
  const { t } = useI18n();
  const { tickers, search, tab, symbolType, sortKey, sortDir } = tickerState;
  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      <div className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
        {t("dock.screener")}
      </div>
      <MarketList
        tickers={tickers}
        search={search}
        tab={tab}
        symbolType={symbolType}
        sortKey={sortKey}
        sortDir={sortDir}
        active={active}
        onSearch={tickerState.setSearch}
        onTab={tickerState.setTab}
        onSymbolType={tickerState.setSymbolType}
        onSort={tickerState.setSort}
        onSelect={onSelect}
        extended
      />
    </div>
  );
}
