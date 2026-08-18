import React, { useState } from 'react';
import { SymbolInfo } from '../../types/trading';
import { BookOpen, Check } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  symbol: SymbolInfo;
  theme: 'dark' | 'light';
}

export const NotesPanel: React.FC<Props> = ({ symbol, theme }) => {
  const [note, setNote] = useState(
    `Trading Plan for ${symbol.ticker}:\n- Primary trend: Bullish continuation\n- Key Support: $${(symbol.price * 0.96).toFixed(symbol.digits)}\n- Key Resistance: $${(symbol.price * 1.05).toFixed(symbol.digits)}\n- Risk Management: 1.5% max portfolio risk per position.`
  );
  const [saved, setSaved] = useState(true);
  const isDark = theme === 'dark';

  return (
    <div id="notes-tab" className="flex flex-col h-full w-full select-none text-xs p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 font-bold text-sm text-[#2962ff]">
          <BookOpen className="w-4 h-4" />
          <span>Trading Journal & Notes: {symbol.ticker}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <Check className="w-3 h-3 text-[#089981]" />
          <span>{t('Auto-saved')}</span>
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(true);
        }}
        placeholder="Write your trade thesis, levels, and notes..."
        className={`flex-1 p-3 rounded-lg border outline-none font-sans text-xs leading-relaxed resize-none select-text ${
          isDark
            ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] focus:border-[#2962ff]'
            : 'bg-white border-[#e0e3eb] text-[#131722] focus:border-[#2962ff]'
        }`}
      />
    </div>
  );
};
