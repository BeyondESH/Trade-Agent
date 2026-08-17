import { useState } from "react";
import type { TKey } from "../../lib/i18n";
import type { ReplaySnapshot, ReplaySpeed } from "../../lib/replayEngine";

export interface ReplayPaperState {
  realized: number;
  floating: number;
  openPositions: number;
  trades: number;
  wins: number;
}

interface Props {
  snap: ReplaySnapshot;
  paper: ReplayPaperState;
  onPlayToggle: () => void;
  onStep: () => void;
  onSpeed: (s: ReplaySpeed) => void;
  onSeek: (cursor: number) => void;
  onExit: () => void;
  onOrder: (side: "long" | "short", qty: number) => void;
  onCloseAll: () => void;
  t: (key: TKey) => string;
}

const SPEEDS: ReplaySpeed[] = [1, 3, 10];

function fmtTime(ts: number | null): string {
  if (ts == null) return "--";
  const d = new Date(ts);
  return d.getFullYear() === 1970 ? "--" : d.toLocaleString("zh-CN", { hour12: false });
}

/** Replay control bar: play/step/speed/timeline + paper trading (replay clock driven). */
export function ReplayBar({ snap, paper, onPlayToggle, onStep, onSpeed, onSeek, onExit, onOrder, onCloseAll, t }: Props) {
  const [qty, setQty] = useState("1");
  const qtyNum = Math.max(0.000001, Number(qty) || 1);
  const pnlColor = (v: number) => (v >= 0 ? "text-up" : "text-down");

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-panel px-3 py-1.5 text-xs"
      data-testid="replay-bar"
    >
      <span className="rounded-chip bg-hover px-2 py-0.5 font-semibold text-accent">{t("replay.mode")}</span>

      <button
        onClick={onPlayToggle}
        className="rounded-btn bg-accent px-3 py-0.5 font-semibold text-white hover:brightness-110"
        data-testid="replay-play-toggle"
      >
        {snap.playing ? t("replay.pause") : t("replay.play")}
      </button>
      <button onClick={onStep} className="rounded-btn px-2 py-0.5 text-muted hover:bg-hover hover:text-text" data-testid="replay-step">
        {t("replay.step")}
      </button>

      <span className="flex items-center gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            className={`rounded-btn px-1.5 py-0.5 ${snap.speed === s ? "bg-hover text-accent" : "text-muted hover:bg-hover hover:text-text"}`}
            data-testid={`replay-speed-${s}`}
          >
            {s}x
          </button>
        ))}
      </span>

      <input
        type="range"
        min={1}
        max={Math.max(1, snap.total - 1)}
        value={snap.cursor}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="min-w-40 flex-1 accent-accent"
        data-testid="replay-seek"
      />
      <span className="tnum text-muted" data-testid="replay-time">
        {fmtTime(snap.timestamp)}
      </span>

      <span className="mx-1 h-4 w-px bg-border" />

      <span className="flex items-center gap-1">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-16 rounded-btn border border-border bg-base px-1.5 py-0.5 tnum text-text outline-none focus:border-accent"
          data-testid="replay-qty"
        />
        <button
          onClick={() => onOrder("long", qtyNum)}
          className="rounded-btn px-2 py-0.5 font-semibold text-white hover:brightness-110"
          style={{ background: "var(--tv-up)" }}
          data-testid="replay-buy"
        >
          {t("replay.long")}
        </button>
        <button
          onClick={() => onOrder("short", qtyNum)}
          className="rounded-btn px-2 py-0.5 font-semibold text-white hover:brightness-110"
          style={{ background: "var(--tv-down)" }}
          data-testid="replay-sell"
        >
          {t("replay.short")}
        </button>
        <button
          onClick={onCloseAll}
          className="rounded-btn px-2 py-0.5 text-muted hover:bg-hover hover:text-text"
          data-testid="replay-close-all"
        >
          {t("replay.closeAll")} ({paper.openPositions})
        </button>
      </span>

      <span className="tnum text-muted">
        {t("replay.realized")}: <span className={pnlColor(paper.realized)}>{paper.realized.toFixed(2)}</span>
      </span>
      <span className="tnum text-muted">
        {t("replay.floating")}: <span className={pnlColor(paper.floating)}>{paper.floating.toFixed(2)}</span>
      </span>

      <button
        onClick={onExit}
        className="ml-auto rounded-btn px-2 py-0.5 text-muted hover:bg-hover hover:text-text"
        data-testid="replay-exit"
      >
        {t("replay.exit")}
      </button>
    </div>
  );
}
