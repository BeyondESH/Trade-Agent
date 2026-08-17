// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AreaIcon,
  AlertIcon,
  BarsIcon,
  BrokerIcon,
  CandlesIcon,
  ChevronDownIcon,
  ClockIcon,
  DataWindowIcon,
  DomIcon,
  FullscreenIcon,
  LayoutGridIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  WatchlistIcon,
} from "./icons";
import { rightTabIcons } from "../layout/TVRightSidebar";

const ALL = [
  SearchIcon,
  ChevronDownIcon,
  CandlesIcon,
  BarsIcon,
  AreaIcon,
  LayoutGridIcon,
  SettingsIcon,
  ClockIcon,
  UserIcon,
  WatchlistIcon,
  AlertIcon,
  DataWindowIcon,
  DomIcon,
  BrokerIcon,
  FullscreenIcon,
];

describe("ui/icons", () => {
  it("renders every icon as an inline SVG with currentColor stroke", () => {
    for (const Icon of ALL) {
      const { container } = render(<Icon />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      expect(svg?.getAttribute("fill")).toBe("none");
    }
  });

  it("inherits className coloring from the parent", () => {
    const { container } = render(<SearchIcon className="text-accent" />);
    expect(container.querySelector("svg")?.classList.contains("text-accent")).toBe(true);
  });

  it("respects the size prop", () => {
    const { container } = render(<SearchIcon size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("right rail icons are all SVG (no emoji/ASCII glyphs)", () => {
    for (const tab of rightTabIcons()) {
      const { container } = render(<>{tab.icon}</>);
      expect(container.querySelector("svg")).not.toBeNull();
      expect(container.textContent ?? "").toBe("");
    }
  });
});
