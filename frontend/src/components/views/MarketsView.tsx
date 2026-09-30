import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Coins,
  Gauge,
  Globe,
  LineChart,
  Network,
  PieChart,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import {
  type MarketOverview,
  NETFLOW_NETWORK_OPTIONS,
  useMarketOverview,
} from "../../hooks/useMarketOverview";
import { compactNumber } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { ThemeMode } from "../../types/trading";
import { RemoteImage } from "../ui/remote-image";
import { Reveal } from "../ui/reveal";
import { Sparkline } from "../ui/sparkline";

interface Props {
  theme: ThemeMode;
}

/* -- display helpers ------------------------------------------------------- */

/** Compact magnitude via the shared formatter; only the currency glyph is local. */
const usd = (v: number | null): string =>
  v === null || Number.isNaN(v) ? "N/A" : `${v < 0 ? "-" : ""}$${compactNumber(Math.abs(v))}`;

/** Signed compact magnitude for netflow-style deltas: +1.24M / -3.10K. */
const signedCompact = (v: number | null): string =>
  v === null || Number.isNaN(v) ? "N/A" : `${v >= 0 ? "+" : "-"}${compactNumber(Math.abs(v))}`;

/* -- shared surface recipe ------------------------------------------------- */

const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";

const SectionHead: React.FC<{
  icon?: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}> = ({ icon, label, right }) => (
  <div className="flex items-center justify-between gap-3 border-b border-line/70 px-3.5 py-2.5">
    <span className="ta-eyebrow flex items-center gap-1.5 text-faint">
      {icon}
      {label}
    </span>
    {right}
  </div>
);

/* -- header live status ----------------------------------------------------- */

