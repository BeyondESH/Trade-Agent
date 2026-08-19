import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

/**
 * Normalized BlockBeats data for the "Global Markets Overview" view.
 *
 * Each section maps to one (or a group of) `/api/blockbeats/data/*` endpoint.
 * A missing/undefined field means "no data" (renders as N/A) — a real numeric
 * `0` is kept distinct from missing data.
 */

export type SectionState<T> = { data?: T };

export interface TopCardData {
  /** BTC Spot ETF 最新当日净流入 / 累计净流入（百万美元）。 */
  etfNet: number | null;
  etfTotal: number | null;
  /** 合规交易所 最新当日/累计净流入。 */
  compliantNet: number | null;
  compliantTotal: number | null;
  /** IBIT / FBTC 最新当日净流入。 */
  ibit: number | null;
  fbtc: number | null;
  /** Bitfinex 杠杆多头：价格 / 持仓数量。 */
  longPrice: number | null;
  longCount: number | null;
  /** 抄底逃顶指标信号列表（status 为上游真实字段）。 */
  indicators: TopIndicatorRow[];
}

export interface TopIndicatorRow {
  /** 指标名称（如「市场脉动指数」）。 */
  name: string;
  /** 指标说明文本。 */
  info: string;
  /** 上游信号值：Buy / Sell / Hold / ""（未知兜底为 N/A）。 */
  status: string;
  /** 数据时间（create_time，UTC 字符串）。 */
  createTime: string;
}

export interface KlineSeries {
  price: number | null;
  up: boolean | null;
  series: number[];
}

export type MacroData = {
  us10y?: KlineSeries;
  dxy?: KlineSeries;
};

export interface ChainTx {
  name: string;
  image: string;
  volume: number | null;
  date: string | null;
}

export type AssetsData = {
  usdt: number | null;
  usdc: number | null;
  chains: ChainTx[];
};

export interface ContractRow {
  platform: "Hyperliquid" | "Bybit" | "Binance";
  openInterest: number | null;
  volume: number | null;
}

export type ContractData = { rows: ContractRow[] };

export interface NetflowCoin {
  symbol: string;
  logoUrl: string;
  priceUsd: number | null;
  netflow: number | null;
  liquidity: number | null;
}

export type NetflowData = { coins: NetflowCoin[] };

export interface MarketOverview {
  topCards: SectionState<TopCardData>;
  macro: SectionState<MacroData>;
  assets: SectionState<AssetsData>;
  contract: SectionState<ContractData>;
  netflow: SectionState<NetflowData>;
  loading: boolean;
  network: string;
  setNetwork: (n: string) => void;
}

/** Networks available for the top10_netflow selector. */
export const NETFLOW_NETWORK_OPTIONS = ["solana", "ethereum", "base", "bsc", "arbitrum", "ton"] as const;

/* -- candidate-field helpers -------------------------------------------------- */

/** Read the first defined value among candidate keys (underscore + camel fallback). */
function pick<T>(rec: Record<string, unknown> | null | undefined, keys: string[]): T | undefined {
  if (!rec) return undefined;
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function last<T>(arr: T[] | null | undefined): T | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[arr.length - 1] ?? null;
}

/* -- endpoint normalizers (each returns undefined on failure) ------------------ */

