// 性能测量支撑工具：前置条件校验 + WebSocket 计量 + 空白页对照。
//
// 职责边界（见 docs/frontend-performance.md §1）：
//   本脚本 **只做计量与前置校验**，不产出性能结论。
//   主线程 CPU 归因 / LCP 拆解 / 渲染阻塞 / 强制回流 一律由 Chrome DevTools MCP
//   的 trace 能力给出——那些信息在 Playwright 中不可见。
//
// 为什么需要它：Chrome DevTools MCP 的网络面板不透出 WebSocket
// （resourceTypes:["websocket"] 返回 "No requests found"），
// 故 WS 连接数与速率只能靠应用内钩子计量（§9）。
//
// 用法： cd frontend && npm run perf:meter
// 环境变量：
//   PERF_URL        被测地址，默认 http://127.0.0.1:4173
//   PERF_BACKEND    后端地址，默认 http://127.0.0.1:8181
//   PERF_SAMPLE_MS  采样窗口，默认 5000
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const backend = process.env.PERF_BACKEND ?? "http://127.0.0.1:8181";
const sampleMs = Number(process.env.PERF_SAMPLE_MS ?? 5000);

/** 在页面任何脚本之前挂上 WebSocket 钩子，统计连接数、消息数、字节数与通道占比。 */
const wsHook = () => {
  const stats = { opens: 0, closes: 0, errors: 0, msgs: 0, bytes: 0, byChannel: {} };
  window.__wsStats = stats;
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      stats.opens += 1;
      this.addEventListener("message", (e) => {
        stats.msgs += 1;
        const data = typeof e.data === "string" ? e.data : "";
        stats.bytes += data.length;
        try {
          const frame = JSON.parse(data);
          const channel = frame?.arg?.channel ?? frame?.channel ?? frame?.event ?? "unknown";
          stats.byChannel[channel] = (stats.byChannel[channel] ?? 0) + 1;
        } catch {
          /* 非 JSON 帧（心跳等）仍计入总量 */
        }
      });
      this.addEventListener("close", () => {
        stats.closes += 1;
      });
      this.addEventListener("error", () => {
        stats.errors += 1;
      });
    }
  };
};

/** 采样 rAF 帧间隔，用于空白页对照（排除浏览器节流与工具自身开销）。 */
const frameProbe = (frames) =>
  new Promise((resolve) => {
    const gaps = [];
    let last = performance.now();
    let n = 0;
    const tick = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      n += 1;
      if (n < frames) requestAnimationFrame(tick);
      else resolve(gaps);
    };
    requestAnimationFrame(tick);
  });

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const round = (v) => Math.round(v * 100) / 100;

const fail = (msg) => {
  console.error(`\n✗ 前置条件不满足：${msg}`);
  console.error("  测量已中止。未校验数据流的性能数字一律无效（规程 §3）。");
  process.exit(1);
};

// ---- 前置条件 1：后端可达 -------------------------------------------------
let health;
try {
  const res = await fetch(`${backend}/health`);
  if (!res.ok) fail(`后端 /health 返回 ${res.status}`);
  health = await res.text();
} catch (err) {
  fail(`后端 ${backend} 不可达（${err.message}）`);
}
console.log(`✓ 后端可达  ${backend}/health -> ${health.trim().slice(0, 40)}`);

// ---- 空白页对照 ----------------------------------------------------------
const browser = await chromium.launch();
const blank = await browser.newPage();
await blank.goto("about:blank");
const blankGaps = await blank.evaluate(frameProbe, 120);
await blank.close();
console.log(
  `✓ 空白页对照  帧间隔 min ${round(Math.min(...blankGaps))} / median ${round(
    median(blankGaps),
  )} / max ${round(Math.max(...blankGaps))} ms`,
);

// ---- 前置条件 2 + 3：行情确实投递，并记录速率 ------------------------------
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).split("\n")[0].slice(0, 120)));
await page.addInitScript(wsHook);

await page.goto(url, { waitUntil: "domcontentloaded" });

// 等待首个 WS 消息到达（最多 20s）
let delivered = false;
for (let i = 0; i < 100; i++) {
  delivered = await page.evaluate(() => (window.__wsStats?.msgs ?? 0) > 0);
  if (delivered) break;
  await page.waitForTimeout(200);
}
if (!delivered) fail("WebSocket 在 20s 内未收到任何消息（应用处于空态，测得的是空壳）");

const before = await page.evaluate(() => ({ ...window.__wsStats }));
await page.waitForTimeout(sampleMs);
const after = await page.evaluate(() => ({ ...window.__wsStats }));
const seconds = sampleMs / 1000;

const msgsPerSec = Math.round((after.msgs - before.msgs) / seconds);
const kbPerSec = Math.round((after.bytes - before.bytes) / seconds / 1024);

// 稳态帧间隔（加载期读数不计入，规程 §5）
const appGaps = await page.evaluate(frameProbe, 120);

const channels = Object.entries(after.byChannel)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`)
  .join(" > ");

const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);
await browser.close();

console.log(`✓ 行情在投递`);
console.log(`\n=== WebSocket 计量（${seconds}s 窗口）===`);
console.log(`  连接数      ${after.opens}（关闭 ${after.closes}，错误 ${after.errors}）`);
console.log(`  消息速率    ${msgsPerSec} msg/s，${kbPerSec} KB/s`);
console.log(`  通道占比    ${channels || "(无)"}`);
console.log(`\n=== 稳态帧间隔（应用）===`);
console.log(
  `  min ${round(Math.min(...appGaps))} / median ${round(median(appGaps))} / max ${round(
    Math.max(...appGaps),
  )} ms`,
);
console.log(`\n=== 页面状态 ===`);
console.log(`  DOM 元素数  ${domNodes}`);
console.log(`  页面错误    ${pageErrors.length ? pageErrors.join(" | ") : "none"}`);

// ---- 元数据块（可直接粘贴进测量报告）--------------------------------------
console.log(`\n=== 元数据（粘贴进报告）===`);
console.log(`CPU 降速档位        见 MCP emulate 设置
网络节流档位        见 MCP emulate 设置
缓存状态            见 MCP 设置
产物标识            ${url}
标的数量级          见 /tickers
WS 消息速率         ${msgsPerSec} msg/s, ${kbPerSec} KB/s
WS 通道占比         ${channels || "(无)"}
WS 连接数           ${after.opens}
取样次数与取值方式   1 次采样 ${seconds}s（结论性数字需重复 ≥3 次取中位数）
空白页帧间隔对照    ${round(median(blankGaps))} ms`);
