import React from "react";
import { ThemeMode } from "../../types/trading";
import { t } from "../../lib/i18n";
import {
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Gauge,
  PieChart,
  Network,
  Coins,
  LineChart,
} from "lucide-react";
import {
  useMarketOverview,
  NETFLOW_NETWORK_OPTIONS,
  MarketOverview,
} from "../../hooks/useMarketOverview";

interface Props {
  theme: ThemeMode;
}

/* -- small display helpers ------------------------------------------------ */

const fmt = (v: number | null, digits = 2, prefix = "$"): string => {
  if (v === null || Number.isNaN(v)) return "N/A";
  return `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
};

const fmtCompact = (v: number | null): string => {
  if (v === null || Number.isNaN(v)) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
};

const ChangePill: React.FC<{ label: string; up: boolean; active?: boolean }> = ({ label, up, active }) => (
  <div className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${up ? "bg-[#089981]/20 text-[#089981]" : "bg-[#f23645]/20 text-[#f23645]"}`}>
    <div className="flex items-center gap-0.5">
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      <span>{label}</span>
    </div>
  </div>
);

/** Tiny inline sparkline drawn from a close-price series. */
const Sparkline: React.FC<{ series: number[]; up: boolean }> = ({ series, up }) => {
  if (series.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const pts = series
    .map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  const color = up ? "#089981" : "#f23645";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

/* -- section card wrapper --------------------------------------------------- */

const Card: React.FC<{ title: string; icon: React.ReactNode; color: string; className?: string; isDark: boolean; children: React.ReactNode; right?: React.ReactNode }> = ({
  title,
  icon,
  color,
  className = "",
  isDark,
  children,
  right,
}) => {
  return (
    <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"} ${className}`}>
      <div className="flex items-center justify-between border-b pb-2 border-gray-500/20">
        <span className="font-bold text-sm flex items-center gap-1.5" style={{ color }}>
          {icon}
          <span>{title}</span>
        </span>
        {right}
      </div>
      {children}
    </div>
  );
};

/* -- section sub-components ------------------------------------------------ */

const TopCards: React.FC<{ m: MarketOverview; isDark: boolean }> = ({ m, isDark }) => {
  const d = m.topCards.data;
  const cells = [
    { label: t("BTC ETF Cumulative Inflow"), value: d?.etfTotal != null ? fmtCompact(d.etfTotal) : "N/A", sub: `${t("Today")}: ${d?.etfNet != null ? fmt(d.etfNet) : "N/A"}` },
    { label: t("iBit / fBTC Net Flow"), value: d?.ibit != null ? fmt(d.ibit) : "N/A", sub: `fBTC: ${d?.fbtc != null ? fmt(d.fbtc) : "N/A"}` },
    { label: t("Compliant CEX Cumulative Inflow"), value: d?.compliantTotal != null ? fmtCompact(d.compliantTotal) : "N/A", sub: `${t("Today")}: ${d?.compliantNet != null ? fmt(d.compliantNet) : "N/A"}` },
    { label: t("Bitfinex Leveraged Long"), value: d?.longCount != null ? fmt(d.longCount, 0, "") : "N/A", sub: d?.longPrice != null ? `${t("BTC")}: ${fmt(d.longPrice)}` : "" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {cells.map((c, i) => (
        <div key={i} className={`p-3 rounded-lg border flex flex-col justify-between ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"}`}>
          <div className="text-[11px] font-semibold text-gray-400">{c.label}</div>
          <div className="font-mono font-bold text-sm my-1">{c.value}</div>
          <div className="text-[10px] text-gray-500 font-mono">{c.sub}</div>
        </div>
      ))}
    </div>
  );
};

const IndicatorCard: React.FC<{ m: MarketOverview; isDark: boolean }> = ({ m, isDark }) => {
  const d = m.topCards.data;
  if (!d) return null;
  if (!d.indicatorName && !d.indicatorInfo) return null;
  return (
    <div className={`mb-5 p-4 rounded-xl border ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"}`}>
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-[#2962ff]" />
        <span className="font-bold text-sm text-white">{t("Bottom/Top Indicator")}</span>
      </div>
      <div className="text-sm font-semibold mt-2">{d.indicatorName ?? "N/A"}</div>
      {d.indicatorInfo && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{d.indicatorInfo}</p>}
    </div>
  );
};

const MacroSection: React.FC<{ m: MarketOverview; isDark: boolean }> = ({ m, isDark }) => {
  const us = m.macro.data?.us10y;
  const dxy = m.macro.data?.dxy;
  const rows = [
    { label: t("US 10Y Treasury Yield"), k: us },
    { label: "DXY (US Dollar Index)", k: dxy },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
      {rows.map((r) => (
        <div key={r.label} className={`p-4 rounded-xl border flex items-center justify-between ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"}`}>
          <div>
            <div className="text-xs font-semibold text-gray-400">{r.label}</div>
            <div className="font-mono font-bold text-lg mt-1">{r.k?.price != null ? r.k.price.toFixed(4) : "N/A"}</div>
            <div className="mt-2">
              {r.k?.up != null ? <ChangePill label={`${r.k.up ? "+" : "-"}${r.k.price != null ? r.k.price.toFixed(4) : ""}`} up={r.k.up} /> : <span className="text-xs text-gray-500">N/A</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-gray-500" />
            {r.k ? <Sparkline series={r.k.series} up={r.k.up ?? false} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
};

const AssetsSection: React.FC<{ m: MarketOverview; isDark: boolean }> = ({ m, isDark }) => {
  const d = m.assets.data;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
      <Card title={t("Stablecoin Market Cap")} icon={<Coins className="w-4 h-4" />} color="#00bcd4" isDark={isDark}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">USDT</span>
            <span className="font-mono font-bold text-sm">{d?.usdt != null ? fmtCompact(d.usdt) : "N/A"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">USDC</span>
            <span className="font-mono font-bold text-sm">{d?.usdc != null ? fmtCompact(d.usdc) : "N/A"}</span>
          </div>
        </div>
      </Card>
      <Card title={t("Daily On-Chain Transaction Volume")} icon={<PieChart className="w-4 h-4" />} color="#e040fb" isDark={isDark} className="max-h-[280px] overflow-y-auto">
        {!d || d.chains.length === 0 ? (
          <span className="text-xs text-gray-500">N/A</span>
        ) : (
          <div className="flex flex-col gap-2">
            {d.chains.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {c.image ? <img src={c.image} alt={c.name} className="w-5 h-5 rounded-full object-cover" /> : null}
                  <span className="text-xs font-semibold">{c.name}</span>
                </div>
                <span className="font-mono text-xs text-gray-400">{c.volume != null ? c.volume.toLocaleString() : "N/A"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const ContractSection: React.FC<{ m: MarketOverview; isDark: boolean }> = ({ m, isDark }) => {
  const rows = m.contract.data?.rows ?? null;
  return (
    <div className={`p-4 rounded-xl border mb-5 ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"}`}>
      <div className="flex items-center gap-1.5 border-b pb-2 border-gray-500/20 mb-3">
        <BarChart3 className="w-4 h-4 text-[#ff9800]" />
        <span className="font-bold text-sm flex items-center gap-1.5 text-[#ff9800]">{t("Major Futures Platforms")}</span>
      </div>
      {!rows ? (
        <span className="text-xs text-gray-500">N/A</span>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}>
                <th className="py-2 px-3">{t("Platform")}</th>
                <th className="py-2 px-3">{t("Open Interest")}</th>
                <th className="py-2 px-3">{t("Volume")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-500/10">
              {rows.map((r) => (
                <tr key={r.platform}>
                  <td className="py-2 px-3 font-bold font-sans text-white">{r.platform}</td>
                  <td className="py-2 px-3">{r.openInterest != null ? fmtCompact(r.openInterest) : "N/A"}</td>
                  <td className="py-2 px-3">{r.volume != null ? fmtCompact(r.volume) : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const NetflowSection: React.FC<{ m: MarketOverview; isDark: boolean }> = ({ m, isDark }) => {
  const coins = m.netflow.data?.coins ?? null;
  return (
    <div className={`p-4 rounded-xl border mb-5 ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"}`}>
      <div className="flex items-center justify-between border-b pb-2 border-gray-500/20 mb-3">
        <span className="font-bold text-sm flex items-center gap-1.5 text-[#2962ff]">
          <Network className="w-4 h-4" />
          <span>{t("Top 10 On-Chain Netflow")}</span>
        </span>
        <select
          className={`text-xs rounded-md px-2 py-1 font-semibold outline-none ${isDark ? "bg-[#2a2e39] text-white border border-[#3a3f4a]" : "bg-white text-black border border-[#e0e3eb]"}`}
          value={m.network}
          onChange={(e) => m.setNetwork(e.target.value)}
        >
          {NETFLOW_NETWORK_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {!coins || coins.length === 0 ? (
        <span className="text-xs text-gray-500">{t("Network")}: N/A</span>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}>
                <th className="py-2 px-3">{t("Symbol")}</th>
                <th className="py-2 px-3">{t("Price")}</th>
                <th className="py-2 px-3">{t("Netflow")}</th>
                <th className="py-2 px-3">{t("Liquidity")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-500/10">
              {coins.map((c, i) => (
                <tr key={i}>
                  <td className="py-2 px-3 font-bold font-sans text-white">
                    <div className="flex items-center gap-2">
                      {c.logoUrl ? <img src={c.logoUrl} alt={c.symbol} className="w-5 h-5 rounded-full object-cover" /> : null}
                      {c.symbol}
                    </div>
                  </td>
                  <td className="py-2 px-3">{c.priceUsd != null ? fmt(c.priceUsd) : "N/A"}</td>
                  <td className={`py-2 px-3 font-bold ${(c.netflow ?? 0) >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>
                    {c.netflow != null ? fmtCompact(c.netflow) : "N/A"}
                  </td>
                  <td className="py-2 px-3">{c.liquidity != null ? fmtCompact(c.liquidity) : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* -- view -------------------------------------------------------------------- */

export const MarketsView: React.FC<Props> = ({ theme }) => {
  const isDark = theme === "dark";
  const m = useMarketOverview();

  return (
    <div
      id="markets-overview-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans ${
        isDark ? "bg-[#131722] text-[#d1d4dc]" : "bg-[#f0f3fa] text-[#131722]"
      }`}
    >
      {/* Header Banner */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#2962ff]" />
            <span>{t("Global Markets Overview")}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t("Real-time crypto, macro, and on-chain indicators.")}
          </p>
        </div>
      </div>

      {/* Top KPI cards */}
      <TopCards m={m} isDark={isDark} />
      <IndicatorCard m={m} isDark={isDark} />

      {/* Macro trend */}
      <MacroSection m={m} isDark={isDark} />

      {/* Assets & on-chain activity */}
      <AssetsSection m={m} isDark={isDark} />

      {/* Futures platforms */}
      <ContractSection m={m} isDark={isDark} />

      {/* Top 10 netflow */}
      <NetflowSection m={m} isDark={isDark} />
    </div>
  );
};