function normalizeTopCards(
  btcEtf: unknown,
  ibitFbtc: unknown,
  compliant: unknown,
  bitfinexLong: unknown,
  indicator: unknown,
): TopCardData | undefined {
  // btc_etf: [{ date, net_inflow_million, total_inflow_million }]
  const etfRow = last(btcEtf as Array<Record<string, unknown>>);
  const compliantRow = last(compliant as Array<Record<string, unknown>>);
  // ibit_fbtc: { ibit: [{date,day_net_inflow}], fbtc: [...] }
  const ibitRec = (ibitFbtc ?? {}) as Record<string, unknown>;
  const ibitRow = last((ibitRec.ibit as Array<Record<string, unknown>>) ?? null);
  const fbtcRow = last((ibitRec.fbtc as Array<Record<string, unknown>>) ?? null);
  // bitfinex_long: [{ symbol, price, long, ... }]
  const longRow = last(bitfinexLong as Array<Record<string, unknown>>);
  // bottom_top_indicator: [{ name, info, status, create_time }]
  const indicators = Array.isArray(indicator)
    ? indicator.map((r) => ({
        name: String(pick(r, ["name"]) ?? "") || "?",
        info: String(pick(r, ["info"]) ?? "") || "",
        status: String(pick(r, ["status"]) ?? "") || "",
        createTime: String(pick(r, ["create_time", "createTime"]) ?? "") || "",
      }))
    : [];

  return {
    etfNet: etfRow ? asNumber(pick(etfRow, ["day_net_inflow_million", "dayNetInflowMillion", "net_inflow_million", "netInflowMillion"])) : null,
    etfTotal: etfRow ? asNumber(pick(etfRow, ["total_net_inflow_million", "totalNetInflowMillion", "total_inflow_million", "totalInflowMillion"])) : null,
    compliantNet: compliantRow ? asNumber(pick(compliantRow, ["day_net_inflow", "dayNetInflow", "net_inflow", "netInflow"])) : null,
    compliantTotal: compliantRow ? asNumber(pick(compliantRow, ["total_net_inflow", "totalNetInflow", "total_net_flow", "totalNetFlow"])) : null,
    ibit: ibitRow ? asNumber(pick(ibitRow, ["day_net_inflow", "dayNetInflow", "net_inflow", "netInflow"])) : null,
    fbtc: fbtcRow ? asNumber(pick(fbtcRow, ["day_net_inflow", "dayNetInflow", "net_inflow", "netInflow"])) : null,
    longPrice: longRow ? asNumber(pick(longRow, ["price"])) : null,
    longCount: longRow ? asNumber(pick(longRow, ["long"])) : null,
    indicators,
  };
}

function normalizeKline(raw: unknown): KlineSeries | undefined {
  const rows = raw as Array<Record<string, unknown>>;
  const row = last(rows);
  if (!row) return undefined;
  const close = asNumber(pick(row, ["close"]));
  const open = asNumber(pick(row, ["open"]));
  // Keep the history of `close` values across the returned series for a sparkline.
  const series: number[] = [];
  for (const r of rows) {
    const c = asNumber(pick(r, ["close"]));
    if (c !== null) series.push(c);
  }
  return {
    price: close,
    up: close !== null && open !== null ? close >= open : null,
    series: series.slice(-31),
  };
}

function normalizeAssets(marketcap: unknown, dailyTx: unknown): AssetsData | undefined {
  const mc = (marketcap ?? {}) as Record<string, unknown>;
  const usdtArr = mc.usdt as Array<Record<string, unknown>>;
  const usdcArr = mc.usdc as Array<Record<string, unknown>>;
  const usdtRow = last(usdtArr);
  const usdcRow = last(usdcArr);

  const chains: ChainTx[] = [];
  const txin = dailyTx as Array<Record<string, unknown>>;
  if (Array.isArray(txin)) {
    for (const chain of txin) {
      const name = String(pick(chain, ["name_capitalized", "name"]) ?? "") || "?";
      const image = String(pick(chain, ["image"]) ?? "") || "";
      const data = chain.data as Array<Record<string, unknown>>;
      const drow = last(data);
      chains.push({
        name,
        image,
        volume: drow ? asNumber(pick(drow, ["daily_transactions", "dailyTransactions"])) : null,
        date: drow ? String(pick(drow, ["date"]) ?? "") || null : null,
      });
    }
  }

  return {
    usdt: usdtRow ? asNumber(pick(usdtRow, ["market_cap", "marketCap", "value"])) : null,
    usdc: usdcRow ? asNumber(pick(usdcRow, ["market_cap", "marketCap", "value"])) : null,
    chains,
  };
}

function normalizeContract(raw: unknown): ContractData | undefined {
  const row = last(raw as Array<Record<string, unknown>>);
  if (!row) return undefined;
  const mk = (platform: string, prefix: string) => ({
    platform: platform as ContractRow["platform"],
    openInterest: asNumber(pick(row, [`${prefix}_open_interest`, `${prefix}OpenInterest`])),
    volume: asNumber(pick(row, [`${prefix}_volume`, `${prefix}Volume`])),
  });
  return {
    rows: [mk("Hyperliquid", "hyperliquid"), mk("Bybit", "bybit"), mk("Binance", "binance")],
  };
}

