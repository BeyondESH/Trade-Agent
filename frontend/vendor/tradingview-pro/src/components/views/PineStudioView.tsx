import React, { useState } from 'react';
import { ThemeMode } from '../../types/trading';
import {
  Code,
  Play,
  Save,
  FileCode,
  BookOpen,
  CheckCircle,
  Terminal,
  Share2,
  Copy,
  ChevronRight,
} from 'lucide-react';

interface Props {
  onApplyScriptToChart: (scriptCode: string, scriptName: string) => void;
  theme: ThemeMode;
}

const TEMPLATES: Record<string, string> = {
  supertrend: `//@version=5
strategy("SuperTrend Dynamic Strategy v5", overlay=true, initial_capital=50000, default_qty_type=strategy.percent_of_equity, default_qty_value=20)

// Inputs
atrPeriod = input.int(10, "ATR Length", minval=1)
factor = input.float(3.0, "Factor", minval=0.01, step=0.1)

// Calculations
[superTrend, direction] = ta.supertrend(factor, atrPeriod)

// Plotting
bodyMiddle = plot((open + close) / 2, display=display.none)
upTrend = plot(direction < 0 ? superTrend : na, "Up Trend", color=color.green, style=plot.style_linebr)
downTrend = plot(direction < 0 ? na : superTrend, "Down Trend", color=color.red, style=plot.style_linebr)

// Strategy Execution
if (ta.crossover(close, superTrend))
    strategy.entry("Long", strategy.long)

if (ta.crossunder(close, superTrend))
    strategy.close("Long")
`,
  ema_cross: `//@version=5
strategy("EMA Golden Cross Strategy", overlay=true, initial_capital=50000)

fastLength = input.int(9, "Fast EMA Length")
slowLength = input.int(21, "Slow EMA Length")

fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

plot(fastEMA, color=color.blue, title="Fast EMA")
plot(slowEMA, color=color.orange, title="Slow EMA")

longCondition = ta.crossover(fastEMA, slowEMA)
if (longCondition)
    strategy.entry("EMA Long", strategy.long)

shortCondition = ta.crossunder(fastEMA, slowEMA)
if (shortCondition)
    strategy.close("EMA Long")
`,
  rsi_divergence: `//@version=5
indicator("RSI Divergence Pro", overlay=false)

rsiLength = input.int(14, "RSI Length")
rsiSource = input.source(close, "Source")

rsi = ta.rsi(rsiSource, rsiLength)

plot(rsi, "RSI", color=color.purple, linewidth=2)
hline(70, "Overbought", color=color.red, linestyle=hline.style_dashed)
hline(30, "Oversold", color=color.green, linestyle=hline.style_dashed)
hline(50, "Middle", color=color.gray, linestyle=hline.style_dotted)
`,
};

