import { useState } from "react";
import { CandleType } from "klinecharts";
import type { Period, SymbolInfo } from "@klinecharts/pro";
import type { Locale, TKey } from "../lib/i18n";
import type { Theme } from "../lib/theme";
import type { SyncFlags, SyncKind } from "../lib/chartSyncBus";
import { CHART_LAYOUTS } from "../components/chart/ChartGrid";
import {
  AreaIcon,
  BarsIcon,
  CandlesIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  SearchIcon,
  UserIcon,
} from "../ui/icons";

interface Props {
  symbol: SymbolInfo;
  period: Period;
  periods: Period[];
  chartType: CandleType;
  layoutCount: number;
  syncFlags?: SyncFlags;
  onSyncFlagChange?: (kind: SyncKind, on: boolean) => void;
  t: (key: TKey) => string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenSearch: () => void;
  onPeriodChange: (period: Period) => void;
  onChartTypeChange: (type: CandleType) => void;
  onLayoutChange: (count: number) => void;
  onOpenIndicator: () => void;
  onOpenTimezone: () => void;
  onOpenSettings: () => void;
  onOpenAlerts: () => void;
  onOpenReplay?: () => void;
  onSaveTemplate: () => void;
}

const CHART_TYPE_IDS = ["candle_solid", "ohlc", "area"] as const;
const CHART_TYPES: { id: CandleType; key: TKey }[] = CHART_TYPE_IDS.map((id) => ({
  id: id as CandleType,
  key: id === "ohlc" ? "chart.bar" : id === "area" ? "chart.area" : "chart.candle",
}));

function Divider() {
  return <div className="mx-1 w-px shrink-0 bg-border" />;
}

function Btn({
  onClick,
  className = "",
  children,
  title,
  ...rest
}: {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  title?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      title={title}
      {...rest}
      className={`rounded-btn px-2 text-xs text-muted transition hover:bg-hover hover:text-text ${className}`}
    >
      {children}
    </button>
  );
}

