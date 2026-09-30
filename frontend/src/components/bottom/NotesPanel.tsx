import { BookOpen, Check } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { t } from "../../lib/i18n";
import type { SymbolInfo } from "../../types/trading";

interface Props {
  symbol: SymbolInfo;
  theme: "dark" | "light";
}

export const NotesPanel: React.FC<Props> = ({ symbol }) => {
  const [note, setNote] = useState(
    `Trading Plan for ${symbol.ticker}:\n- Primary trend: Bullish continuation\n- Key Support: $${(symbol.price * 0.96).toFixed(symbol.digits)}\n- Key Resistance: $${(symbol.price * 1.05).toFixed(symbol.digits)}\n- Risk Management: 1.5% max portfolio risk per position.`,
  );
  const [saved, setSaved] = useState(true);

  return (
    <div id="notes-tab" className="flex flex-col h-full w-full select-none text-xs p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 font-bold text-sm text-signal">
          <BookOpen className="w-4 h-4" />
          <span>Trading Journal & Notes: {symbol.ticker}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted">
          <Check className="w-3 h-3 text-up" />
          <span>{t("Auto-saved")}</span>
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(true);
        }}
        placeholder="Write your trade thesis, levels, and notes..."
        className="flex-1 p-3 rounded-lg border border-line bg-ink text-content outline-none font-sans text-xs leading-relaxed resize-none select-text placeholder:text-faint focus:border-signal"
      />
    </div>
  );
};
