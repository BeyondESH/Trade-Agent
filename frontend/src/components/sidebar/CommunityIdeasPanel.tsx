import React, { useState } from 'react';
import { MessageSquare, ThumbsUp, Send, User } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  theme: 'dark' | 'light';
}

export const CommunityIdeasPanel: React.FC<Props> = ({ theme }) => {
  const isDark = theme === 'dark';
  const [messages, setMessages] = useState([
    { id: '1', user: 'CryptoWhale_Pro', time: '12m ago', text: 'BTC looking extremely strong holding $96k support. Watching for $100k breakout target next!', likes: 14 },
    { id: '2', user: 'AlphaTrader_NY', time: '28m ago', text: 'NVDA earnings preview looking bullish on Blackwell cluster guidance.', likes: 8 },
    { id: '3', user: 'ForexMaster_LDN', time: '1h ago', text: 'EURUSD forming a clear double bottom on 4h timeframe, RSI divergence confirmed.', likes: 5 },
  ]);
  const [inputVal, setInputVal] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setMessages([
      ...messages,
      { id: Date.now().toString(), user: 'You (Trader)', time: 'Just now', text: inputVal.trim(), likes: 0 },
    ]);
    setInputVal('');
  };

  return (
    <div id="community-ideas-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <MessageSquare className="w-4 h-4 text-[#2962ff]" />
          <span>{t('Public Stream & Chat')}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1 font-semibold text-[#2962ff]">
                <User className="w-3 h-3" />
                <span>{m.user}</span>
              </div>
              <span>{m.time}</span>
            </div>
            <p className="text-xs leading-relaxed">{m.text}</p>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
              <ThumbsUp className="w-3 h-3 text-gray-400 hover:text-[#2962ff] cursor-pointer" />
              <span>{m.likes}</span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className={`p-2 border-t flex gap-1.5 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-white'}`}>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Share trading thought..."
          className={`flex-1 px-2.5 py-1.5 rounded text-xs outline-none ${
            isDark ? 'bg-[#1e222d] text-white border border-[#2a2e39] focus:border-[#2962ff]' : 'bg-gray-100 text-black border border-gray-200 focus:border-[#2962ff]'
          }`}
        />
        <button
          type="submit"
          className="p-1.5 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