/** 38px global top bar (TradingView style). Symbol search lives in the full-screen SearchModal. */
export function TVTopBar(props: Props) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const anyOpen = typeOpen || layoutOpen || accountOpen;
  const closeAll = () => {
    setTypeOpen(false);
    setLayoutOpen(false);
    setAccountOpen(false);
  };

  const typeLabel = CHART_TYPES.find((c) => c.id === props.chartType)?.key ?? "chart.candle";
  const TypeIcon =
    props.chartType === ("ohlc" as CandleType)
      ? BarsIcon
      : props.chartType === ("area" as CandleType)
        ? AreaIcon
        : CandlesIcon;
  const typeIcon = <TypeIcon size={14} data-testid="topbar-chart-type-icon" />;

  return (
    <header
      className="flex h-[38px] shrink-0 items-stretch overflow-visible border-b border-border bg-panel text-xs text-text select-none"
      data-testid="tv-top-bar"
    >
      {anyOpen && <div className="fixed inset-0 z-40" onClick={closeAll} data-testid="topbar-backdrop" />}
      <div className="flex items-center px-3 text-sm font-bold tracking-wide">RaiBro</div>
      <Divider />

      {/* symbol search trigger (opens the full-screen modal) */}
      <div className="relative flex items-center">
        <button
          className="flex h-full items-center gap-1.5 px-3 transition hover:bg-hover"
          onClick={props.onOpenSearch}
          data-testid="topbar-symbol"
        >
          <SearchIcon size={14} className="text-muted" />
          <span className="font-semibold">{props.symbol.shortName}</span>
          <ChevronDownIcon size={9} className="text-muted" />
        </button>
      </div>
      <Divider />

      {/* periods */}
      <div className="flex items-center gap-0.5 px-1.5">
        {props.periods.map((p) => (
          <button
            key={p.text}
            onClick={() => props.onPeriodChange(p)}
            className={`rounded-btn px-1.5 py-0.5 transition ${
              props.period.text === p.text
                ? "bg-hover text-accent"
                : "text-muted hover:bg-hover hover:text-text"
            }`}
            data-testid={`topbar-period-${p.text}`}
          >
            {p.text}
          </button>
        ))}
      </div>
      <Divider />

      {/* chart type */}
      <div className="relative flex items-center">
        <button
          className="flex h-full items-center gap-1.5 px-2 transition hover:bg-hover"
          onClick={(e) => {
            e.stopPropagation();
            setTypeOpen((o) => !o);
          }}
          data-testid="topbar-chart-type"
        >
          <span className="w-4 text-center">{typeIcon}</span>
          <span className="text-muted">{props.t(typeLabel)}</span>
          <ChevronDownIcon size={9} className="text-muted" />
        </button>
        {typeOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-32 rounded-modal border border-border bg-panel shadow-float p-1">
            {CHART_TYPES.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  props.onChartTypeChange(c.id);
                  setTypeOpen(false);
                }}
                className={`block w-full rounded-chip px-2 py-1 text-left hover:bg-hover ${
                  props.chartType === c.id ? "text-accent" : "text-text"
                }`}
              >
                {props.t(c.key)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* indicators */}
      <div className="flex items-center">
        <Btn onClick={props.onOpenIndicator} data-testid="topbar-indicator">
          {props.t("topbar.indicator")}
        </Btn>
      </div>
      <Divider />

      {/* template + alerts + replay */}
      <div className="flex items-center">
        <Btn onClick={props.onSaveTemplate}>{props.t("topbar.template")}</Btn>
        <Btn onClick={props.onOpenAlerts} data-testid="topbar-alerts">
          {props.t("topbar.alerts")}
        </Btn>
        {props.onOpenReplay && (
          <Btn onClick={props.onOpenReplay} data-testid="topbar-replay">
            {props.t("topbar.replay")}
          </Btn>
        )}
      </div>

      {/* right cluster */}
      <div className="ml-auto flex items-center">
        <div className="relative flex items-center">
          <button
            className="flex h-full items-center gap-1.5 px-2 transition hover:bg-hover"
            onClick={(e) => {
              e.stopPropagation();
              setLayoutOpen((o) => !o);
            }}
            data-testid="topbar-layout"
          >
            <span className="flex w-4 items-center justify-center">
              <LayoutGridIcon size={13} />
            </span>
            <span className="text-muted">{props.t("topbar.layout")}</span>
          </button>
          {layoutOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-modal border border-border bg-panel shadow-float p-1">
              {CHART_LAYOUTS.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    props.onLayoutChange(n);
                  }}
                  className={`block w-full rounded-chip px-2 py-1 text-left hover:bg-hover ${
                    props.layoutCount === n ? "text-accent" : "text-text"
                  }`}
                >
                  {n}
                </button>
              ))}
              {props.syncFlags && props.onSyncFlagChange && props.layoutCount > 1 && (
                <div className="mt-1 border-t border-border pt-1" data-testid="layout-sync-flags">
                  {(
                    [
                      ["symbol", "sync.symbol"],
                      ["period", "sync.period"],
                      ["crosshair", "sync.crosshair"],
                      ["range", "sync.range"],
                      ["draw", "sync.draw"],
                    ] as const
                  ).map(([kind, labelKey]) => (
                    <label
                      key={kind}
                      className="flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-left text-xs text-muted hover:bg-hover hover:text-text"
                    >
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={props.syncFlags![kind]}
                        onChange={(e) => props.onSyncFlagChange!(kind, e.target.checked)}
                        data-testid={`sync-flag-${kind}`}
                      />
                      {props.t(labelKey)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <Btn onClick={props.onSaveTemplate}>{props.t("topbar.save")}</Btn>
        <Btn onClick={props.onOpenSettings} data-testid="topbar-settings">
          {props.t("topbar.settings")}
        </Btn>
        <Btn onClick={props.onOpenTimezone}>{props.t("status.timezone")}</Btn>

        {/* account / settings */}
        <div className="relative flex items-center">
          <button
            className="flex h-full items-center gap-1 px-3 transition hover:bg-hover"
            onClick={(e) => {
              e.stopPropagation();
              setAccountOpen((o) => !o);
            }}
            data-testid="topbar-account"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hover">
              <UserIcon size={12} />
            </span>
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-modal border border-border bg-panel shadow-float p-1.5">
              <div className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {props.t("settings.language")}
              </div>
              <button
                onClick={() => props.onLocaleChange(props.locale === "zh" ? "en" : "zh")}
                className="w-full rounded-chip px-2 py-1 text-left hover:bg-hover"
                data-testid="account-locale"
              >
                {props.locale === "zh" ? "English" : "中文"}
              </button>
              <div className="mt-1 px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {props.t("settings.theme")}
              </div>
              <button
                onClick={() => props.onThemeChange(props.theme === "dark" ? "light" : "dark")}
                className="w-full rounded-chip px-2 py-1 text-left hover:bg-hover"
                data-testid="account-theme"
              >
                {props.theme === "dark" ? props.t("settings.light") : props.t("settings.dark")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