function normalizeNetflow(raw: unknown): NetflowData | undefined {
  const list = raw as Array<Record<string, unknown>>;
  if (!Array.isArray(list)) return undefined;
  const coins: NetflowCoin[] = [];
  for (const r of list) {
    const symbol = String(pick(r, ["tokenSymbol", "token_symbol", "symbol"]) ?? "") || "?";
    const net = asNumber(pick(r, ["netflow", "net_flow"]));
    const price = asNumber(pick(r, ["priceUsd", "price_usd"]));
    const liq = asNumber(pick(r, ["liquidity"]));
    coins.push({
      symbol,
      logoUrl: String(pick(r, ["logoUrl", "logo_url"]) ?? "") || "",
      priceUsd: price,
      netflow: net,
      liquidity: liq,
    });
  }
  return { coins };
}

/* -- hook --------------------------------------------------------------------- */

export function useMarketOverview(): MarketOverview {
  const [netflowNetwork, setNetflowNetwork] = useState<string>("solana");
  const [topCards, setTopCards] = useState<SectionState<TopCardData>>({});
  const [macro, setMacro] = useState<SectionState<MacroData>>({});
  const [assets, setAssets] = useState<SectionState<AssetsData>>({});
  const [contract, setContract] = useState<SectionState<ContractData>>({});
  const [netflow, setNetflow] = useState<SectionState<NetflowData>>({});
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchMacro() {
      const [usRes, dxyRes] = await Promise.allSettled([
        api.blockbeatsData("us10y", { type: "1M" }),
        api.blockbeatsData("dxy", { type: "1M" }),
      ]);
      const us10y = usRes.status === "fulfilled" ? normalizeKline(usRes.value.data) : undefined;
      const dxy = dxyRes.status === "fulfilled" ? normalizeKline(dxyRes.value.data) : undefined;
      if (!cancelled) {
        setMacro({
          data:
            us10y || dxy
              ? { ...(us10y ? { us10y } : {}), ...(dxy ? { dxy } : {}) }
              : undefined,
        });
      }
    }

    async function fetchStatic() {
      const [etf, ibit, compliant, long, ind, mc, tx, ctr] = await Promise.allSettled([
        api.blockbeatsData("btc_etf"),
        api.blockbeatsData("ibit_fbtc"),
        api.blockbeatsData("compliant_total"),
        api.blockbeatsData("bitfinex_long"),
        api.blockbeatsData("bottom_top_indicator"),
        api.blockbeatsData("stablecoin_marketcap"),
        api.blockbeatsData("daily_tx"),
        api.blockbeatsData("contract"),
      ]);
      const v = <T,>(r: PromiseSettledResult<{ status: number; data: unknown }>): T | undefined =>
        r.status === "fulfilled" ? (r.value.data as T) : undefined;
      if (cancelled) return;
      setTopCards({
        data:
          normalizeTopCards(
            v<Array<Record<string, unknown>>>(etf),
            v<Record<string, unknown>>(ibit),
            v<Array<Record<string, unknown>>>(compliant),
            v<Array<Record<string, unknown>>>(long),
            v<Array<Record<string, unknown>>>(ind),
          ),
      });
      setAssets({
        data:
          normalizeAssets(
            v<Record<string, unknown>>(mc),
            v<Array<Record<string, unknown>>>(tx),
          ),
      });
      setContract({ data: normalizeContract(v<Array<Record<string, unknown>>>(ctr)) });
    }

    async function fetchNetflow(network: string) {
      const res = await api.blockbeatsData("top10_netflow", { network });
      if (!cancelled) setNetflow({ data: normalizeNetflow(res.data) });
    }

    (async () => {
      setLoading(true);
      await Promise.all([fetchStatic(), fetchMacro(), fetchNetflow(netflowNetwork)]);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netflowNetwork]);

  const setNetwork = useCallback((n: string) => {
    setLoading(true);
    setNetflowNetwork(n);
  }, []);

  return { topCards, macro, assets, contract, netflow, loading, network: netflowNetwork, setNetwork };
}
