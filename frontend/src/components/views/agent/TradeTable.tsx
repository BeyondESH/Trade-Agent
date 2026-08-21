import React, { useMemo, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { BacktestTrade } from "../../../api/types";
import { Panel, fmtNum, fmtPct, fmtTime } from "./ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";

type SortKey =
  | "net_return"
  | "gross_return"
  | "side"
  | "entry_time"
  | "entry_price"
  | "exit_time"
  | "exit_price"
  | "bars"
  | "index";
type SortDir = "asc" | "desc";

/** Open/close trade list rendered from a backtest's per-trade records. */
export const TradeTable: React.FC<{ trades: BacktestTrade[]; theme: ThemeMode }> = ({
  trades,
  theme,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (trades.length === 0) {
    return (
      <Panel title="开单列表" theme={theme}>
        <div className="text-sm text-gray-400 py-2">本次回测无开单记录</div>
      </Panel>
    );
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const rows = useMemo(() => {
    const withIdx = trades.map((t, i) => ({ t, i }));
    const val = (r: { t: BacktestTrade; i: number }): number | string => {
      switch (sortKey) {
        case "net_return":
          return r.t.net_return;
        case "gross_return":
          return r.t.gross_return;
        case "side":
          return r.t.side;
        case "entry_time":
          return r.t.entry_time;
        case "entry_price":
          return r.t.entry_price;
        case "exit_time":
          return r.t.exit_time;
        case "exit_price":
          return r.t.exit_price;
        case "bars":
          return r.t.bars;
        default:
          return r.i;
      }
    };
    const sorted = [...withIdx].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [trades, sortKey, sortDir]);

  const Head: React.FC<{ k: SortKey; label: string; align?: string }> = ({ k, label, align = "left" }) => (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${align}`}
      onClick={() => toggleSort(k)}
    >
      {label}
      {sortKey === k && <span className="ml-1 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </TableHead>
  );

  return (
    <Panel title={`开单列表 (${trades.length})`} theme={theme}>
      <Table>
        <TableHeader>
          <TableRow>
            <Head k="index" label="#" />
            <Head k="side" label="方向" />
            <Head k="entry_time" label="开仓时间" />
            <Head k="entry_price" label="开仓价" />
            <Head k="exit_time" label="平仓时间" />
            <Head k="exit_price" label="平仓价" />
            <Head k="bars" label="持仓 bar" />
            <Head k="gross_return" label="毛利" />
            <Head k="net_return" label="净利" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ t, i }) => {
            const win = t.net_return >= 0;
            const pnlColor = win ? "text-[#089981]" : "text-[#f23645]";
            return (
              <TableRow key={i} className={theme === "dark" ? "hover:bg-[#1e222d]" : "hover:bg-gray-50"}>
                <TableCell className="text-gray-400 font-mono">{i + 1}</TableCell>
                <TableCell className={`font-bold font-mono ${t.side === "long" ? "text-[#089981]" : "text-[#f23645]"}`}>
                  {t.side === "long" ? "多" : "空"}
                </TableCell>
                <TableCell className="font-mono">{fmtTime(t.entry_time)}</TableCell>
                <TableCell className="font-mono">{fmtNum(t.entry_price, 6)}</TableCell>
                <TableCell className="font-mono">{fmtTime(t.exit_time)}</TableCell>
                <TableCell className="font-mono">{fmtNum(t.exit_price, 6)}</TableCell>
                <TableCell className="font-mono">{t.bars}</TableCell>
                <TableCell className={`font-mono ${pnlColor}`}>{fmtPct(t.gross_return)}</TableCell>
                <TableCell className={`font-mono font-bold ${pnlColor}`}>{fmtPct(t.net_return)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
};
