import React from 'react';
import { NewsItem } from '../../types/trading';
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  news: NewsItem[];
  theme: 'dark' | 'light';
}

export const NewsPanel: React.FC<Props> = ({ news, theme }) => {
  const isDark = theme === 'dark';

  return (
    <div id="news-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Newspaper className="w-4 h-4 text-[#2962ff]" />
          <span>Market Headlines</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">Live Stream</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-500/10 no-scrollbar">
        {news.map((item) => (
          <div
            key={item.id}
            className={`p-3 flex flex-col gap-1.5 transition-colors ${
              isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span className="font-semibold text-[#2962ff]">{item.source}</span>
              <span>{item.time}</span>
            </div>

            <div className="font-semibold text-xs leading-snug">
              {item.title}
            </div>

            <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
              {item.summary}
            </p>

            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  item.sentiment === 'bullish'
                    ? 'bg-[#089981]/20 text-[#089981]'
                    : item.sentiment === 'bearish'
                    ? 'bg-[#f23645]/20 text-[#f23645]'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {item.sentiment === 'bullish' ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : item.sentiment === 'bearish' ? (
                  <TrendingDown className="w-2.5 h-2.5" />
                ) : (
                  <Minus className="w-2.5 h-2.5" />
                )}
                {item.sentiment}
              </span>

              {item.relatedSymbols.map((s) => (
                <span
                  key={s}
                  className="text-[9px] font-mono font-medium px-1 py-0.5 rounded bg-gray-500/10 text-gray-400"
                >
                  ${s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
