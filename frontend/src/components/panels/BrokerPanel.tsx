import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Portfolio } from "../../api/types";
import { useI18n } from "../../lib/i18n";

interface Props {
  symbol: string;
  category: string;
}

/** Bottom dock broker tab — portfolio summary + order form (existing APIs only). */
export function BrokerPanel({ symbol, category }: Props) {
  const { t } = useI18n();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [leverage, setLeverage] = useState("1");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .portfolio()
      .then((p) => alive && setPortfolio(p))
      .catch(() => alive && setPortfolio(null));
    return () => {
      alive = false;
    };
  }, []);

  const positions = portfolio?.positions ? Object.values(portfolio.positions) : [];

  const submit = async () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      setMsg("price");
      return;
    }
    try {
      const res = await api.order({
        category,
        symbol,
        side,
        leverage: Number(leverage) || 1,
        price: p,
      });
      setMsg(JSON.stringify(res.preview));
      const fresh = await api.portfolio();
      setPortfolio(fresh);
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-3 bg-base p-3 text-xs" data-testid="broker-panel">
      <div className="flex w-64 shrink-0 flex-col gap-2">
        <div className="font-semibold text-text">{t("broker.equity")}</div>
        <div className="tnum text-lg font-semibold">
          {portfolio ? portfolio.equity.toFixed(2) : "--"}
        </div>
        <div className="flex flex-col gap-1.5">
          <select
            value={symbol}
            onChange={() => {}}
            className="rounded-btn border border-border bg-base px-2 py-1 text-xs text-text outline-none focus:border-accent"
          >
            <option value={symbol}>{symbol}</option>
          </select>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "buy" | "sell")}
            className="rounded-btn border border-border bg-base px-2 py-1 text-xs text-text outline-none focus:border-accent"
          >
            <option value="buy">{t("broker.sideBuy")}</option>
            <option value="sell">{t("broker.sideSell")}</option>
          </select>
          <input
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            placeholder="leverage"
            className="rounded-btn border border-border bg-base px-2 py-1 text-xs text-text tnum outline-none focus:border-accent"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={t("orderbook.price")}
            className="rounded-btn border border-border bg-base px-2 py-1 text-xs text-text tnum outline-none focus:border-accent"
            data-testid="broker-price"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("broker.amount")}
            className="rounded-btn border border-border bg-base px-2 py-1 text-xs text-text tnum outline-none focus:border-accent"
          />
          <button
            onClick={submit}
            className={`rounded-btn px-3 py-1 text-xs font-semibold text-white hover:brightness-110 ${
              side === "buy" ? "bg-up" : "bg-down"
            }`}
            data-testid="broker-submit"
          >
            {t("broker.placeOrder")}
          </button>
          {msg && <div className="break-all text-muted">{msg}</div>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mb-1 font-semibold text-text">{t("broker.positions")}</div>
        {positions.length === 0 && <div className="text-muted">{t("broker.noPositions")}</div>}
        {positions.map((p, i) => (
          <div key={i} className="tnum rounded-chip px-2 py-1 text-muted">
            {typeof p === "object" && p !== null ? JSON.stringify(p) : String(p)}
          </div>
        ))}
      </div>
    </div>
  );
}
