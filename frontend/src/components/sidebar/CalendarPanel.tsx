import React from 'react';
import { EconomicEvent } from '../../types/trading';
import { Calendar, AlertTriangle } from 'lucide-react';

interface Props {
  events: EconomicEvent[];
  theme: 'dark' | 'light';
}

export const CalendarPanel: React.FC<Props> = ({ events, theme }) => {
  const isDark = theme === 'dark';

  return (
    <div id="calendar-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Calendar className="w-4 h-4 text-[#2962ff]" />
          <span>Economic Calendar</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-500/10 no-scrollbar">
        {events.map((ev) => (
          <div
            key={ev.id}
            className={`p-3 flex flex-col gap-1.5 transition-colors ${
              isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-xs">{ev.time}</span>
                <span className="font-bold text-[10px] px-1 py-0.2 rounded bg-gray-500/20">{ev.currency}</span>
              </div>
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  ev.impact === 'high'
                    ? 'bg-red-500/20 text-red-500'
                    : ev.impact === 'medium'
                    ? 'bg-orange-500/20 text-orange-500'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {ev.impact} Impact
              </span>
            </div>

            <div className="font-semibold text-xs leading-snug">{ev.event}</div>

            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-gray-400 pt-1">
              <div>
                <span className="text-gray-500 block">Actual</span>
                <span className="font-semibold text-white">{ev.actual || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Forecast</span>
                <span>{ev.forecast || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Previous</span>
                <span>{ev.previous || '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
