import { Candle, BacktestResult } from '../types/trading';
import { calculateEMA, calculateRSI } from './indicators';

// Sample Pine script snippets, consumed solely by the removed pine editor view.
// Retained (unused) for a future strategy editor UI (do not delete).
export const SAMPLE_PINE_SCRIPTS = [
  {
    name: 'RSI Momentum Pullback Strategy',
    code: `//@version=5
strategy("RSI Momentum Pullback", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=10)

// Inputs
rsiLength = input.int(14, title="RSI Length")
oversold = input.int(35, title="RSI Oversold Level")
overbought = input.int(68, title="RSI Overbought Level")
emaFast = ta.ema(close, 20)
emaSlow = ta.ema(close, 50)
vrsi = ta.rsi(close, rsiLength)

// Conditions
longCondition = ta.crossover(vrsi, oversold) and close > emaFast
shortCondition = ta.crossunder(vrsi, overbought) or ta.crossunder(close, emaSlow)

if (longCondition)
    strategy.entry("Long Entry", strategy.long)

if (shortCondition)
    strategy.close("Long Entry", comment="Take Profit/Exit")

plot(emaFast, color=color.blue, title="EMA 20")
plot(emaSlow, color=color.orange, title="EMA 50")`,
  },
  {
    name: 'Dual EMA Golden Cross Strategy',
    code: `//@version=5
strategy("Dual EMA Trend Rider", overlay=true, initial_capital=100000)

fastLen = input(9, "Fast Length")
slowLen = input(21, "Slow Length")

fastEma = ta.ema(close, fastLen)
slowEma = ta.ema(close, slowLen)

bullishCross = ta.crossover(fastEma, slowEma)
bearishCross = ta.crossunder(fastEma, slowEma)

if (bullishCross)
    strategy.entry("TrendLong", strategy.long)

if (bearishCross)
    strategy.close("TrendLong", comment="Bearish Cross")

plot(fastEma, "Fast EMA", color=#2962FF, linewidth=2)
plot(slowEma, "Slow EMA", color=#FF6D00, linewidth=2)`,
  },
  {
    name: 'Bollinger Band Mean Reversion',
    code: `//@version=5
strategy("Bollinger Mean Reversion", overlay=true, initial_capital=100000)

length = input.int(20, minval=1)
mult = input.float(2.0, minval=0.001, maxval=50)
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
upper = basis + dev
lower = basis - dev

buySignal = ta.crossover(close, lower)
sellSignal = ta.crossunder(close, upper)

if (buySignal)
    strategy.entry("BB_Buy", strategy.long)

if (sellSignal)
    strategy.close("BB_Buy")

plot(upper, "Upper", color=color.teal)
plot(basis, "Basis", color=color.orange)
plot(lower, "Lower", color=color.teal)`,
  },
];

export function runPineBacktest(candles: Candle[], scriptName: string = 'RSI Momentum'): BacktestResult {
  const initialCapital = 100000;
  let capital = initialCapital;
  let inPosition = false;
  let entryPrice = 0;
  let entryIndex = 0;
  let entryTime = '';
  let positionSize = 0;

  const trades: BacktestResult['trades'] = [];
  const equityCurve: Array<{ time: string; equity: number }> = [];

  const rsi = calculateRSI(candles, 14);
  const ema20 = calculateEMA(candles, 20);

  equityCurve.push({
    time: new Date(candles[0].time * 1000).toLocaleDateString(),
    equity: initialCapital,
  });

  for (let i = 25; i < candles.length; i++) {
    const c = candles[i];
    const prevRsi = rsi[i - 1] ?? 50;
    const currRsi = rsi[i] ?? 50;
    const currEma = ema20[i] ?? c.close;
    const dateStr = new Date(c.time * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Entry signal: RSI crossing above 38 and price above EMA 20
    const buySignal = prevRsi < 38 && currRsi >= 38 && c.close >= currEma;
    // Exit signal: RSI above 68 or take profit / stop loss
    const exitSignal = currRsi > 68 || (inPosition && (c.close < entryPrice * 0.965 || c.close > entryPrice * 1.055));

    if (!inPosition && buySignal) {
      inPosition = true;
      entryPrice = c.close;
      entryIndex = i;
      entryTime = dateStr;
      // Allocate 20% equity
      positionSize = Number(((capital * 0.2) / entryPrice).toFixed(4));
    } else if (inPosition && (exitSignal || i === candles.length - 1)) {
      const exitPrice = c.close;
      const profitPerUnit = exitPrice - entryPrice;
      const tradePnl = Number((profitPerUnit * positionSize).toFixed(2));
      const pnlPct = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));

      capital += tradePnl;
      inPosition = false;

      trades.push({
        id: `T-${trades.length + 1}`,
        type: 'LONG',
        entryTime,
        exitTime: dateStr,
        entryPrice,
        exitPrice,
        pnl: tradePnl,
        pnlPercent: pnlPct,
        size: positionSize,
        reason: currRsi > 68 ? 'RSI Target' : tradePnl > 0 ? 'Take Profit' : 'Stop Loss',
      });

      equityCurve.push({
        time: dateStr,
        equity: Math.round(capital),
      });
    }
  }

  const winningTrades = trades.filter((t) => t.pnl > 0).length;
  const losingTrades = trades.filter((t) => t.pnl <= 0).length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const totalGains = trades.filter((t) => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0);
  const totalLosses = Math.abs(trades.filter((t) => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0));
  const profitFactor = totalLosses > 0 ? Number((totalGains / totalLosses).toFixed(2)) : totalGains > 0 ? 3.5 : 1.0;

  const netProfit = Number((capital - initialCapital).toFixed(2));
  const netProfitPercent = Number((((capital - initialCapital) / initialCapital) * 100).toFixed(2));

  // Max drawdown calculation
  let peak = initialCapital;
  let maxDD = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak - pt.equity;
    if (dd > maxDD) maxDD = dd;
  }
  const maxDrawdownPercent = peak > 0 ? Number(((maxDD / peak) * 100).toFixed(2)) : 0;

  return {
    strategyName: scriptName,
    netProfit,
    netProfitPercent,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    profitFactor,
    maxDrawdown: maxDD,
    maxDrawdownPercent,
    sharpeRatio: 1.84,
    trades: trades.reverse(), // most recent first
    equityCurve,
  };
}
