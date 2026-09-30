import { MessageSquare, Send, ThumbsUp, User } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { t } from "../../lib/i18n";

interface Props {
  theme: "dark" | "light";
}

export const CommunityIdeasPanel: React.FC<Props> = () => {
  const [messages, setMessages] = useState([
    {
      id: "1",
      user: "CryptoWhale_Pro",
      time: "12m ago",
      text: "BTC looking extremely strong holding $96k support. Watching for $100k breakout target next!",
      likes: 14,
    },
    {
      id: "2",
      user: "AlphaTrader_NY",
      time: "28m ago",
      text: "NVDA earnings preview looking bullish on Blackwell cluster guidance.",
      likes: 8,
    },
    {
      id: "3",
      user: "ForexMaster_LDN",
      time: "1h ago",
      text: "EURUSD forming a clear double bottom on 4h timeframe, RSI divergence confirmed.",
      likes: 5,
    },
  ]);
  const [inputVal, setInputVal] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setMessages([
      ...messages,
      {
        id: Date.now().toString(),
        user: "You (Trader)",
        time: "Just now",
        text: inputVal.trim(),
        likes: 0,
      },
    ]);
    setInputVal("");
  };

  return (
    <div
      id="community-ideas-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <MessageSquare className="w-4 h-4 text-signal" />
          <span>{t("Public Stream & Chat")}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className="p-2.5 rounded-lg border border-line bg-surface-2 flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between text-2xs text-faint">
              <div className="flex items-center gap-1 font-semibold text-signal">
                <User className="w-3 h-3" />
                <span>{m.user}</span>
              </div>
              <span>{m.time}</span>
            </div>
            <p className="text-xs leading-relaxed">{m.text}</p>
            <div className="flex items-center gap-1 text-2xs text-muted mt-0.5">
              <ThumbsUp className="w-3 h-3 text-muted hover:text-signal cursor-pointer" />
              <span>{m.likes}</span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-2 border-t border-line flex gap-1.5 bg-ink">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Share trading thought..."
          className="flex-1 rounded-md border border-line bg-ink px-2 py-1.5 text-xs text-content outline-none placeholder:text-faint focus:border-signal"
        />
        <button
          type="submit"
          className="p-1.5 rounded-md bg-signal font-semibold text-signal-ink hover:bg-signal/90 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
