import React, { useState } from 'react';
import { CommunityIdea, ThemeMode } from '../../types/trading';
import { COMMUNITY_IDEAS_DATA } from '../../data/marketData';
import { t } from '../../lib/i18n';
import {
  Users,
  ThumbsUp,
  MessageSquare,
  Share2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Filter,
  Flame,
  Award,
} from 'lucide-react';

interface Props {
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

export const CommunityIdeasView: React.FC<Props> = ({ onOpenChartWithTicker, theme }) => {
  const [ideas, setIdeas] = useState<CommunityIdea[]>(COMMUNITY_IDEAS_DATA);
  const [activeFilter, setActiveFilter] = useState<'all' | 'crypto' | 'stocks' | 'forex'>('all');
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const isDark = theme === 'dark';

  const handleLike = (id: string) => {
    setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    setIdeas((prev) =>
      prev.map((idea) => {
        if (idea.id === id) {
          const isLiked = likedIds[id];
          return { ...idea, likes: isLiked ? idea.likes - 1 : idea.likes + 1 };
        }
        return idea;
      })
    );
  };

  return (
    <div
      id="community-ideas-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans flex flex-col ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-[#9c27b0]" />
            <span>{t('Community Trade Ideas & Market Analysis')}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Discover trading strategies, harmonic patterns, and price action insights published by top global traders.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-gray-500/20 text-xs font-semibold">
          {(['all', 'crypto', 'stocks', 'forex'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1 rounded-md uppercase tracking-wider transition-colors ${
                activeFilter === f
                  ? 'bg-[#2962ff] text-white shadow-xs'
                  : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Ideas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ideas.map((idea) => {
          const isLong = idea.sentiment === 'LONG';
          const isLiked = likedIds[idea.id];

          return (
            <div
              key={idea.id}
              className={`p-4 rounded-xl border flex flex-col justify-between transition-all hover:border-[#2962ff] ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
              }`}
            >
              <div>
                {/* Author & Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={idea.avatar}
                      alt={idea.author}
                      className="w-9 h-9 rounded-full object-cover border border-gray-500/30"
                    />
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span>{idea.author}</span>
                        <Award className="w-3 h-3 text-[#ff9800]" />
                      </div>
                      <div className="text-[10px] text-gray-400">{idea.authorRank} • {idea.time}</div>
                    </div>
                  </div>

                  {/* Sentiment Badge & Timeframe */}
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-500/20 text-gray-300">
                      {idea.timeframe}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                        isLong ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'
                      }`}
                    >
                      {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span>{idea.sentiment}</span>
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3
                  onClick={() => onOpenChartWithTicker(idea.symbol)}
                  className="font-bold text-sm text-white hover:text-[#2962ff] cursor-pointer mb-2 leading-snug transition-colors"
                >
                  {idea.title}
                </h3>

                {/* Description */}
                <p className="text-xs text-gray-300 leading-relaxed line-clamp-3 mb-3">
                  {idea.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {idea.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded text-[10px] bg-gray-500/10 text-gray-400 font-medium"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-gray-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-4 text-gray-400">
                  <button
                    onClick={() => handleLike(idea.id)}
                    className={`flex items-center gap-1 transition-colors ${
                      isLiked ? 'text-[#2962ff] font-bold' : 'hover:text-white'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>{idea.likes}</span>
                  </button>

                  <button className="flex items-center gap-1 hover:text-white transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{idea.comments}</span>
                  </button>

                  <button className="flex items-center gap-1 hover:text-white transition-colors">
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => onOpenChartWithTicker(idea.symbol)}
                  className="px-3 py-1 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] font-semibold flex items-center gap-1 shadow-xs transition-colors"
                >
                  <span>Open {idea.symbol} Chart</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
