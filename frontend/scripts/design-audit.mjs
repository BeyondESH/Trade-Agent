// TEMPORARY verification harness (deleted after use).
// Captures every view in both themes and audits WCAG text contrast in-page.
import { chromium } from "playwright";

const url = process.env.SHOT_URL ?? "http://127.0.0.1:5273";
const dir = process.env.SHOT_DIR ?? "shots";

const VIEWS = ["chart", "markets", "screener", "heatmaps", "community", "news", "research"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(m.text());
});

/** WCAG contrast audit over every visible text node. */
const CONTRAST_AUDIT = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((v) => Number.parseFloat(v));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  const effectiveBg = (el) => {
    let n = el;
    let acc = null;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.55) {
        acc = c;
        break;
      }
      n = n.parentElement;
    }
    return acc ?? { r: 0, g: 0, b: 0, a: 1 };
  };

  const found = [];
  for (const el of document.querySelectorAll("body *")) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ");
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (Number.parseFloat(cs.opacity) < 0.5) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom < 0 || rect.top > innerHeight) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    const cr = ratio(fg, bg);
    const size = Number.parseFloat(cs.fontSize);
    const bold = Number.parseInt(cs.fontWeight, 10) >= 600;
    const large = size >= 18 || (bold && size >= 14);
    const min = large ? 3 : 4.5;
    if (cr < min) {
      found.push({
        text: own.slice(0, 34),
        ratio: Math.round(cr * 100) / 100,
        min,
        px: size,
        fg: `rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      });
    }
  }
  const seen = new Set();
  return found
    .filter((o) => {
      const k = `${o.text}|${o.ratio}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 20);
};

const setTheme = async (theme) => {
  // Prefer the real UI toggle so React state and the canvas stay in sync.
  const title = theme === "light" ? "切换浅色模式" : "切换深色模式";
  const toggle = page.locator(`button[title="${title}"]`);
  if ((await toggle.count()) > 0) {
    await toggle.first().click();
    await page.waitForTimeout(900);
  } else {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await page.waitForTimeout(400);
  }
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

const nav = page.locator("#global-nav-rail button");
const navCount = await nav.count();
const report = [];

for (const theme of ["dark", "light"]) {
  await setTheme(theme);
  for (let i = 0; i < VIEWS.length && i < navCount; i++) {
    await nav.nth(i).click();
    await page.waitForTimeout(1600);
    const name = `v${i}-${VIEWS[i]}-${theme}`;
    await page.screenshot({ path: `${dir}/${name}.png` });
    const issues = await page.evaluate(CONTRAST_AUDIT);
    report.push({ view: name, contrast: issues });
  }
  // dashboard (its own tab type, reached via the "+" launcher)
  await page.locator('[data-testid="tab-new"]').click();
  await page.waitForTimeout(2200);
  const name = `v7-desk-${theme}`;
  await page.screenshot({ path: `${dir}/${name}.png` });
  report.push({ view: name, contrast: await page.evaluate(CONTRAST_AUDIT) });
}

console.log("=== CONTRAST AUDIT (below WCAG AA) ===");
for (const entry of report) {
  if (entry.contrast.length === 0) continue;
  console.log(`\n[${entry.view}]`);
  for (const c of entry.contrast) {
    console.log(`  ${c.ratio.toFixed(2)} (min ${c.min}) ${c.px}px ${c.fg} on ${c.bg}  "${c.text}"`);
  }
}
console.log(`\n=== problems ===\n${problems.length ? problems.slice(0, 8).join(" || ") : "none"}`);

await browser.close();
