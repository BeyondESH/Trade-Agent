import type { ReactNode, SVGProps } from "react";

/**
 * TradingView-style line icon set: 24 viewBox, 1.2–1.5px stroke, no fill.
 * Coloring flows through `currentColor` + text color classes, so icons pick
 * up theme tokens from their parent (text-muted / text-text / text-accent).
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Base({ size = 20, children, ...rest }: IconProps & { children?: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const CandlesIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4v3M9 17v3M15 5v2.5M15 16.5V19" />
    <rect x="7" y="7" width="4" height="10" rx="0.5" />
    <rect x="13" y="7.5" width="4" height="9" rx="0.5" />
  </Base>
);

export const BarsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 4v16M8 9h2.5M8 15H5.5M16 6v14M16 10.5h2.5M16 17h-2.5" />
  </Base>
);

export const AreaIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 20h18" />
    <path d="M3 16l4-6 4 3 5-8 5 4" />
  </Base>
);

export const LayoutGridIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
  </Base>
);

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="7" cy="18" r="2" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Base>
);

export const UserIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </Base>
);

export const WatchlistIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Base>
);

export const AlertIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Base>
);

export const DataWindowIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <path d="M3 9h18M9 9v11" />
  </Base>
);

export const DomIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Base>
);

export const BrokerIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    <path d="M2 7h20v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
  </Base>
);

export const FullscreenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </Base>
);
