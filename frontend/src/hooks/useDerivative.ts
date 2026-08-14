import { useState } from "react";
import { useExchangeSocket } from "./useExchangeSocket";

export interface FundingInfo {
  instId: string;
  fundingRate: string;
  fundingTime?: string;
  nextFundingTime?: string;
}

export interface MarkPriceInfo {
  instId: string;
  markPrice: string;
  indexPrice?: string;
  ts?: string;
}

export interface DerivativeState {
  funding: FundingInfo | null;
  markPrice: MarkPriceInfo | null;
}

/** Funding rate + mark price for a symbol via the shared WS. */
export function useDerivative(symbol: string): DerivativeState {
  const [funding, setFunding] = useState<FundingInfo | null>(null);
  const [markPrice, setMarkPrice] = useState<MarkPriceInfo | null>(null);

  useExchangeSocket("funding-time", symbol, (frame) => {
    const d = frame.data as { funding?: FundingInfo } | FundingInfo | undefined;
    const info = Array.isArray(frame.data)
      ? (frame.data as FundingInfo[])[0]
      : d && typeof d === "object" && "funding" in d
        ? (d as { funding: FundingInfo }).funding
        : (d as FundingInfo | undefined);
    if (info && info.instId === symbol) setFunding(info);
  });

  useExchangeSocket("mark-price", symbol, (frame) => {
    const d = frame.data as { mark_price?: MarkPriceInfo } | MarkPriceInfo | undefined;
    const info = Array.isArray(frame.data)
      ? (frame.data as MarkPriceInfo[])[0]
      : d && typeof d === "object" && "mark_price" in d
        ? (d as { mark_price: MarkPriceInfo }).mark_price
        : (d as MarkPriceInfo | undefined);
    if (info && info.instId === symbol) setMarkPrice(info);
  });

  return { funding, markPrice };
}
