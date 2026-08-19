import React, { useEffect, useState } from 'react';
import { Newspaper, ExternalLink, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import {
  NEWSFLASH_TYPES,
  fetchNewsflash,
  formatRelativeTime,
  groupNewsByDate,
  type NewsflashType,
} from '../../lib/newsfeed';
import type { NewsItem } from '../../types/trading';
import { t } from '../../lib/i18n';

interface Props {
  news?: NewsItem[];
  theme: 'dark' | 'light';
}

export const NewsPanel: React.FC<Props> = ({ theme }) => {
  const isDark = theme === 'dark';
  const [type, setType] = useState<NewsflashType>('all');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catExpanded, setCatExpanded] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchNewsflash(type)
      .then((rows) => {
        if (alive) setNews(rows);
      })
      .catch((e: Error) => {
        if (alive) {
          setError(e.message);
          setNews([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [type]);

  // Collapse-state chip order: bring the active category to the front if it
  // would otherwise sit beyond the visible slots of the single clipped row.
  const visibleTypes = catExpanded
    ? NEWSFLASH_TYPES
    : [
        ...NEWSFLASH_TYPES.filter((tabs) => tabs.key === type),
        ...NEWSFLASH_TYPES.filter((tabs) => tabs.key !== type),
      ];

  const groups = groupNewsByDate(news);

  return (
    <div id="news-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Newspaper className="w-4 h-4 text-[#2962ff]" />
          <span>{t('Market Headlines')}</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">{t('Live Stream')}</span>
      </div>

      {/* Category tabs */}
      <div className={`flex items-center gap-1 p-1.5 border-b ${catExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'} ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-white'}`}>
        {visibleTypes.map((tabs) => (
          <button
            key={tabs.key}
            onClick={() => setType(tabs.key)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
              type === tabs.key
                ? 'bg-[#2962ff] text-white'
                : isDark
                ? 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
                : 'text-gray-600 hover:text-black hover:bg-[#f0f3fa]'
            }`}
          >
            {tabs.label}
          </button>
        ))}
        <button
          aria-label={catExpanded ? 'Collapse categories' : 'Expand categories'}
          onClick={() => setCatExpanded(!catExpanded)}
          className={`ml-auto px-1.5 py-0.5 rounded text-[#2962ff] hover:bg-[#2962ff]/10 shrink-0 transition-colors`}
        >
          {catExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {loading && <div className="px-3 py-2 text-gray-500">加载中...</div>}
      {error && (
        <div className="px-3 py-2 text-[#f23645]">
          {t('News feed unavailable:')} {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-gray-500/10">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col">
            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 sticky top-0 ${isDark ? 'bg-[#131722]/95' : 'bg-white/95'} backdrop-blur-sm`}>
              {group.label}
              <span className="ml-1 font-mono text-gray-500">({group.items.length})</span>
            </div>
            {group.items.map((item) => (
              <div
                key={item.id}
                className={`px-3 py-2 flex flex-col gap-1 transition-colors group ${
                  isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-end text-[10px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatRelativeTime(item.time)}
                  </span>
                </div>

                <div className="font-semibold text-xs leading-snug line-clamp-2">{item.title}</div>

                <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">{item.summary}</p>

                <a
                  href={`https://m.theblockbeats.info/flash/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#2962ff] hover:underline text-[10px] flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  {t('Full Article')}
                </a>
              </div>
            ))}
          </div>
        ))}
        {!loading && !error && news.length === 0 && (
          <div className="px-3 py-4 text-center text-gray-500">暂无新闻</div>
        )}
      </div>
    </div>
  );
};