const LiveStatus: React.FC<{ loading: boolean }> = ({ loading }) => (
  <span className="flex items-center gap-1.5">
    <span className="relative flex h-1.5 w-1.5">
      {!loading && (
        <span className="absolute inline-flex h-full w-full animate-[ta-ping_2s_ease-out_infinite] rounded-full bg-up" />
      )}
      <span
        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${loading ? "bg-faint" : "bg-up"}`}
      />
    </span>
    <span className={`ta-eyebrow ${loading ? "text-faint" : "text-up"}`}>
      {loading ? t("Loading...") : t("Live")}
    </span>
  </span>
);

/* -- KPI band --------------------------------------------------------------- */

const DeltaPill: React.FC<{ up: boolean | null; children: React.ReactNode }> = ({
  up,
  children,
}) => (
  <span
    className={`ta-num inline-flex min-w-[7.5ch] items-center gap-0.5 rounded px-1.5 py-0.5 text-2xs font-semibold ${
      up === null ? "bg-surface-2 text-muted" : up ? "bg-up/15 text-up" : "bg-down/15 text-down"
    }`}
  >
    {up !== null &&
      (up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
    {children}
  </span>
);

const MetricTile: React.FC<{ label: string; value: string; footer: React.ReactNode }> = ({
  label,
  value,
  footer,
}) => (
  <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 shadow-e1">
    <span className="ta-eyebrow text-faint">{label}</span>
    <span className="ta-display ta-num text-xl leading-none text-content">{value}</span>
    <span className="mt-0.5 block border-t border-line/60 pt-2">{footer}</span>
  </div>
);

const TopTiles: React.FC<{ m: MarketOverview }> = ({ m }) => {
  const d = m.topCards.data;
  const tiles: { label: string; value: string; footer: React.ReactNode }[] = [
    {
      label: t("BTC ETF Cumulative Inflow"),
      value: d?.etfTotal != null ? compactNumber(d.etfTotal) : "N/A",
      footer: (
        <DeltaPill up={d?.etfNet == null ? null : d.etfNet >= 0}>
          {`${t("Today")}: ${usd(d?.etfNet ?? null)}`}
        </DeltaPill>
      ),
    },
    {
      label: t("iBit / fBTC Net Flow"),
      value: d?.ibit != null ? usd(d.ibit) : "N/A",
      footer: <DeltaPill up={null}>{`fBTC: ${usd(d?.fbtc ?? null)}`}</DeltaPill>,
    },
    {
      label: t("Compliant CEX Cumulative Inflow"),
      value: d?.compliantTotal != null ? compactNumber(d.compliantTotal) : "N/A",
      footer: (
        <DeltaPill up={d?.compliantNet == null ? null : d.compliantNet >= 0}>
          {`${t("Today")}: ${usd(d?.compliantNet ?? null)}`}
        </DeltaPill>
      ),
    },
    {
      label: t("Bitfinex Leveraged Long"),
      value: d?.longCount != null ? d.longCount.toLocaleString() : "N/A",
      footer:
        d?.longPrice != null ? (
          <DeltaPill up={null}>{`${t("BTC")}: ${usd(d.longPrice)}`}</DeltaPill>
        ) : (
          <span className="text-2xs text-faint">{"\u2014"}</span>
        ),
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((c) => (
        <MetricTile key={c.label} label={c.label} value={c.value} footer={c.footer} />
      ))}
    </div>
  );
};

/* -- indicator signal grid -------------------------------------------------- */

const SignalPill: React.FC<{ status: string }> = ({ status }) => {
  const s = status.trim().toLowerCase();
  const tone =
    s === "buy"
      ? "bg-up/15 text-up"
      : s === "sell"
        ? "bg-down/15 text-down"
        : s === "hold"
          ? "bg-signal/15 text-signal"
          : "bg-surface-2 text-muted";
  const label = s === "buy" || s === "sell" || s === "hold" ? status.toUpperCase() : "N/A";
  return (
    <span className={`ta-num shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ${tone}`}>
      {label}
    </span>
  );
};

const IndicatorCard: React.FC<{ m: MarketOverview }> = ({ m }) => {
  const reduce = useReducedMotion();
  const d = m.topCards.data;
  const indicators = d?.indicators ?? [];
  const time = indicators.find((i) => i.createTime)?.createTime ?? null;
  const fmtTime = (v: string) => (v.length >= 16 ? v.slice(11, 16) : v);
  return (
    <section data-testid="indicator-card" className={PANEL}>
      <SectionHead
        icon={<Gauge className="h-3.5 w-3.5 text-signal" />}
        label={t("Bottom/Top Indicator")}
        right={
          time ? <span className="ta-num text-2xs text-faint">{fmtTime(time)} UTC</span> : undefined
        }
      />
      {indicators.length === 0 ? (
        <p className="px-3.5 py-3 text-xs text-muted">N/A</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 p-3 sm:grid-cols-2">
          {indicators.map((ind, i) => (
            <motion.div
              key={i}
              whileHover={reduce ? undefined : { x: 2 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-line/60 bg-surface-2/40 px-2.5 py-1.5 transition-colors hover:border-line-strong"
            >
              <span
                className="truncate text-xs font-semibold text-content"
                title={ind.info || undefined}
              >
                {ind.name}
              </span>
              <SignalPill status={ind.status} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
};

/* -- macro trend ------------------------------------------------------------ */

const MacroSection: React.FC<{ m: MarketOverview }> = ({ m }) => {
  const rows = [
    { label: t("US 10Y Treasury Yield"), k: m.macro.data?.us10y },
    { label: "DXY (US Dollar Index)", k: m.macro.data?.dxy },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {rows.map((r) => (
        <section key={r.label} className={PANEL}>
          <SectionHead label={r.label} right={<LineChart className="h-3.5 w-3.5 text-faint" />} />
          <div className="flex items-center justify-between gap-4 px-3.5 py-3">
            <div className="flex items-baseline gap-3">
              <span className="ta-display ta-num text-2xl leading-none text-content">
                {r.k?.price != null ? r.k.price.toFixed(4) : "N/A"}
              </span>
              {r.k?.up != null ? (
                <DeltaPill up={r.k.up}>
                  {`${r.k.up ? "+" : "-"}${r.k.price != null ? r.k.price.toFixed(4) : ""}`}
                </DeltaPill>
              ) : (
                <span className="text-xs text-muted">N/A</span>
              )}
            </div>
            {r.k && r.k.series.length > 1 ? (
              <Sparkline
                values={r.k.series}
                up={r.k.up ?? false}
                width={140}
                height={40}
                strokeWidth={1.6}
              />
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
};

/* -- assets / on-chain ------------------------------------------------------ */

const AssetsSection: React.FC<{ m: MarketOverview }> = ({ m }) => {
  const d = m.assets.data;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={PANEL}>
        <SectionHead
          icon={<Coins className="h-3.5 w-3.5 text-signal" />}
          label={t("Stablecoin Market Cap")}
        />
        <div className="divide-y divide-line/60">
          {[
            { k: "USDT", v: d?.usdt ?? null },
            { k: "USDC", v: d?.usdc ?? null },
          ].map((r) => (
            <div key={r.k} className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs font-semibold text-muted">{r.k}</span>
              <span className="ta-num text-sm font-semibold text-content">
                {r.v != null ? compactNumber(r.v) : "N/A"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className={PANEL}>
        <SectionHead
          icon={<PieChart className="h-3.5 w-3.5 text-signal" />}
          label={t("Daily On-Chain Transaction Volume")}
        />
        {!d || d.chains.length === 0 ? (
          <p className="px-3.5 py-3 text-xs text-muted">N/A</p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto">
            {d.chains.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-line/50 px-3.5 py-2 transition-colors last:border-0 hover:bg-surface-2/60"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RemoteImage
                    src={c.image}
                    alt={c.name}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                  <span className="truncate text-xs font-semibold text-content">{c.name}</span>
                </span>
                <span className="ta-num shrink-0 text-xs text-muted">
                  {c.volume != null ? c.volume.toLocaleString() : "N/A"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

/* -- futures platforms ------------------------------------------------------ */

const ContractSection: React.FC<{ m: MarketOverview }> = ({ m }) => {
  const rows = m.contract.data?.rows ?? null;
  return (
    <section className={PANEL}>
      <SectionHead
        icon={<BarChart3 className="h-3.5 w-3.5 text-signal" />}
        label={t("Major Futures Platforms")}
      />
      {!rows ? (
        <p className="px-3.5 py-3 text-xs text-muted">N/A</p>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="ta-num w-full text-left text-xs">
            <thead>
              <tr className="ta-eyebrow text-faint">
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2">
                  {t("Platform")}
                </th>
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2 text-right">
                  {t("Open Interest")}
                </th>
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2 text-right">
                  {t("Volume")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((r) => (
                <tr key={r.platform} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-3.5 py-2 font-semibold text-content">{r.platform}</td>
                  <td className="ta-num min-w-[10ch] px-3.5 py-2 text-right">
                    {r.openInterest != null ? compactNumber(r.openInterest) : "N/A"}
                  </td>
                  <td className="ta-num min-w-[10ch] px-3.5 py-2 text-right">
                    {r.volume != null ? compactNumber(r.volume) : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

/* -- on-chain netflow ------------------------------------------------------- */

const NetflowSection: React.FC<{ m: MarketOverview }> = ({ m }) => {
  const coins = m.netflow.data?.coins ?? null;
  return (
    <section className={PANEL}>
      <SectionHead
        icon={<Network className="h-3.5 w-3.5 text-signal" />}
        label={t("Top 10 On-Chain Netflow")}
        right={
          <select
            className="ta-num rounded-md border border-line bg-ink px-2.5 py-1.5 text-xs font-semibold text-content outline-none focus:border-signal"
            value={m.network}
            onChange={(e) => m.setNetwork(e.target.value)}
          >
            {NETFLOW_NETWORK_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        }
      />
      {!coins || coins.length === 0 ? (
        <p className="px-3.5 py-3 text-xs text-muted">{t("Network")}: N/A</p>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <table className="ta-num w-full text-left text-xs">
            <thead>
              <tr className="ta-eyebrow text-faint">
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2">
                  {t("Symbol")}
                </th>
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2 text-right">
                  {t("Price")}
                </th>
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2 text-right">
                  {t("Netflow")}
                </th>
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2 text-right">
                  {t("Liquidity")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {coins.map((c, i) => (
                <tr key={i} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-3.5 py-2 font-semibold text-content">
                    <span className="flex items-center gap-2">
                      <RemoteImage
                        src={c.logoUrl}
                        alt={c.symbol}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                      {c.symbol}
                    </span>
                  </td>
                  <td className="ta-num min-w-[11ch] px-3.5 py-2 text-right">{usd(c.priceUsd)}</td>
                  <td
                    className={`ta-num min-w-[10ch] px-3.5 py-2 text-right font-semibold ${(c.netflow ?? 0) >= 0 ? "text-up" : "text-down"}`}
                  >
                    {signedCompact(c.netflow)}
                  </td>
                  <td className="ta-num min-w-[10ch] px-3.5 py-2 text-right text-muted">
                    {c.liquidity != null ? compactNumber(c.liquidity) : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

/* -- view ------------------------------------------------------------------- */

export const MarketsView: React.FC<Props> = () => {
  const m = useMarketOverview();

  return (
    <div
      id="markets-overview-view"
      className="flex h-full flex-1 select-none flex-col overflow-hidden bg-ink font-sans text-content"
    >
      {/* Command header */}
      <header className="ta-glass z-20 flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="ta-display flex items-center gap-2 text-base tracking-tight text-content">
            <Globe className="h-4 w-4 text-signal" />
            {t("Global Markets Overview")}
          </h1>
          <span className="ta-eyebrow hidden text-faint sm:inline">
            {t("Real-time crypto, macro, and on-chain indicators.")}
          </span>
        </div>
        <LiveStatus loading={m.loading} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <Reveal delay={0}>
          <TopTiles m={m} />
        </Reveal>
        <Reveal delay={1}>
          <IndicatorCard m={m} />
        </Reveal>
        <Reveal delay={2}>
          <MacroSection m={m} />
        </Reveal>
        <Reveal delay={3}>
          <AssetsSection m={m} />
        </Reveal>
        <Reveal delay={4}>
          <ContractSection m={m} />
        </Reveal>
        <Reveal delay={5}>
          <NetflowSection m={m} />
        </Reveal>
      </div>
    </div>
  );
};
