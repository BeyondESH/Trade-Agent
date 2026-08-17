/**
 * Bridge between our own top bar and the vendored klinecharts-pro chrome.
 *
 * The vendor period bar (38px top strip) is hidden via CSS
 * (`klinecharts-pro-theme.css`), but its buttons stay mounted in the DOM.
 * These helpers locate them and trigger the vendor modals (symbol search /
 * indicators / timezone / settings) programmatically, so we do not have to
 * rebuild those modals.
 *
 * All selectors are centralized here; a klinecharts-pro upgrade only requires
 * touching this file.
 */

const PERIOD_BAR_SELECTOR = ".klinecharts-pro-period-bar";

/** First `.tools` button is indicators, then timezone, settings. */
function toolsButtons(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`${PERIOD_BAR_SELECTOR} .item.tools`));
}

function click(el: HTMLElement | null | undefined): void {
  el?.click();
}

export function openSymbolSearch(root: HTMLElement): void {
  click(root.querySelector<HTMLElement>(`${PERIOD_BAR_SELECTOR} .symbol`));
}

export function openIndicatorModal(root: HTMLElement): void {
  click(toolsButtons(root)[0]);
}

export function openTimezoneModal(root: HTMLElement): void {
  click(toolsButtons(root)[1]);
}

export function openSettingModal(root: HTMLElement): void {
  click(toolsButtons(root)[2]);
}
