/**
 * Paper (simulated) trading account for replay mode. Purely frontend — it
 * never touches the real `/order` endpoints.
 */
export interface PaperPosition {
  id: string;
  side: "long" | "short";
  qty: number;
  entry: number;
}

export interface PaperSummary {
  realized: number;
  trades: number;
  wins: number;
  winRate: number;
}

export class PaperAccount {
  positions: PaperPosition[] = [];
  realized = 0;
  trades = 0;
  wins = 0;
  private seq = 0;

  open(side: "long" | "short", qty: number, price: number): void {
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return;
    this.positions.push({ id: `p${++this.seq}`, side, qty, entry: price });
  }

  /** Close every open position at `price`; settles realized PnL. */
  closeAll(price: number): void {
    for (const p of this.positions) {
      const dir = p.side === "long" ? 1 : -1;
      const pnl = (price - p.entry) * dir * p.qty;
      this.realized += pnl;
      this.trades += 1;
      if (pnl > 0) this.wins += 1;
    }
    this.positions = [];
  }

  /** Unrealized PnL at the given mark price. */
  floating(price: number): number {
    if (!Number.isFinite(price)) return 0;
    return this.positions.reduce((sum, p) => {
      const dir = p.side === "long" ? 1 : -1;
      return sum + (price - p.entry) * dir * p.qty;
    }, 0);
  }

  get summary(): PaperSummary {
    return {
      realized: this.realized,
      trades: this.trades,
      wins: this.wins,
      winRate: this.trades > 0 ? this.wins / this.trades : 0,
    };
  }

  reset(): void {
    this.positions = [];
    this.realized = 0;
    this.trades = 0;
    this.wins = 0;
  }
}
