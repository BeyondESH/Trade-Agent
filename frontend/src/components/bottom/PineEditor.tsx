import React, { useState } from 'react';
import { SAMPLE_PINE_SCRIPTS } from '../../utils/pineEngine';
import { Play, Save, FileCode, CheckCircle2, ChevronDown } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  onRunStrategy: (scriptCode: string, scriptName: string) => void;
  theme: 'dark' | 'light';
}

export const PineEditor: React.FC<Props> = ({ onRunStrategy, theme }) => {
  const [selectedSample, setSelectedSample] = useState(0);
  const [code, setCode] = useState(SAMPLE_PINE_SCRIPTS[0].code);
  const [statusMsg, setStatusMsg] = useState<string | null>('Pine Script v5 compiler ready.');
  const isDark = theme === 'dark';

  const handleSelectSample = (idx: number) => {
    setSelectedSample(idx);
    setCode(SAMPLE_PINE_SCRIPTS[idx].code);
  };

  const handleApplyToChart = () => {
    setStatusMsg('Compiling strategy & executing backtest engine...');
    setTimeout(() => {
      onRunStrategy(code, SAMPLE_PINE_SCRIPTS[selectedSample].name);
      setStatusMsg('Compiled successfully. Strategy added to chart.');
    }, 300);
  };

  return (
    <div id="pine-editor-tab" className="flex flex-col h-full w-full select-none text-xs">
      {/* Top Action Bar */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39] bg-[#1e222d]' : 'border-[#e0e3eb] bg-[#f0f3fa]'}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 font-bold text-xs text-[#2962ff]">
            <FileCode className="w-3.5 h-3.5" />
            <span>{t('Pine Editor v5')}</span>
          </div>

          <div className="h-4 w-[1px] bg-gray-500/20" />

          {/* Sample Scripts Selector */}
          <select
            value={selectedSample}
            onChange={(e) => handleSelectSample(Number(e.target.value))}
            className={`px-2 py-1 rounded text-xs outline-none border cursor-pointer ${
              isDark ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
            }`}
          >
            {SAMPLE_PINE_SCRIPTS.map((s, idx) => (
              <option key={idx} value={idx}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="pine-save-btn"
            onClick={() => setStatusMsg('Script saved to cloud profile.')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors ${
              isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-white'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('Save')}</span>
          </button>

          <button
            id="pine-add-to-chart-btn"
            onClick={handleApplyToChart}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#2962ff] text-white font-semibold hover:bg-[#1e53e5] shadow-xs transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{t('Add to Chart')}</span>
          </button>
        </div>
      </div>

      {/* Code Textarea with line numbers */}
      <div className="flex-1 flex overflow-hidden font-mono text-xs">
        {/* Line Numbers */}
        <div className={`w-10 py-2.5 flex flex-col items-center select-none text-gray-500 border-r ${isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-gray-50 border-[#e0e3eb]'}`}>
          {code.split('\n').map((_, i) => (
            <div key={i} className="leading-5 text-[11px]">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Editor Area */}
        <textarea
          id="pine-script-code-editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className={`flex-1 p-2.5 outline-none resize-none leading-5 text-xs font-mono select-text ${
            isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-white text-[#131722]'
          }`}
        />
      </div>

      {/* Status Bar */}
      <div className={`px-3 py-1 border-t text-[11px] flex items-center gap-2 ${isDark ? 'border-[#2a2e39] bg-[#1e222d] text-gray-400' : 'border-[#e0e3eb] bg-[#f0f3fa] text-gray-600'}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-[#089981]" />
        <span>{statusMsg}</span>
      </div>
    </div>
  );
};
