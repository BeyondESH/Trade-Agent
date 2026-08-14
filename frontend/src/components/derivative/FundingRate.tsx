import { memo } from "react";
import type { DerivativeState } from "../../hooks/useDerivative";

function rateText(r: string | undefined): string {
  if (!r) return "--";
  const v = Number(r);
  if (Number.isNaN(v)) return r;
  return `${(v * 100).toFixed(4)}%`;
}

export const FundingRate = memo(function FundingRate({ funding }: { funding: DerivativeState["funding"] }) {
  const rate = rateText(funding?.fundingRate);
  const up = (funding?.fundingRate ? Number(funding.fundingRate) : 0) >= 0;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <span className="text-muted">资金费率</span>
      <span className={`tnum font-medium ${up ? "text-up" : "text-down"}`}>{rate}</span>
    </div>
  );
});

export const MarkPrice = memo(function MarkPrice({ markPrice }: { markPrice: DerivativeState["markPrice"] }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <span className="text-muted">标记价格</span>
      <span className="tnum font-medium">{markPrice?.markPrice ?? "--"}</span>
    </div>
  );
});
