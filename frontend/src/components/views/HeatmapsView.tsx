import React, { useEffect, useState } from 'react';
import { SymbolInfo, ThemeMode } from '../../types/trading';
import { HEATMAP_CRYPTO_ASSETS, HEATMAP_STOCK_ASSETS } from '../../data/marketData';
import { Flame, Layers, TrendingUp, TrendingDown, Eye, Filter } from 'lucide-react';
import { fetchNetflow, NETFLOW_NETWORKS, type NetflowRow } from '../../lib/marketPulse';

interface Props {
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

export const HeatmapsView: React.FC<Props> = ({ onOpenChartWithTicker, theme }) => {
  const [heatmapType, setHeatmapType] = useState<'crypto' | 'stocks'>('stocks');
  const [metric, setMetric] = useState<'24h' | '1w' | '1m'>('24h');
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [network, setNetwork] = useState<string>('solana');
  const [netflowRows, setNetflowRows] = useState<NetflowRow[]>([]);
  const [netflowLoading, setNetflowLoading] = useState(false);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (heatmapType !== 'crypto') return;
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

  const assets = heatmapType === 'stocks' ? HEATMAP_STOCK_ASSETS : HEATMAP_CRYPTO_ASSETS;
  const totalMarketCap = assets.reduce((sum, a) => sum + a.marketCap, 0);

  // Group by sector
  const sectors = Array.from(new Set(assets.map((a) => a.sector)));

  const getColorClass = (pct: number) => {
    if (pct >= 4) return 'bg-[#089981] text-white';
    if (pct >= 2) return 'bg-[#0bb99d] text-white';
    if (pct > 0) return 'bg-[#15806e] text-white';
    if (pct === 0) return 'bg-gray-600 text-gray-200';
    if (pct > -2) return 'bg-[#b92c3a] text-white';
    if (pct > -4) return 'bg-[#d02534] text-white';
    return 'bg-[#f23645] text-white';
  };

  const maxAbsNetflow = Math.max(1, ...netflowRows.map((r) => Math.abs(r.netflow)));

  const getNetflowColor = (v: number) => {
    const ratio = Math.abs(v) / maxAbsNetflow;
    if (v >= 0) {
      if (ratio > 0.6) return 'bg-[#089981] text-white';
      if (ratio > 0.3) return 'bg-[#0bb99d] text-white';
      return 'bg-[#15806e] text-white';
    }
    if (ratio > 0.6) return 'bg-[#f23645] text-white';
    if (ratio > 0.3) return 'bg-[#d02534] text-white';
    return 'bg-[#b92c3a] text-white';
  };

  const formatNetflow = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toFixed(0);
  };

  return (
    <div
      id="heatmaps-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans flex flex-col ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Top Header & Switcher */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#f23645]" />
            <span>Market Heatmap Directory</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Visualize relative market capitalization and sector performance in real-time.
          </p>
        </div>

        {/* Heatmap Type Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-black/30 p-1 rounded-lg border border-gray-500/20">
            <button
              onClick={() => setHeatmapType('stocks')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                heatmapType === 'stocks'
                  ? 'bg-[#2962ff] text-white shadow-xs'
                  : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              S&P 500 Equities
            </button>
            <button
              onClick={() => setHeatmapType('crypto')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                heatmapType === 'crypto'
                  ? 'bg-[#2962ff] text-white shadow-xs'
                  : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              Top Crypto Market Cap
            </button>
          </div>

          <div className="flex items-center bg-black/30 p-1 rounded-lg border border-gray-500/20 text-xs">
            {(['24h', '1w', '1m'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase ${
                  metric === m ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {heatmapType === 'crypto' && (
            <div className="flex items-center bg-black/30 p-1 rounded-lg border border-gray-500/20 text-xs">
              <span className="px-2 text-gray-400">Network</span>
              {NETFLOW_NETWORKS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNetwork(n)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase ${
                    network === n ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Heatmap Visual Tree Grid */}
      <div className={`flex-1 min-h-[450px] p-3 rounded-xl border flex flex-col gap-3 ${
        isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
      }`}>
        <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-500/20 pb-2">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-white">
              {heatmapType === 'stocks'
                ? 'S&P 500 Mega-Cap Map'
                : `Top 10 Netflow — ${network}`}
            </span>
            {heatmapType === 'stocks' && (
              <span>Total Tracked Market Cap: ${totalMarketCap.toLocaleString()}B</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span>-5%</span>
            <div className="w-24 h-2.5 rounded-full bg-gradient-to-r from-[#f23645] via-gray-600 to-[#089981]" />
            <span>+5%</span>
          </div>
        </div>

        {heatmapType === 'crypto' ? (
          netflowLoading ? (
            <div className="text-xs text-gray-400 py-8 text-center">Loading {network} netflow...</div>
          ) : netflowRows.length === 0 ? (
            <div className="text-xs text-gray-400 py-8 text-center">
              No netflow data — check BB_API_KEY / network availability
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-fr">
              {netflowRows.map((r) => {
                const size = Math.max(18, Math.round(Math.sqrt(Math.abs(r.netflow) / maxAbsNetflow) * 45));
                return (
                  <div
                    key={r.symbol}
                    className={`p-2 rounded-md cursor-pointer transition-all duration-150 flex flex-col justify-between hover:scale-[1.02] shadow-sm relative ${getNetflowColor(
                      r.netflow
                    )}`}
                    style={{ gridRow: `span ${size >= 40 ? 2 : 1}` }}
                    title={`${r.symbol}: ${r.netflow.toFixed(2)}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs tracking-tight">{r.symbol}</span>
                      <span className="text-[10px] opacity-80">
                        {r.netflow >= 0 ? 'inflow' : 'outflow'}
                      </span>
                    </div>
                    <div className="my-0.5 text-center">
                      <div className="font-mono text-sm font-black">
                        {r.netflow >= 0 ? '+' : ''}
                        {formatNetflow(r.netflow)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
        /* Tree Map Grid (stocks mock) */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
          {sectors.map((sec) => {
            const secAssets = assets.filter((a) => a.sector === sec);
            return (
              <div
                key={sec}
                className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
                  isDark ? 'bg-[#131722]/80 border-[#2a2e39]' : 'bg-gray-50 border-[#e0e3eb]'
                }`}
              >
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  {sec}
                </div>

                <div className="flex-1 grid grid-cols-2 gap-1.5 min-h-[100px]">
                  {secAssets.map((asset) => {
                    const isSelected = selectedAsset?.symbol === asset.symbol;
                    return (
                      <div
                        key={asset.symbol}
                        onClick={() => onOpenChartWithTicker(asset.symbol)}
                        className={`p-2 rounded-md cursor-pointer transition-all duration-150 flex flex-col justify-between hover:scale-[1.02] shadow-sm relative ${getColorClass(
                          asset.changePercent
                        )} ${isSelected ? 'ring-2 ring-white' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs tracking-tight">{asset.symbol}</span>
                          <span className="text-[10px] opacity-80">${asset.marketCap}B</span>
                        </div>

                        <div className="my-0.5 text-center">
                          <div className="font-mono text-sm font-black">
                            {asset.changePercent >= 0 ? '+' : ''}
                            {asset.changePercent}%
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono opacity-90">
                          <span>${asset.price.toLocaleString()}</span>
                          <span>{asset.volume}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
};
