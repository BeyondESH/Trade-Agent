// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { openIndicatorModal, openSettingModal, openSymbolSearch, openTimezoneModal } from "./chartChromeBridge";

function makeRoot(): HTMLElement {
  const root = document.createElement("div");
  root.className = "klinecharts-pro";
  root.innerHTML = `
    <div class="klinecharts-pro-period-bar">
      <div class="menu-container"></div>
      <div class="symbol"><span>BTCUSDT</span></div>
      <span class="item period">5m</span>
      <div class="item tools">indicator</div>
      <div class="item tools">timezone</div>
      <div class="item tools">setting</div>
    </div>
    <div class="klinecharts-pro-content"></div>
  `;
  document.body.appendChild(root);
  return root;
}

describe("chartChromeBridge", () => {
  it("clicks the vendor symbol button to open the symbol search modal", () => {
    const root = makeRoot();
    const spy = vi.spyOn(root.querySelector(".symbol") as HTMLElement, "click");
    openSymbolSearch(root);
    expect(spy).toHaveBeenCalled();
  });

  it("maps tools buttons to indicator/timezone/setting in order", () => {
    const root = makeRoot();
    const tools = root.querySelectorAll<HTMLElement>(".item.tools");
    const spies = Array.from(tools, (el) => vi.spyOn(el, "click"));
    openIndicatorModal(root);
    expect(spies[0]).toHaveBeenCalled();
    openTimezoneModal(root);
    expect(spies[1]).toHaveBeenCalled();
    openSettingModal(root);
    expect(spies[2]).toHaveBeenCalled();
  });

  it("is a no-op when the chrome is absent", () => {
    const root = document.createElement("div");
    expect(() => {
      openIndicatorModal(root);
      openSymbolSearch(root);
    }).not.toThrow();
  });
});