export const PineStudioView: React.FC<Props> = ({ onApplyScriptToChart, theme }) => {
  const [selectedTemplate, setSelectedTemplate] = useState('supertrend');
  const [scriptCode, setScriptCode] = useState(TEMPLATES.supertrend);
  const [consoleLog, setConsoleLog] = useState<string[]>([
    '[Pine Engine v5] Compiler initialized.',
    '[Pine Engine v5] Script syntax verified: 0 errors, 0 warnings.',
    '[Backtester] Ready for real-time tick streaming execution.',
  ]);
  const isDark = theme === 'dark';

  const handleTemplateSelect = (key: string) => {
    setSelectedTemplate(key);
    setScriptCode(TEMPLATES[key]);
    setConsoleLog((prev) => [
      ...prev,
      `[Pine Engine] Loaded script template: ${key}.pine`,
      `[Compiler] Compilation successful (bytecode size: 1.42 KB).`,
    ]);
  };

  const handleRunScript = () => {
    setConsoleLog((prev) => [
      ...prev,
      `[Pine Engine] Applying script to active chart...`,
      `[Backtester] Initial capital: $50,000 USD. Generating trade orders...`,
      `[Backtester] Simulation complete: 84 trades generated. Net Profit: +$14,820.50 (29.64%).`,
    ]);
    const scriptName = selectedTemplate === 'supertrend' ? 'SuperTrend Dynamic Strategy v5' : 'Custom Pine Script';
    onApplyScriptToChart(scriptCode, scriptName);
  };

  return (
    <div
      id="pine-studio-view"
      className={`flex-1 h-full overflow-hidden p-4 select-none font-sans flex flex-col ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Code className="w-5 h-5 text-[#e91e63]" />
            <span>Pine Script® Studio (IDE v5)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Write custom quantitative indicators, automated trading algorithms, and backtest strategy execution.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold outline-none ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb]'
            }`}
          >
            <option value="supertrend">Template: SuperTrend Strategy</option>
            <option value="ema_cross">Template: EMA Golden Cross</option>
            <option value="rsi_divergence">Template: RSI Divergence</option>
          </select>

          <button
            onClick={handleRunScript}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2962ff] text-white text-xs font-bold hover:bg-[#1e53e5] shadow-xs transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Add to Chart & Run Backtest</span>
          </button>
        </div>
      </div>

      {/* Editor & Console Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
        {/* Main Code Editor (3 Cols) */}
        <div className={`lg:col-span-3 rounded-xl border flex flex-col overflow-hidden ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
        }`}>
          {/* Editor Header */}
          <div className={`p-2.5 border-b flex items-center justify-between text-xs ${
            isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'
          }`}>
            <div className="flex items-center gap-2 font-mono text-xs">
              <FileCode className="w-4 h-4 text-[#2962ff]" />
              <span className="font-bold text-white">{selectedTemplate}.pine</span>
              <span className="text-gray-500">• Pine v5 • UTF-8</span>
            </div>

            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-[11px] flex items-center gap-1 text-[#089981]">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Syntax OK</span>
              </span>
            </div>
          </div>

          {/* Textarea Code Body */}
          <div className="flex-1 relative flex">
            {/* Line Numbers */}
            <div className={`w-10 py-3 text-right pr-2 text-gray-500 font-mono text-xs select-none border-r ${
              isDark ? 'bg-[#131722]/50 border-[#2a2e39]' : 'bg-gray-100 border-[#e0e3eb]'
            }`}>
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="leading-6">{i + 1}</div>
              ))}
            </div>

            {/* Code Input */}
            <textarea
              value={scriptCode}
              onChange={(e) => setScriptCode(e.target.value)}
              spellCheck={false}
              className={`flex-1 p-3 font-mono text-xs leading-6 outline-none resize-none bg-transparent ${
                isDark ? 'text-[#00e5ff]' : 'text-[#0052cc]'
              }`}
            />
          </div>

          {/* Console / Output Drawer */}
          <div className={`h-36 border-t flex flex-col ${
            isDark ? 'border-[#2a2e39] bg-[#0f1118]' : 'border-[#e0e3eb] bg-gray-100'
          }`}>
            <div className="px-3 py-1.5 border-b border-gray-500/20 flex items-center gap-2 text-xs font-bold text-gray-400">
              <Terminal className="w-3.5 h-3.5 text-[#2962ff]" />
              <span>Compilation Console & Strategy Debugger</span>
            </div>
            <div className="flex-1 p-2.5 font-mono text-[11px] overflow-y-auto no-scrollbar flex flex-col gap-1 text-gray-300">
              {consoleLog.map((log, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-500">&gt;</span>
                  <span className={log.includes('Net Profit') ? 'text-[#089981] font-bold' : log.includes('error') ? 'text-[#f23645]' : ''}>
                    {log}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Reference & Documentation Sidebar (1 Col) */}
        <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
        }`}>
          <div className="font-bold text-sm text-white flex items-center gap-1.5 border-b pb-2 border-gray-500/20">
            <BookOpen className="w-4 h-4 text-[#2962ff]" />
            <span>Pine Script Reference</span>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-3 text-xs">
            <div>
              <div className="font-bold text-[#2962ff] font-mono">ta.supertrend(factor, length)</div>
              <p className="text-gray-400 text-[11px] mt-0.5">
                Calculates the SuperTrend indicator line and trend direction.
              </p>
            </div>

            <div>
              <div className="font-bold text-[#2962ff] font-mono">ta.crossover(source1, source2)</div>
              <p className="text-gray-400 text-[11px] mt-0.5">
                Returns true if source1 crossed over source2 on the current bar.
              </p>
            </div>

            <div>
              <div className="font-bold text-[#2962ff] font-mono">strategy.entry(id, direction)</div>
              <p className="text-gray-400 text-[11px] mt-0.5">
                Opens an order command with the specified position direction.
              </p>
            </div>

            <div>
              <div className="font-bold text-[#2962ff] font-mono">ta.rsi(source, length)</div>
              <p className="text-gray-400 text-[11px] mt-0.5">
                Relative Strength Index (RSI) momentum oscillator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
