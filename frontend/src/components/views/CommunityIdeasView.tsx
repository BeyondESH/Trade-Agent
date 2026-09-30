import {
  Award,
  ChevronRight,
  MessageCircle,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useState } from "react";
import { COMMUNITY_IDEAS_DATA } from "../../data/marketData";
import { t } from "../../lib/i18n";
import type { CommunityIdea, ThemeMode } from "../../types/trading";
import { RemoteImage } from "../ui/remote-image";
import { Reveal } from "../ui/reveal";

type IdeaFilter = "all" | "crypto" | "stocks" | "forex";

interface Props {
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

const FILTERS: IdeaFilter[] = ["all", "crypto", "stocks", "forex"];
const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;
const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";

/** Classify a static idea by its instrument so the filter really filters. */
function ideaCategory(symbol: string): "crypto" | "stocks" | "forex" {
  const s = symbol.toUpperCase();
  if (s.includes("USDT")) return "crypto";
  if (s.endsWith("USD")) return "forex";
  return "stocks";
}

/** Segmented filter control: one brass indicator slides to the active tab. */
function FilterSegmented({
  value,
  onChange,
}: {
  value: IdeaFilter;
  onChange: (value: IdeaFilter) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-ink/60 p-0.5">
      {FILTERS.map((filter) => {
        const active = filter === value;
        return (
          <button
            key={filter}
            type="button"
            data-testid={`community-filter-${filter}`}
            onClick={() => onChange(filter)}
            className={`relative flex items-center rounded-md px-3 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors ${
              active ? "text-signal-ink" : "text-muted hover:text-content"
            }`}
          >
            {active && (
              <motion.span
                layoutId="community-filter-indicator"
                className="absolute inset-0 rounded-md bg-signal"
                transition={reduce ? { duration: 0 } : SPRING}
              />
            )}
            <span className="relative z-10">{filter}</span>
          </button>
        );
      })}
    </div>
  );
}

const SentimentBadge: React.FC<{ sentiment: CommunityIdea["sentiment"] }> = ({ sentiment }) => {
  const long = sentiment === "LONG";
  const short = sentiment === "SHORT";
  const cls = long
    ? "bg-up/15 text-up"
    : short
      ? "bg-down/15 text-down"
      : "bg-surface-2 text-muted";
  return (
    <span className={`ta-eyebrow inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${cls}`}>
      {long ? (
        <TrendingUp className="h-3 w-3" />
      ) : short ? (
        <TrendingDown className="h-3 w-3" />
      ) : null}
      {sentiment}
    </span>
  );
};

export const CommunityIdeasView: React.FC<Props> = ({ onOpenChartWithTicker, theme }) => {
  const [ideas, setIdeas] = useState<CommunityIdea[]>(COMMUNITY_IDEAS_DATA);
  const [activeFilter, setActiveFilter] = useState<IdeaFilter>("all");
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  const visibleIdeas = ideas.filter(
    (idea) => activeFilter === "all" || ideaCategory(idea.symbol) === activeFilter,
  );

  const handleLike = (id: string) => {
    setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    setIdeas((prev) =>
      prev.map((idea) => {
        if (idea.id === id) {
          const isLiked = likedIds[id];
          return { ...idea, likes: isLiked ? idea.likes - 1 : idea.likes + 1 };
        }
        return idea;
      }),
    );
  };

  return (
    <div
      id="community-ideas-view"
      className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-ink text-content select-none"
    >
      {/* Sticky header: title + filter segmented control */}
      <header className="ta-glass sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Users className="h-4 w-4 shrink-0 text-signal" />
          <div className="min-w-0">
            <h1 className="ta-display truncate text-base tracking-tight text-content">
              {t("Community Trade Ideas & Market Analysis")}
            </h1>
            <p className="mt-0.5 hidden truncate text-xs text-muted lg:block">
              {t(
                "Discover trading strategies, harmonic patterns, and price action insights published by top global traders.",
              )}
            </p>
          </div>
        </div>
        <FilterSegmented value={activeFilter} onChange={setActiveFilter} />
      </header>

      {/* Analyst notes grid */}
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        {visibleIdeas.map((idea, i) => {
          const isLiked = likedIds[idea.id];

          return (
            <Reveal key={idea.id} delay={Math.min(i, 6)}>
              <motion.article
                data-testid={`community-idea-${idea.id}`}
                whileHover={{ y: -1 }}
                transition={SPRING}
                className={`${PANEL} h-full justify-between p-4 transition-shadow hover:shadow-e2`}
              >
                <div>
                  {/* Author row */}
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <RemoteImage
                        src={idea.avatar}
                        alt={idea.author}
                        className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
                        fallback={
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-2xs font-bold text-muted">
                            {idea.author.slice(0, 1).toUpperCase()}
                          </span>
                        }
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-content">
                          <span className="truncate">{idea.author}</span>
                          <Award className="h-3 w-3 shrink-0 text-signal" />
                        </div>
                        <div className="ta-eyebrow truncate text-faint">{idea.authorRank}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="ta-num rounded border border-line/70 bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-muted">
                        {idea.timeframe}
                      </span>
                      <SentimentBadge sentiment={idea.sentiment} />
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    onClick={() => onOpenChartWithTicker(idea.symbol)}
                    className="mb-2 cursor-pointer text-sm font-bold leading-snug text-content transition-colors hover:text-signal"
                  >
                    {idea.title}
                  </h3>

                  {/* Description - clamped to two lines */}
                  <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted">
                    {idea.description}
                  </p>

                  {/* Tags */}
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {idea.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-surface-2 px-2 py-0.5 text-2xs font-medium text-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer: engagement figures + the way in */}
                <div className="flex items-center justify-between border-t border-line/60 pt-3">
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <button
                      type="button"
                      onClick={() => handleLike(idea.id)}
                      className={`flex items-center gap-1 transition-colors ${
                        isLiked ? "font-semibold text-signal" : "hover:text-content"
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      <span className="ta-num">{idea.likes}</span>
                    </button>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="ta-num">{idea.comments}</span>
                    </span>
                  </div>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onOpenChartWithTicker(idea.symbol)}
                    className="flex items-center gap-1 rounded-md bg-signal px-3 py-1 text-xs font-semibold text-signal-ink transition-colors hover:bg-signal/90"
                  >
                    <span>
                      {t("Open")} {idea.symbol} {t("Chart")}
                    </span>
                    <ChevronRight className="h-3 w-3" />
                  </motion.button>
                </div>
              </motion.article>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
};
