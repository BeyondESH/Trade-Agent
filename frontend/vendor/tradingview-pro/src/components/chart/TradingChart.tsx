import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Candle,
  SymbolInfo,
  Timeframe,
  ChartType,
  DrawingToolType,
  Drawing,
  IndicatorConfig,
  Point,
} from '../../types/trading';
import {
  calculateEMA,
  calculateSMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateSuperTrend,
  calculateVWAP,
} from '../../utils/indicators';
import { ChartHUD } from './ChartHUD';
import { ActiveDrawingToolbar } from './ActiveDrawingToolbar';

interface Props {
  symbol: SymbolInfo;
  timeframe: Timeframe;
  chartType: ChartType;
  candles: Candle[];
  activeTool: DrawingToolType;
  onToolUsed?: () => void;
  indicators: IndicatorConfig[];
  onToggleIndicator: (id: string) => void;
  onRemoveIndicator: (id: string) => void;
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  magnetMode: boolean;
  lockAll: boolean;
  hideAll: boolean;
  theme: 'dark' | 'light';
  isReplayActive: boolean;
  replayIndex: number;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  onOpenSymbolSearch: () => void;
}

export const TradingChart: React.FC<Props> = ({
  symbol,
  timeframe,
  chartType,
  candles: rawCandles,
  activeTool,
  onToolUsed,
  indicators,
  onToggleIndicator,
  onRemoveIndicator,
  drawings,
  onUpdateDrawings,
  magnetMode,
  lockAll,
  hideAll,
  theme,
  isReplayActive,
  replayIndex,
  onOpenOrderModal,
  onOpenSymbolSearch,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Active slice if replay is enabled
  const candles = isReplayActive
    ? rawCandles.slice(0, Math.max(10, Math.min(replayIndex + 1, rawCandles.length)))
    : rawCandles;

  // Viewport State
  const [candleWidth, setCandleWidth] = useState<number>(8);
  const [candleGap, setCandleGap] = useState<number>(3);
  const [scrollOffset, setScrollOffset] = useState<number>(0); // number of candles scrolled from right
  const [priceRangePadding, setPriceRangePadding] = useState<number>(0.1); // 10% top/bottom padding
  const [priceScaleRatio, setPriceScaleRatio] = useState<number>(1); // user zoom on price axis

  // Crosshair State
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);

  // Interaction State
  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartOffsetRef = useRef<number>(0);
  const isScalingPriceRef = useRef<boolean>(false);
  const isScalingTimeRef = useRef<boolean>(false);

  // Drawing in progress
  const [currentDrawing, setCurrentDrawing] = useState<Drawing | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const isDark = theme === 'dark';
  const rightScaleWidth = 72;
  const bottomScaleHeight = 26;

  // Calculate Heikin-Ashi if selected
  const processedCandles = React.useMemo(() => {
    if (chartType !== 'heikin_ashi' || candles.length === 0) return candles;
    const ha: Candle[] = [];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);
      ha.push({
        time: c.time,
        open: Number(haOpen.toFixed(symbol.digits)),
        high: Number(haHigh.toFixed(symbol.digits)),
        low: Number(haLow.toFixed(symbol.digits)),
        close: Number(haClose.toFixed(symbol.digits)),
        volume: c.volume,
      });
    }
    return ha;
  }, [candles, chartType, symbol.digits]);

  // Indicator Calculations
  const calculatedIndicators = React.useMemo(() => {
    return indicators.map((ind) => {
      if (!ind.visible) return ind;
      if (ind.id === 'ema20') return { ...ind, values: calculateEMA(candles, 20) };
      if (ind.id === 'ema50') return { ...ind, values: calculateEMA(candles, 50) };
      if (ind.id === 'ema200') return { ...ind, values: calculateEMA(candles, 200) };
      if (ind.id === 'sma20') return { ...ind, values: calculateSMA(candles, 20) };
      if (ind.id === 'bb') return { ...ind, values: calculateBollingerBands(candles, 20, 2) };
      if (ind.id === 'rsi') return { ...ind, values: calculateRSI(candles, 14) };
      if (ind.id === 'macd') return { ...ind, values: calculateMACD(candles) };
      if (ind.id === 'supertrend') return { ...ind, values: calculateSuperTrend(candles, 10, 3) };
      if (ind.id === 'vwap') return { ...ind, values: calculateVWAP(candles) };
      return ind;
    });
  }, [candles, indicators]);

  // Sub-panes (e.g. RSI, MACD)
  const subPanes = calculatedIndicators.filter(
    (ind) => ind.visible && ind.type === 'pane'
  );

  // Coordinate Conversion Helpers
  const getRenderMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    const chartWidth = width - rightScaleWidth;
    const totalSubPaneHeight = subPanes.length * 110;
    const mainChartHeight = height - bottomScaleHeight - totalSubPaneHeight;

    const totalCandleSlot = candleWidth + candleGap;
    const visibleCandleCount = Math.ceil(chartWidth / totalCandleSlot) + 2;

    const endIndex = Math.min(
      processedCandles.length,
      Math.max(0, processedCandles.length - Math.floor(scrollOffset))
    );
    const startIndex = Math.max(0, endIndex - visibleCandleCount);

    const visibleCandles = processedCandles.slice(startIndex, endIndex);

    // Min / Max Price in visible window
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    for (const c of visibleCandles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    }

    if (minPrice === Infinity || maxPrice === -Infinity) {
      minPrice = symbol.price * 0.95;
      maxPrice = symbol.price * 1.05;
    }

    const priceDiff = maxPrice - minPrice;
    const paddedMin = (minPrice - priceDiff * priceRangePadding) * priceScaleRatio;
    const paddedMax = (maxPrice + priceDiff * priceRangePadding) / priceScaleRatio;
    const actualRange = paddedMax - paddedMin || 1;

    const priceToY = (price: number) => {
      const normalized = (price - paddedMin) / actualRange;
      return mainChartHeight - normalized * mainChartHeight;
    };

    const yToPrice = (y: number) => {
      const normalized = (mainChartHeight - y) / mainChartHeight;
      return paddedMin + normalized * actualRange;
    };

    const indexToX = (index: number) => {
      // X starts from right
      const fromEnd = processedCandles.length - 1 - index;
      const x = chartWidth - (fromEnd - scrollOffset + 0.5) * totalCandleSlot;
      return x;
    };

    const xToIndex = (x: number) => {
      const fromRight = chartWidth - x;
      const fromEnd = Math.round(fromRight / totalCandleSlot - 0.5 + scrollOffset);
      const index = processedCandles.length - 1 - fromEnd;
      return Math.max(0, Math.min(processedCandles.length - 1, index));
    };

    return {
      width,
      height,
      chartWidth,
      mainChartHeight,
      totalSubPaneHeight,
      startIndex,
      endIndex,
      visibleCandles,
      minPrice: paddedMin,
      maxPrice: paddedMax,
      maxVolume: Math.max(1, maxVolume),
      priceToY,
      yToPrice,
      indexToX,
      xToIndex,
      totalCandleSlot,
    };
  }, [
    candleWidth,
    candleGap,
    scrollOffset,
    priceRangePadding,
    priceScaleRatio,
    processedCandles,
    subPanes.length,
    symbol.price,
  ]);

  // Main Canvas Render Loop
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const metrics = getRenderMetrics();
    if (!metrics) return;

    const {
      width,
      height,
      chartWidth,
      mainChartHeight,
      visibleCandles,
      startIndex,
      minPrice,
      maxPrice,
      maxVolume,
      priceToY,
      indexToX,
      totalCandleSlot,
    } = metrics;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Clear Background
    ctx.fillStyle = isDark ? '#131722' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 2. Render Grid Lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark ? 'rgba(42, 46, 57, 0.4)' : 'rgba(224, 227, 235, 0.6)';
    ctx.setLineDash([4, 4]);

    // Horizontal Price Grids (5 to 8 lines)
    const priceStep = (maxPrice - minPrice) / 7;
    for (let i = 0; i <= 7; i++) {
      const p = minPrice + i * priceStep;
      const y = priceToY(p);
      if (y >= 0 && y <= mainChartHeight) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();

        // Right scale text
        ctx.fillStyle = isDark ? '#787b86' : '#787b86';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          p.toLocaleString(undefined, {
            minimumFractionDigits: symbol.digits,
            maximumFractionDigits: symbol.digits,
          }),
          chartWidth + 6,
          y
        );
      }
    }

    // Vertical Time Grids
    const stepBars = Math.max(12, Math.floor(chartWidth / 120));
    for (let i = 0; i < processedCandles.length; i += stepBars) {
      const x = indexToX(i);
      if (x >= 0 && x <= chartWidth) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height - bottomScaleHeight);
        ctx.stroke();

        // Bottom scale text
        const c = processedCandles[i];
        if (c) {
          const date = new Date(c.time * 1000);
          const label =
            timeframe === '1D' || timeframe === '1W' || timeframe === '1M'
              ? date.toLocaleDateString([], { month: 'short', day: 'numeric' })
              : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          ctx.fillStyle = isDark ? '#787b86' : '#787b86';
          ctx.font = '10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, height - bottomScaleHeight / 2);
        }
      }
    }

    ctx.setLineDash([]); // Reset line dash

    // 3. Render Volume Histogram at Bottom of Main Chart
    const volAreaHeight = mainChartHeight * 0.16;
    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const globalIndex = startIndex + i;
      const x = indexToX(globalIndex);
      const isUp = c.close >= c.open;

      const volHeight = (c.volume / maxVolume) * volAreaHeight;
      const volY = mainChartHeight - volHeight;

      ctx.fillStyle = isUp
        ? isDark
          ? 'rgba(8, 153, 129, 0.25)'
          : 'rgba(8, 153, 129, 0.25)'
        : isDark
        ? 'rgba(242, 54, 69, 0.25)'
        : 'rgba(242, 54, 69, 0.25)';

      ctx.fillRect(x - candleWidth / 2, volY, candleWidth, volHeight);
    }

    // 4. Render Price Series (Candles / Line / Area / Hollow / Bars)
    const bullColor = '#089981'; // TV Green
    const bearColor = '#f23645'; // TV Red

    if (chartType === 'line' || chartType === 'area') {
      ctx.beginPath();
      for (let i = 0; i < visibleCandles.length; i++) {
        const globalIndex = startIndex + i;
        const x = indexToX(globalIndex);
        const y = priceToY(visibleCandles[i].close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#2962ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (chartType === 'area' && visibleCandles.length > 0) {
        const firstX = indexToX(startIndex);
        const lastX = indexToX(startIndex + visibleCandles.length - 1);
        ctx.lineTo(lastX, mainChartHeight);
        ctx.lineTo(firstX, mainChartHeight);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, mainChartHeight);
        grad.addColorStop(0, isDark ? 'rgba(41, 98, 255, 0.35)' : 'rgba(41, 98, 255, 0.2)');
        grad.addColorStop(1, 'rgba(41, 98, 255, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    } else {
      // Candles / Bars
      for (let i = 0; i < visibleCandles.length; i++) {
        const c = visibleCandles[i];
        const globalIndex = startIndex + i;
        const x = indexToX(globalIndex);
        const isUp = c.close >= c.open;

        const openY = priceToY(c.open);
        const closeY = priceToY(c.close);
        const highY = priceToY(c.high);
        const lowY = priceToY(c.low);

        const candleTop = Math.min(openY, closeY);
        const candleHeight = Math.max(1.5, Math.abs(closeY - openY));

        ctx.fillStyle = isUp ? bullColor : bearColor;
        ctx.strokeStyle = isUp ? bullColor : bearColor;

        if (chartType === 'bars') {
          // OHLC Bar
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, highY);
          ctx.lineTo(x, lowY);
          ctx.stroke();

          // Open tick (left)
          ctx.beginPath();
          ctx.moveTo(x, openY);
          ctx.lineTo(x - candleWidth / 2, openY);
          ctx.stroke();

          // Close tick (right)
          ctx.beginPath();
          ctx.moveTo(x, closeY);
          ctx.lineTo(x + candleWidth / 2, closeY);
          ctx.stroke();
        } else if (chartType === 'hollow_candles') {
          // Hollow Candles: Wicks + Hollow Body for Up
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, highY);
          ctx.lineTo(x, candleTop);
          ctx.moveTo(x, candleTop + candleHeight);
          ctx.lineTo(x, lowY);
          ctx.stroke();

          if (isUp) {
            ctx.strokeRect(x - candleWidth / 2, candleTop, candleWidth, candleHeight);
          } else {
            ctx.fillRect(x - candleWidth / 2, candleTop, candleWidth, candleHeight);
          }
        } else {
          // Standard Candlestick & Heikin Ashi
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, highY);
          ctx.lineTo(x, lowY);
          ctx.stroke();

          ctx.fillRect(x - candleWidth / 2, candleTop, candleWidth, candleHeight);
        }
      }
    }

    // 5. Render Overlay Indicators
    for (const ind of calculatedIndicators) {
      if (!ind.visible || ind.type !== 'overlay' || !ind.values) continue;

      if (ind.id === 'bb') {
        const bb = ind.values as { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
        // Upper & Lower
        ['upper', 'middle', 'lower'].forEach((band) => {
          const vals = bb[band as keyof typeof bb];
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < visibleCandles.length; i++) {
            const globalIndex = startIndex + i;
            const val = vals[globalIndex];
            if (val === null || val === undefined) continue;
            const x = indexToX(globalIndex);
            const y = priceToY(val);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.strokeStyle = band === 'middle' ? '#ff9800' : '#2962ff';
          ctx.lineWidth = band === 'middle' ? 1.5 : 1;
          ctx.stroke();
        });
      } else if (ind.id === 'supertrend') {
        const st = ind.values as { supertrend: (number | null)[]; direction: ('UP' | 'DOWN')[] };
        for (let i = 0; i < visibleCandles.length - 1; i++) {
          const globalIndex = startIndex + i;
          const val1 = st.supertrend[globalIndex];
          const val2 = st.supertrend[globalIndex + 1];
          if (val1 === null || val2 === null) continue;

          const dir = st.direction[globalIndex];
          const x1 = indexToX(globalIndex);
          const y1 = priceToY(val1);
          const x2 = indexToX(globalIndex + 1);
          const y2 = priceToY(val2);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = dir === 'UP' ? '#089981' : '#f23645';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (Array.isArray(ind.values)) {
        // EMA / SMA / VWAP
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < visibleCandles.length; i++) {
          const globalIndex = startIndex + i;
          const val = ind.values[globalIndex];
          if (val === null || val === undefined) continue;
          const x = indexToX(globalIndex);
          const y = priceToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = ind.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 6. Render Sub-Panes (RSI, MACD)
    let currentPaneY = mainChartHeight;
    for (const ind of subPanes) {
      const paneHeight = 110;

      // Pane separator
      ctx.fillStyle = isDark ? '#1e222d' : '#f0f3fa';
      ctx.fillRect(0, currentPaneY, width, paneHeight);

      ctx.strokeStyle = isDark ? '#2a2e39' : '#e0e3eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, currentPaneY);
      ctx.lineTo(width, currentPaneY);
      ctx.stroke();

      // Label
      ctx.fillStyle = isDark ? '#d1d4dc' : '#131722';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(ind.name, 10, currentPaneY + 14);

      if (ind.id === 'rsi' && Array.isArray(ind.values)) {
        const rsiVals = ind.values as (number | null)[];
        const rsiToY = (v: number) => currentPaneY + paneHeight - (v / 100) * (paneHeight - 20) - 10;

        // 70 & 30 Lines
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = isDark ? '#787b86' : '#9598a1';

        ctx.beginPath();
        ctx.moveTo(0, rsiToY(70));
        ctx.lineTo(chartWidth, rsiToY(70));
        ctx.moveTo(0, rsiToY(30));
        ctx.lineTo(chartWidth, rsiToY(30));
        ctx.stroke();

        // Right scale for 70/30
        ctx.fillStyle = '#787b86';
        ctx.fillText('70', chartWidth + 6, rsiToY(70));
        ctx.fillText('30', chartWidth + 6, rsiToY(30));

        ctx.setLineDash([]);

        // RSI Line
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < visibleCandles.length; i++) {
          const globalIndex = startIndex + i;
          const val = rsiVals[globalIndex];
          if (val === null || val === undefined) continue;
          const x = indexToX(globalIndex);
          const y = rsiToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = ind.color || '#e040fb';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (ind.id === 'macd' && ind.values && !Array.isArray(ind.values)) {
        const macd = ind.values as {
          macdLine: (number | null)[];
          signalLine: (number | null)[];
          histogram: (number | null)[];
        };
        const zeroY = currentPaneY + paneHeight / 2;

        // Zero Line
        ctx.strokeStyle = isDark ? '#363a45' : '#d1d4dc';
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(chartWidth, zeroY);
        ctx.stroke();

        // Histogram Bars
        for (let i = 0; i < visibleCandles.length; i++) {
          const globalIndex = startIndex + i;
          const h = macd.histogram[globalIndex];
          if (h === null || h === undefined) continue;
          const x = indexToX(globalIndex);
          const barH = h * 8;
          ctx.fillStyle = h >= 0 ? '#089981' : '#f23645';
          ctx.fillRect(x - candleWidth / 2, zeroY - barH, candleWidth, barH);
        }

        // MACD & Signal Lines
        ['macdLine', 'signalLine'].forEach((lineKey) => {
          const vals = macd[lineKey as keyof typeof macd];
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < visibleCandles.length; i++) {
            const globalIndex = startIndex + i;
            const val = vals[globalIndex];
            if (val === null || val === undefined) continue;
            const x = indexToX(globalIndex);
            const y = zeroY - val * 8;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.strokeStyle = lineKey === 'macdLine' ? '#2962ff' : '#ff9800';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }

      currentPaneY += paneHeight;
    }

    // 7. Render Current Live Price Line & Badge
    const lastCandle = processedCandles[processedCandles.length - 1];
    if (lastCandle) {
      const currentPriceY = priceToY(lastCandle.close);
      const isUp = lastCandle.close >= (processedCandles[processedCandles.length - 2]?.close ?? lastCandle.open);
      const currentPriceColor = isUp ? bullColor : bearColor;

      // Dashed horizontal price line
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = currentPriceColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, currentPriceY);
      ctx.lineTo(chartWidth, currentPriceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Right Scale Badge
      ctx.fillStyle = currentPriceColor;
      ctx.fillRect(chartWidth, currentPriceY - 10, rightScaleWidth, 20);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        lastCandle.close.toLocaleString(undefined, {
          minimumFractionDigits: symbol.digits,
          maximumFractionDigits: symbol.digits,
        }),
        chartWidth + 6,
        currentPriceY
      );
    }

    // 8. Render User Drawings
    if (!hideAll) {
      const allDrawings = currentDrawing ? [...drawings, currentDrawing] : drawings;

      for (const d of allDrawings) {
        if (!d.visible) continue;
        const isSelected = selectedDrawingId === d.id;

        ctx.strokeStyle = d.color;
        ctx.fillStyle = d.color;
        ctx.lineWidth = isSelected ? d.lineWidth + 1 : d.lineWidth;
        if (d.lineStyle === 'dashed') ctx.setLineDash([6, 6]);
        else if (d.lineStyle === 'dotted') ctx.setLineDash([2, 4]);
        else ctx.setLineDash([]);

        if (d.type === 'trendline' || d.type === 'ray' || d.type === 'info_line') {
          if (d.points.length >= 2) {
            const p1 = d.points[0];
            const p2 = d.points[1];
            // Find x positions based on timestamp
            const p1Idx = processedCandles.findIndex((c) => c.time >= p1.time);
            const p2Idx = processedCandles.findIndex((c) => c.time >= p2.time);
            const x1 = indexToX(p1Idx >= 0 ? p1Idx : 0);
            const y1 = priceToY(p1.price);
            const x2 = indexToX(p2Idx >= 0 ? p2Idx : processedCandles.length - 1);
            const y2 = priceToY(p2.price);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Handles
            [
              [x1, y1],
              [x2, y2],
            ].forEach(([hx, hy]) => {
              ctx.beginPath();
              ctx.arc(hx, hy, 4, 0, Math.PI * 2);
              ctx.fillStyle = '#2962ff';
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            });
          }
        } else if (d.type === 'horizontal_line') {
          if (d.points.length >= 1) {
            const y = priceToY(d.points[0].price);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(chartWidth, y);
            ctx.stroke();

            // Right price tag
            ctx.fillStyle = d.color;
            ctx.fillRect(chartWidth, y - 9, rightScaleWidth, 18);
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px sans-serif';
            ctx.fillText(d.points[0].price.toFixed(symbol.digits), chartWidth + 6, y);
          }
        } else if (d.type === 'fib_retracement') {
          if (d.points.length >= 2) {
            const p1 = d.points[0];
            const p2 = d.points[1];
            const highP = Math.max(p1.price, p2.price);
            const lowP = Math.min(p1.price, p2.price);
            const diff = highP - lowP;

            const levels = [
              { lvl: 0.0, color: '#787b86' },
              { lvl: 0.236, color: '#f23645' },
              { lvl: 0.382, color: '#ff9800' },
              { lvl: 0.5, color: '#089981' },
              { lvl: 0.618, color: '#2962ff' },
              { lvl: 0.786, color: '#9c27b0' },
              { lvl: 1.0, color: '#787b86' },
            ];

            levels.forEach((l) => {
              const price = highP - diff * l.lvl;
              const y = priceToY(price);

              ctx.strokeStyle = l.color;
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(chartWidth, y);
              ctx.stroke();

              ctx.fillStyle = l.color;
              ctx.font = '10px sans-serif';
              ctx.fillText(`${l.lvl} (${price.toFixed(symbol.digits)})`, 10, y - 3);
            });
          }
        } else if (d.type === 'long_position' || d.type === 'short_position') {
          if (d.points.length >= 1) {
            const entryPrice = d.points[0].price;
            const pIdx = processedCandles.findIndex((c) => c.time >= d.points[0].time);
            const startX = indexToX(pIdx >= 0 ? pIdx : 0);
            const boxWidth = Math.min(chartWidth - startX, 220);

            const isLong = d.type === 'long_position';
            const targetPrice = isLong ? entryPrice * 1.045 : entryPrice * 0.955;
            const stopPrice = isLong ? entryPrice * 0.98 : entryPrice * 1.02;

            const entryY = priceToY(entryPrice);
            const targetY = priceToY(targetPrice);
            const stopY = priceToY(stopPrice);

            // Target Zone (Green)
            ctx.fillStyle = 'rgba(8, 153, 129, 0.2)';
            ctx.fillRect(startX, Math.min(entryY, targetY), boxWidth, Math.abs(targetY - entryY));

            // Stop Zone (Red)
            ctx.fillStyle = 'rgba(242, 54, 69, 0.2)';
            ctx.fillRect(startX, Math.min(entryY, stopY), boxWidth, Math.abs(stopY - entryY));

            // Entry line
            ctx.strokeStyle = '#787b86';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(startX, entryY);
            ctx.lineTo(startX + boxWidth, entryY);
            ctx.stroke();

            // Label
            ctx.fillStyle = isDark ? '#ffffff' : '#131722';
            ctx.font = 'bold 10px sans-serif';
            const rr = Math.abs((targetPrice - entryPrice) / (entryPrice - stopPrice)).toFixed(2);
            ctx.fillText(`Target: +4.5% | Stop: -2.0% | R:R ${rr}`, startX + 6, entryY - 6);
          }
        } else if (d.type === 'rectangle') {
          if (d.points.length >= 2) {
            const p1Idx = processedCandles.findIndex((c) => c.time >= d.points[0].time);
            const p2Idx = processedCandles.findIndex((c) => c.time >= d.points[1].time);
            const x1 = indexToX(p1Idx >= 0 ? p1Idx : 0);
            const y1 = priceToY(d.points[0].price);
            const x2 = indexToX(p2Idx >= 0 ? p2Idx : processedCandles.length - 1);
            const y2 = priceToY(d.points[1].price);

            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            const rw = Math.abs(x2 - x1);
            const rh = Math.abs(y2 - y1);

            ctx.fillStyle = 'rgba(41, 98, 255, 0.15)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = d.color;
            ctx.strokeRect(rx, ry, rw, rh);
          }
        } else if (d.type === 'measure') {
          if (d.points.length >= 2) {
            const p1Idx = processedCandles.findIndex((c) => c.time >= d.points[0].time);
            const p2Idx = processedCandles.findIndex((c) => c.time >= d.points[1].time);
            const x1 = indexToX(p1Idx >= 0 ? p1Idx : 0);
            const y1 = priceToY(d.points[0].price);
            const x2 = indexToX(p2Idx >= 0 ? p2Idx : processedCandles.length - 1);
            const y2 = priceToY(d.points[1].price);

            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            const rw = Math.abs(x2 - x1);
            const rh = Math.abs(y2 - y1);

            const priceDiff = d.points[1].price - d.points[0].price;
            const pctDiff = (priceDiff / d.points[0].price) * 100;
            const bars = Math.abs(p2Idx - p1Idx);

            ctx.fillStyle = 'rgba(41, 98, 255, 0.2)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#2962ff';
            ctx.strokeRect(rx, ry, rw, rh);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(rx + rw / 2 - 60, ry + rh / 2 - 12, 120, 24);
            ctx.fillStyle = '#131722';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(
              `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(symbol.digits)} (${pctDiff.toFixed(2)}%)`,
              rx + rw / 2,
              ry + rh / 2
            );
          }
        }
      }
    }

    // 9. Render Crosshair & Tracking Badges
    if (mousePos && mousePos.x <= chartWidth && mousePos.y <= height - bottomScaleHeight) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isDark ? '#787b86' : '#787b86';
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height - bottomScaleHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(chartWidth, mousePos.y);
      ctx.stroke();

      ctx.setLineDash([]);

      // Right Scale Hover Badge (Price)
      const hoverPrice = metrics.yToPrice(mousePos.y);
      ctx.fillStyle = isDark ? '#2a2e39' : '#1e222d';
      ctx.fillRect(chartWidth, mousePos.y - 10, rightScaleWidth, 20);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        hoverPrice.toLocaleString(undefined, {
          minimumFractionDigits: symbol.digits,
          maximumFractionDigits: symbol.digits,
        }),
        chartWidth + 6,
        mousePos.y
      );

      // Bottom Scale Hover Badge (Time)
      if (hoveredCandleIndex !== null && processedCandles[hoveredCandleIndex]) {
        const hc = processedCandles[hoveredCandleIndex];
        const date = new Date(hc.time * 1000);
        const timeStr = date.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        ctx.fillStyle = isDark ? '#2a2e39' : '#1e222d';
        ctx.fillRect(mousePos.x - 50, height - bottomScaleHeight, 100, bottomScaleHeight);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeStr, mousePos.x, height - bottomScaleHeight / 2);
      }
    }

    // 10. Draw Chart Border Dividers
    ctx.strokeStyle = isDark ? '#2a2e39' : '#e0e3eb';
    ctx.lineWidth = 1;
    // Right Scale separator
    ctx.beginPath();
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, height);
    ctx.stroke();

    // Bottom Scale separator
    ctx.beginPath();
    ctx.moveTo(0, height - bottomScaleHeight);
    ctx.lineTo(width, height - bottomScaleHeight);
    ctx.stroke();

    ctx.restore();
  }, [
    getRenderMetrics,
    isDark,
    chartType,
    processedCandles,
    timeframe,
    calculatedIndicators,
    subPanes,
    symbol.digits,
    hideAll,
    currentDrawing,
    drawings,
    selectedDrawingId,
    mousePos,
    hoveredCandleIndex,
  ]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      drawChart();
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [drawChart]);

  // Re-render when dependencies change
  useEffect(() => {
    drawChart();
  }, [drawChart]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const metrics = getRenderMetrics();
    if (!metrics) return;

    // Check if clicking Right Price Scale (Y-zoom)
    if (x > metrics.chartWidth) {
      isScalingPriceRef.current = true;
      dragStartPosRef.current = { x, y };
      return;
    }

    // Check if clicking Bottom Time Scale (X-zoom)
    if (y > metrics.height - bottomScaleHeight) {
      isScalingTimeRef.current = true;
      dragStartPosRef.current = { x, y };
      return;
    }

    // Drawing tool mode
    if (activeTool !== 'cursor' && activeTool !== 'crosshair' && activeTool !== 'dot' && activeTool !== 'eraser') {
      const pIndex = metrics.xToIndex(x);
      const c = processedCandles[pIndex];
      const snappedPrice = magnetMode && c ? c.close : metrics.yToPrice(y);
      const time = c ? c.time : Date.now() / 1000;

      const newPoint: Point = { time, price: snappedPrice };

      if (activeTool === 'horizontal_line') {
        const newD: Drawing = {
          id: `draw-${Date.now()}`,
          type: 'horizontal_line',
          points: [newPoint],
          color: '#2962ff',
          lineWidth: 1.5,
          visible: true,
          locked: false,
        };
        onUpdateDrawings([...drawings, newD]);
        setSelectedDrawingId(newD.id);
        onToolUsed?.();
        return;
      }

      if (!currentDrawing) {
        // Start drawing
        const newD: Drawing = {
          id: `draw-${Date.now()}`,
          type: activeTool,
          points: [newPoint, newPoint],
          color: '#2962ff',
          lineWidth: 1.5,
          visible: true,
          locked: false,
        };
        setCurrentDrawing(newD);
      } else {
        // Finish drawing
        const finalD: Drawing = {
          ...currentDrawing,
          points: [currentDrawing.points[0], newPoint],
        };
        onUpdateDrawings([...drawings, finalD]);
        setSelectedDrawingId(finalD.id);
        setCurrentDrawing(null);
        onToolUsed?.();
      }
      return;
    }

    // Eraser mode
    if (activeTool === 'eraser') {
      // Clear clicked drawing
      return;
    }

    // Default: Pan Chart
    isDraggingRef.current = true;
    dragStartPosRef.current = { x, y };
    dragStartOffsetRef.current = scrollOffset;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    const metrics = getRenderMetrics();
    if (!metrics) return;

    const idx = metrics.xToIndex(x);
    setHoveredCandleIndex(idx);

    // Scaling Price Scale
    if (isScalingPriceRef.current) {
      const deltaY = y - dragStartPosRef.current.y;
      setPriceScaleRatio((prev) => Math.max(0.2, Math.min(5, prev + deltaY * 0.005)));
      dragStartPosRef.current = { x, y };
      return;
    }

    // Scaling Time Scale
    if (isScalingTimeRef.current) {
      const deltaX = x - dragStartPosRef.current.x;
      setCandleWidth((prev) => Math.max(2, Math.min(40, prev + deltaX * 0.05)));
      dragStartPosRef.current = { x, y };
      return;
    }

    // Updating drawing in progress
    if (currentDrawing) {
      const c = processedCandles[idx];
      const snappedPrice = magnetMode && c ? c.close : metrics.yToPrice(y);
      const time = c ? c.time : Date.now() / 1000;
      setCurrentDrawing({
        ...currentDrawing,
        points: [currentDrawing.points[0], { time, price: snappedPrice }],
      });
      return;
    }

    // Panning
    if (isDraggingRef.current) {
      const deltaX = x - dragStartPosRef.current.x;
      const candlesMoved = deltaX / metrics.totalCandleSlot;
      setScrollOffset(Math.max(-10, dragStartOffsetRef.current + candlesMoved));
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    isScalingPriceRef.current = false;
    isScalingTimeRef.current = false;
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoveredCandleIndex(null);
    isDraggingRef.current = false;
    isScalingPriceRef.current = false;
    isScalingTimeRef.current = false;
  };

  // Zoom with Wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setCandleWidth((prev) => Math.max(2, Math.min(45, prev * zoomFactor)));
    setCandleGap((prev) => Math.max(1, Math.min(10, prev * zoomFactor)));
  };

  // Double click price scale to reset
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const metrics = getRenderMetrics();
    if (metrics && x > metrics.chartWidth) {
      setPriceScaleRatio(1);
      setPriceRangePadding(0.1);
    }
  };

  const activeCandle =
    hoveredCandleIndex !== null && processedCandles[hoveredCandleIndex]
      ? processedCandles[hoveredCandleIndex]
      : processedCandles[processedCandles.length - 1] || null;

  const prevCandle =
    hoveredCandleIndex !== null && hoveredCandleIndex > 0
      ? processedCandles[hoveredCandleIndex - 1]
      : processedCandles[processedCandles.length - 2] || null;

  const activeDrawing = drawings.find((d) => d.id === selectedDrawingId);

  return (
    <div
      ref={containerRef}
      id="trading-chart-container"
      className="relative flex-1 h-full w-full overflow-hidden select-none cursor-crosshair"
    >
      {/* Chart HUD Status Line */}
      <ChartHUD
        symbol={symbol}
        timeframe={timeframe}
        activeCandle={activeCandle}
        prevCandle={prevCandle}
        indicators={indicators}
        onToggleIndicator={onToggleIndicator}
        onRemoveIndicator={onRemoveIndicator}
        onOpenOrderModal={onOpenOrderModal}
        theme={theme}
        onOpenSymbolSearch={onOpenSymbolSearch}
      />

      {/* Floating Active Drawing Context Bar */}
      {activeDrawing && (
        <ActiveDrawingToolbar
          activeDrawing={activeDrawing}
          onUpdateDrawing={(updated) => {
            onUpdateDrawings(drawings.map((d) => (d.id === updated.id ? updated : d)));
          }}
          onDeleteDrawing={(id) => {
            onUpdateDrawings(drawings.filter((d) => d.id !== id));
            setSelectedDrawingId(null);
          }}
          onDuplicateDrawing={(d) => {
            const clone: Drawing = {
              ...d,
              id: `draw-${Date.now()}`,
              points: d.points.map((p) => ({ time: p.time, price: p.price * 1.01 })),
            };
            onUpdateDrawings([...drawings, clone]);
          }}
          theme={theme}
        />
      )}

      {/* HTML5 60fps Canvas */}
      <canvas
        ref={canvasRef}
        id="trading-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        className="block w-full h-full"
      />
    </div>
  );
};
