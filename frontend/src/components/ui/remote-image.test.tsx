// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RemoteImage } from "./remote-image";

describe("RemoteImage", () => {
  it("lazy-loads and decodes off the main thread", () => {
    render(<RemoteImage src="https://cdn.example/logo.png" alt="LINK" className="h-5 w-5" />);
    const img = screen.getByAltText("LINK");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.className).toContain("h-5");
  });

  it("renders the fallback when there is no source", () => {
    render(<RemoteImage src={null} alt="LINK" fallback={<span>L</span>} />);
    expect(screen.queryByAltText("LINK")).toBeNull();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("swaps to the fallback when the image fails to load", () => {
    render(
      <RemoteImage src="https://cdn.example/broken.png" alt="LINK" fallback={<span>L</span>} />,
    );
    fireEvent.error(screen.getByAltText("LINK"));
    expect(screen.queryByAltText("LINK")).toBeNull();
    expect(screen.getByText("L")).toBeInTheDocument();
  });
});
