import { Flame } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useState } from "react";
import { HEATMAP_CRYPTO_ASSETS, HEATMAP_STOCK_ASSETS } from "../../data/marketData";
import { compactNumber, formatPercent } from "../../lib/format";
import { t } from "../../lib/i18n";
import { fetchNetflow, NETFLOW_NETWORKS, type NetflowRow } from "../../lib/marketPulse";
import type { HeatmapAsset, ThemeMode } from "../../types/trading";

interface Props {
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";
const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;
const INSTANT = { duration: 0 } as const;

/** Market-cap / magnitude → CSS grid span, so tile area tracks weight. */
const sizeClass = (value: number, max: number): string => {
  const r = max > 0 ? Math.abs(value) / max : 0;
  if (r >= 0.7) return "col-span-2 row-span-2";
  if (r >= 0.25) return "col-span-2 row-span-1";
  return "col-span-1 row-span-1";
};

/** Discrete graded fills (no gradient) for the legend swatch bar. */
const LEGEND_GRADES = [
  "ta-heat-down-3",
  "ta-heat-down-2",
  "ta-heat-down-1",
  "bg-surface-2",
  "ta-heat-up-1",
  "ta-heat-up-2",
  "ta-heat-up-3",
] as const;

const Legend: React.FC = () => (
  <div className="hidden flex-col items-end gap-1 sm:flex">
    <div className="ta-num flex w-40 items-center justify-between text-2xs text-faint">
      <span className="text-down">-5%</span>
      <span>0%</span>
      <span className="text-up">+5%</span>
    </div>
    <div className="flex h-2.5 w-40 overflow-hidden rounded-full border border-line/60">
      {LEGEND_GRADES.map((cls) => (
        <span key={cls} className={`h-full flex-1 ${cls}`} />
      ))}
    </div>
  </div>
);

/** Segmented control with a brass pill that slides between options. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  reduce,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  reduce: boolean;
}) {
  return (
    <div className="relative flex items-center gap-0.5 rounded-lg border border-line bg-ink p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="relative rounded-md px-3 py-1 text-xs font-semibold transition-colors"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? INSTANT : SPRING}
                className="absolute inset-0 rounded-md bg-signal"
              />
            )}
            <span
              className={`relative z-10 ${
                active ? "text-signal-ink" : "text-muted hover:text-content"
              }`}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type DetailStat = { k: string; v: string; tone?: "up" | "down" };
type Detail = { key: string; symbol: string; name: string; stats: DetailStat[] };

export const HeatmapsView: React.FC<Props> = ({ onOpenChartWithTicker }) => {
  const reduce = useReducedMotion();
  const [heatmapType, setHeatmapType] = useState<"crypto" | "stocks">("stocks");
  const [network, setNetwork] = useState<(typeof NETFLOW_NETWORKS)[number]>("solana");
  const [netflowRows, setNetflowRows] = useState<NetflowRow[]>([]);
  const [netflowLoading, setNetflowLoading] = useState(false);
  const [hoveredAsset, setHoveredAsset] = useState<HeatmapAsset | null>(null);
  const [hoveredNetflow, setHoveredNetflow] = useState<NetflowRow | null>(null);

  useEffect(() => {
    if (heatmapType !== "crypto") return;
    let alive = true;
    setNetflowLoading(true);
    fetchNetflow(network).then((rows) => {
      if (!alive) return;
      setNetflowRows(rows);
      setNetflowLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [heatmapType, network]);

  const assets = heatmapType === "stocks" ? HEATMAP_STOCK_ASSETS : HEATMAP_CRYPTO_ASSETS;
  const totalMarketCap = assets.reduce((sum, a) => sum + a.marketCap, 0);
  const sectors = Array.from(new Set(assets.map((a) => a.sector)));
  const maxStockCap = assets.reduce((m, a) => Math.max(m, a.marketCap), 1);
  const maxAbsNetflow = Math.max(1, ...netflowRows.map((r) => Math.abs(r.netflow)));

  const getColorClass = (pct: number) => {
    if (pct >= 4) return "ta-heat-up-3 text-onfill";
    if (pct >= 2) return "ta-heat-up-2 text-onfill";
    if (pct > 0) return "ta-heat-up-1 text-onfill";
    if (pct === 0) return "bg-surface-2 text-muted";
    if (pct > -2) return "ta-heat-down-1 text-onfill";
    if (pct > -4) return "ta-heat-down-2 text-onfill";
    return "ta-heat-down-3 text-onfill";
  };

  const getNetflowColor = (v: number) => {
    const ratio = Math.abs(v) / maxAbsNetflow;
    if (v >= 0) {
      if (ratio > 0.6) return "ta-heat-up-3 text-onfill";
      if (ratio > 0.3) return "ta-heat-up-2 text-onfill";
      return "ta-heat-up-1 text-onfill";
    }
    if (ratio > 0.6) return "ta-heat-down-3 text-onfill";
    if (ratio > 0.3) return "ta-heat-down-2 text-onfill";
    return "ta-heat-down-1 text-onfill";
  };

  const typeOptions = [
    { value: "stocks" as const, label: t("S&P 500 Equities") },
    { value: "crypto" as const, label: t("Top Crypto Market Cap") },
  ];
  const networkOptions = NETFLOW_NETWORKS.map((n) => ({ value: n, label: n }));

  // The info strip always carries a reading: the hovered cell, else the heaviest one.
  const featuredAsset =
    hoveredAsset ??
    assets.reduce<HeatmapAsset>((best, a) => (a.marketCap > best.marketCap ? a : best), assets[0]);
  const featuredNetflow = hoveredNetflow ?? netflowRows[0] ?? null;

  const detail: Detail | null =
    heatmapType === "stocks"
      ? {
          key: `s-${featuredAsset.symbol}`,
          symbol: featuredAsset.symbol,
          name: featuredAsset.name,
          stats: [
            { k: t("Price"), v: `$${featuredAsset.price.toLocaleString()}` },
            { k: t("Market Cap"), v: `$${featuredAsset.marketCap}B` },
            { k: t("Volume"), v: featuredAsset.volume },
            {
              k: t("Change %"),
              v: formatPercent(featuredAsset.changePercent),
              tone: featuredAsset.changePercent >= 0 ? "up" : "down",
            },
          ],
        }
      : featuredNetflow
        ? {
            key: `n-${featuredNetflow.symbol}`,
            symbol: featuredNetflow.symbol,
            name: t("Top 10 Netflow"),
            stats: [
              {
                k: t("Netflow"),
                v: `${featuredNetflow.netflow >= 0 ? "+" : "-"}${compactNumber(
                  Math.abs(featuredNetflow.netflow),
                )}`,
                tone: featuredNetflow.netflow >= 0 ? "up" : "down",
              },
              { k: t("Network"), v: network },
            ],
          }
        : null;

  return (
    <div
      id="heatmaps-view"
      className="flex h-full flex-1 select-none flex-col overflow-hidden bg-ink font-sans text-content"
    >
      {/* Command header + segmented controls */}
      <header className="ta-glass z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-3">
        <div className="min-w-0">
          <h1 className="ta-display flex items-center gap-2 text-base tracking-tight text-content">
            <Flame className="h-4 w-4 text-signal" />
            {t("Market Heatmap Directory")}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {t("Visualize relative market capitalization and sector performance in real-time.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={typeOptions}
            value={heatmapType}
            onChange={setHeatmapType}
            layoutId="heatmap-type-pill"
            reduce={reduce ?? false}
          />
          {heatmapType === "crypto" && (
            <div className="flex items-center gap-1">
              <span className="ta-eyebrow px-1 text-faint">{t("Network")}</span>
              <Segmented
                options={networkOptions}
                value={network}
                onChange={setNetwork}
                layoutId="heatmap-net-pill"
                reduce={reduce ?? false}
              />
            </div>
          )}
        </div>
      </header>

      {/* Market map */}
      <div className="flex min-h-0 flex-1 p-6">
        <section className={`${PANEL} min-h-0 flex-1 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="ta-eyebrow text-faint">
                {heatmapType === "stocks"
                  ? t("S&P 500 Mega-Cap Map")
                  : `${t("Top 10 Netflow")} — ${network}`}
              </span>
              {heatmapType === "stocks" && (
                <span className="ta-num text-2xs text-muted">
                  {t("Total Tracked Market Cap")}: ${totalMarketCap.toLocaleString()}B
                </span>
              )}
            </div>
            <Legend />
          </div>

          {/* Fixed info strip */}
          <div className="min-h-[38px] border-b border-line/70 px-3.5 py-2">
            {detail ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={detail.key}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex flex-wrap items-center gap-x-5 gap-y-1"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="ta-display text-sm text-content">{detail.symbol}</span>
                    <span className="text-2xs text-muted">{detail.name}</span>
                  </span>
                  {detail.stats.map((s) => (
                    <span key={s.k} className="ta-num text-2xs text-faint">
                      {s.k}{" "}
                      <span
                        className={
                          s.tone === "up"
                            ? "text-up"
                            : s.tone === "down"
                              ? "text-down"
                              : "text-content"
                        }
                      >
                        {s.v}
                      </span>
                    </span>
                  ))}
                </motion.div>
              </AnimatePresence>
            ) : (
              <span className="ta-num text-2xs text-faint">{t("Network")} N/A</span>
            )}
          </div>

          {/* Map body */}
          <div className="min-h-0 flex-1 overflow-auto">
            {heatmapType === "crypto" ? (
              netflowLoading ? (
                <p className="px-3 py-8 text-center text-xs text-muted">
                  {t("Loading netflow...")} ({network})
                </p>
              ) : netflowRows.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted">
                  {t("No netflow data — check BB_API_KEY / network availability")}
                </p>
              ) : (
                <div className="grid grid-cols-4 auto-rows-[56px] gap-2 p-3">
                  {netflowRows.map((r) => (
                    <motion.div
                      key={r.symbol}
                      onMouseEnter={() => setHoveredNetflow(r)}
                      onMouseLeave={() => setHoveredNetflow(null)}
                      whileHover={reduce ? undefined : { scale: 1.03 }}
                      transition={SPRING}
                      className={`flex cursor-default flex-col justify-between rounded-md p-2 transition-shadow hover:z-10 hover:shadow-e2 ${sizeClass(
                        r.netflow,
                        maxAbsNetflow,
                      )} ${getNetflowColor(r.netflow)}`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="ta-display text-xs tracking-tight">{r.symbol}</span>
                        <span className="text-2xs opacity-80">
                          {r.netflow >= 0 ? t("inflow") : t("outflow")}
                        </span>
                      </span>
                      <span className="ta-num text-center text-sm font-black">
                        {r.netflow >= 0 ? "+" : "-"}
                        {compactNumber(Math.abs(r.netflow))}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2 xl:grid-cols-3">
                {sectors.map((sec) => {
                  const secAssets = assets.filter((a) => a.sector === sec);
                  return (
                    <div
                      key={sec}
                      className="flex flex-col gap-2 rounded-lg border border-line/70 bg-surface-2/30 p-2.5"
                    >
                      <span className="ta-eyebrow text-faint">{sec}</span>
                      <div className="grid grid-cols-4 auto-rows-[60px] gap-1.5">
                        {secAssets.map((asset) => (
                          <motion.button
                            key={asset.symbol}
                            type="button"
                            onClick={() => onOpenChartWithTicker(asset.symbol)}
                            onMouseEnter={() => setHoveredAsset(asset)}
                            onMouseLeave={() => setHoveredAsset(null)}
                            onFocus={() => setHoveredAsset(asset)}
                            onBlur={() => setHoveredAsset(null)}
                            whileHover={reduce ? undefined : { scale: 1.03 }}
                            transition={SPRING}
                            className={`flex flex-col justify-between rounded-md p-2 text-left transition-shadow hover:z-10 hover:shadow-e2 ${sizeClass(
                              asset.marketCap,
                              maxStockCap,
                            )} ${getColorClass(asset.changePercent)}`}
                          >
                            <span className="flex items-center justify-between gap-1">
                              <span className="ta-display text-xs tracking-tight">
                                {asset.symbol}
                              </span>
                              <span className="ta-num text-2xs opacity-80">
                                ${asset.marketCap}B
                              </span>
                            </span>
                            <span className="ta-num text-center text-sm font-black">
                              {asset.changePercent >= 0 ? "+" : ""}
                              {asset.changePercent}%
                            </span>
                            <span className="ta-num flex items-center justify-between text-2xs opacity-90">
                              <span>${asset.price.toLocaleString()}</span>
                              <span>{asset.volume}</span>
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
