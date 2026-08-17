import { Candle } from '../types/trading';

export function calculateSMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    result.push(Number((sum / period).toFixed(4)));
  }
  return result;
}

export function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  let initialSMA = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
      initialSMA += candles[i].close;
    } else if (i === period - 1) {
      initialSMA += candles[i].close;
      const ema = initialSMA / period;
      result.push(Number(ema.toFixed(4)));
    } else {
      const prevEMA = result[i - 1]!;
      const ema = (candles[i].close - prevEMA) * multiplier + prevEMA;
      result.push(Number(ema.toFixed(4)));
    }
  }
  return result;
}

export function calculateBollingerBands(candles: Candle[], period: number = 20, stdDevMultiplier: number = 2) {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    const sma = sum / period;

    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(candles[i - j].close - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);

    middle.push(Number(sma.toFixed(2)));
    upper.push(Number((sma + stdDev * stdDevMultiplier).toFixed(2)));
    lower.push(Number((sma - stdDev * stdDevMultiplier).toFixed(2)));
  }

  return { upper, middle, lower };
}

export function calculateRSI(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length < period + 1) return candles.map(() => null);

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }

    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        let avgGain = gains / period;
        let avgLoss = losses / period;
        if (avgLoss === 0) {
          result.push(100);
        } else {
          const rs = avgGain / avgLoss;
          result.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
        }
      } else {
        result.push(null);
      }
    } else {
      const prevRsi = result[i - 1];
      // Smoothed
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;

      if (losses === 0) {
        result.push(100);
      } else {
        const rs = gains / losses;
        result.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      }
    }
  }

  return result;
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
) {
  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(Number((fastEMA[i]! - slowEMA[i]!).toFixed(4)));
    }
  }

  // Calculate Signal line (EMA of MACD line)
  const signalLine: (number | null)[] = [];
  const multiplier = 2 / (signalPeriod + 1);
  let initialSum = 0;
  let validCount = 0;

  for (let i = 0; i < macdLine.length; i++) {
    const val = macdLine[i];
    if (val === null) {
      signalLine.push(null);
      continue;
    }

    validCount++;
    if (validCount < signalPeriod) {
      initialSum += val;
      signalLine.push(null);
    } else if (validCount === signalPeriod) {
      initialSum += val;
      const initialSignal = initialSum / signalPeriod;
      signalLine.push(Number(initialSignal.toFixed(4)));
    } else {
      const prevSignal = signalLine[i - 1]!;
      const signal = (val - prevSignal) * multiplier + prevSignal;
      signalLine.push(Number(signal.toFixed(4)));
    }
  }

  const histogram: (number | null)[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null || signalLine[i] === null) {
      histogram.push(null);
    } else {
      histogram.push(Number((macdLine[i]! - signalLine[i]!).toFixed(4)));
    }
  }

  return { macdLine, signalLine, histogram };
}

export function calculateSuperTrend(candles: Candle[], period: number = 10, multiplier: number = 3) {
  const supertrend: (number | null)[] = [];
  const direction: ('UP' | 'DOWN')[] = [];

  // Calculate ATR
  const atr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      atr.push(candles[i].high - candles[i].low);
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    const prevAtr = atr[i - 1];
    atr.push((prevAtr * (period - 1) + tr) / period);
  }

  let isUp = true;
  let upperBand = 0;
  let lowerBand = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      supertrend.push(null);
      direction.push('UP');
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + multiplier * atr[i];
    const basicLower = hl2 - multiplier * atr[i];

    if (i === period) {
      upperBand = basicUpper;
      lowerBand = basicLower;
    } else {
      upperBand = basicUpper < upperBand || candles[i - 1].close > upperBand ? basicUpper : upperBand;
      lowerBand = basicLower > lowerBand || candles[i - 1].close < lowerBand ? basicLower : lowerBand;
    }

    if (candles[i].close > upperBand) {
      isUp = true;
    } else if (candles[i].close < lowerBand) {
      isUp = false;
    }

    supertrend.push(isUp ? lowerBand : upperBand);
    direction.push(isUp ? 'UP' : 'DOWN');
  }

  return { supertrend, direction };
}

export function calculateVWAP(candles: Candle[]): number[] {
  let cumVolume = 0;
  let cumTypicalVolume = 0;
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumTypicalVolume += typicalPrice * candles[i].volume;
    cumVolume += candles[i].volume;
    result.push(Number((cumTypicalVolume / Math.max(1, cumVolume)).toFixed(2)));
  }

  return result;
}
