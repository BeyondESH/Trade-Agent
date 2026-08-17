import { MarketList } from "../market/MarketList";
import type { TickerListState } from "../../hooks/useTickerList";

interface Props {
  tickerState: TickerListState;
  active: string;
  onSelect: (symbol: string) => void;
}

/** Right sidebar Watchlist tab — reuses MarketList. */
export function WatchlistPanel({ tickerState, active, onSelect }: Props) {
  const { tickers, search, tab, symbolType, sortKey, sortDir } = tickerState;
  return (
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
    />
  );
}
