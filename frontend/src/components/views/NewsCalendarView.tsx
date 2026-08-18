import React, { useCallback, useEffect, useState } from 'react';
import { EconomicEvent, ThemeMode } from '../../types/trading';
import { INITIAL_CALENDAR } from '../../data/marketData';
import { NEWSFLASH_TYPES, fetchNewsflash, type NewsflashType } from '../../lib/newsfeed';
import type { NewsItem } from '../../types/trading';
import { t } from '../../lib/i18n';
import {
  Newspaper,
  Calendar,
  ExternalLink,
  Clock,
  Globe,
  AlertCircle,
} from 'lucide-react';

interface Props {
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

export const NewsCalendarView: React.FC<Props> = ({ onOpenChartWithTicker, theme }) => {
  const [activeTab, setActiveTab] = useState<'news' | 'calendar'>('news');
  const [newsType, setNewsType] = useState<NewsflashType>('all');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarImpact, setCalendarImpact] = useState<'all' | 'high' | 'medium'>('all');
  const isDark = theme === 'dark';

  const load = useCallback(async (type: NewsflashType) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchNewsflash(type);
      setNews(rows);
    } catch (e) {
      setError(String(e));
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(newsType);
  }, [newsType, load]);

  const filteredCalendar = INITIAL_CALENDAR.filter(
    (c) => calendarImpact === 'all' || c.impact === calendarImpact
  );

  return (
    <div
      id="news-calendar-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans flex flex-col ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-[#4caf50]" />
            <span>{t('BlockBeats News & Economic Calendar')}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t('Real-time crypto newsflash (BlockBeats), central bank decisions, and earnings releases.')}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-black/20 p-1 rounded-lg border border-gray-500/20 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('news')}
            className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'news'
                ? 'bg-[#2962ff] text-white shadow-xs'
                : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>{t('Market News Wire')}</span>
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'calendar'
                ? 'bg-[#2962ff] text-white shadow-xs'
                : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{t('Economic Calendar')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'news' ? (
        /* News Wire View — one tab per BlockBeats newsflash endpoint */
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {NEWSFLASH_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setNewsType(t.key)}
                className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  newsType === t.key
                    ? 'bg-[#2962ff] border-[#2962ff] text-white'
                    : isDark
                    ? 'bg-[#1e222d] border-[#2a2e39] text-gray-400 hover:text-white'
                    : 'bg-white border-[#e0e3eb] text-gray-600 hover:text-black'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && <div className="text-xs text-gray-400">加载中...</div>}
          {error && (
            <div className="flex items-center gap-2 text-xs text-[#f23645]">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>新闻获取失败: {error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {news.map((n) => (
              <div
                key={n.id}
                className={`p-4 rounded-xl border flex flex-col gap-2 transition-all hover:border-[#2962ff] ${
                  isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#2962ff]">{n.source}</span>
                    <span className="text-gray-500 text-[10px]">• {n.time}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/20 text-gray-400">
                    {newsType}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-white leading-snug">{n.title}</h3>
                <p className="text-xs text-gray-300 leading-relaxed line-clamp-4">{n.summary}</p>

                <div className="flex items-center justify-between pt-2 border-t border-gray-500/20 mt-1">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span className="text-[11px]">{n.time}</span>
                  </div>
                  <a
                    href={`https://m.theblockbeats.info/flash/${n.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-400 hover:text-white flex items-center gap-1 text-xs"
                  >
                    <Globe className="w-3 h-3" />
                    <span>{t('Full Article')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Economic Calendar View (BlockBeats has no calendar API; stays mock) */
        <div className={`p-4 rounded-xl border flex flex-col gap-3 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
        }`}>
          <div className="flex items-center justify-between pb-2 border-b border-gray-500/20">
            <div className="font-bold text-sm text-white">{t('Global Economic Releases')}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">{t('Impact Filter:')}</span>
              {(['all', 'high', 'medium'] as const).map((imp) => (
                <button
                  key={imp}
                  onClick={() => setCalendarImpact(imp)}
                  className={`px-2.5 py-0.5 rounded font-semibold uppercase text-[10px] ${
                    calendarImpact === imp
                      ? 'bg-[#2962ff] text-white'
                      : 'bg-gray-500/20 text-gray-400 hover:text-white'
                  }`}
                >
                  {imp}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
                  <th className="py-2.5 px-3">{t('Time')}</th>
                  <th className="py-2.5 px-3">{t('Country')}</th>
                  <th className="py-2.5 px-3">{t('Impact')}</th>
                  <th className="py-2.5 px-3">{t('Event')}</th>
                  <th className="py-2.5 px-3">{t('Actual')}</th>
                  <th className="py-2.5 px-3">{t('Forecast')}</th>
                  <th className="py-2.5 px-3">{t('Previous')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-500/10">
                {filteredCalendar.map((item) => (
                  <tr key={item.id} className={isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'}>
                    <td className="py-2.5 px-3 font-sans text-gray-400">{item.time} ({item.date})</td>
                    <td className="py-2.5 px-3 font-bold font-sans text-white">{item.currency}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans ${
                          item.impact === 'high'
                            ? 'bg-[#f23645]/20 text-[#f23645]'
                            : item.impact === 'medium'
                            ? 'bg-[#ff9800]/20 text-[#ff9800]'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {item.impact}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold font-sans text-gray-200">{item.event}</td>
                    <td className="py-2.5 px-3 font-bold text-[#089981]">{item.actual || '-'}</td>
                    <td className="py-2.5 px-3 text-gray-300">{item.forecast || '-'}</td>
                    <td className="py-2.5 px-3 text-gray-400">{item.previous || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
