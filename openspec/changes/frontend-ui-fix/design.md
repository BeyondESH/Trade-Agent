## Context

前端由 React 迁移至 Vue 后不可用。根因已定位：`tailwind.config.js:3` 的 `content: ["./index.html", "./src/**/*.{ts,tsx}"]` 不含 `.vue`，Vue 组件中的工具类全部未生成（实测 dev 产物 CSS 仅 353 字节，`.bg-panel`/`.flex`/`.h-screen` 均缺失）。同时 klinecharts 图表只有打桩测试，真实浏览器行为未经验证。

后端已具备：FastAPI（含 `/candles`、`/chart-config`、`/ws` 实时快照 + Bitget WS 流），`backend/data/parquet` 有 BTCUSDT 5m 数据。

## Goals / Non-Goals

**Goals:**
- 修复 Tailwind content 扫描，使 Vue SFC 中的工具类生效，界面恢复可用。
- 在真实浏览器中验证 klinecharts 渲染（蜡烛、VOL/MACD 副图、S/R/结构/SMC 图层、实时 `last_candle`），修复发现的运行时问题。
- 端到端可用：起后端 + 前端，能看到有数据的 K 线与实时跳动。
- 回归全绿，并建立产物级校验防止复发。

**Non-Goals:**
- 不做 UI 重建/重设计（属后续 `frontend-ui-rebuild` change）。
- 不加新功能（盘口、搜索等）。
- 不改后端逻辑（数据/WS 通道保持现状，仅验证）。

## Decisions

### D1: 修复 Tailwind content 扫描

- `tailwind.config.js` 的 `content` 改为 `["./index.html", "./src/**/*.{vue,ts,tsx}"]`。
- 理由：Vue 项目工具类全部在 SFC 中；保留 ts/tsx 兼容未来 JSX 片段。

### D2: 真实浏览器验证是本次核心验收手段

打桩测试无法证明 canvas 渲染正确。验证流程：

1. 修复 tailwind → `npm run build`，检查产物 CSS 字节数与关键类（`.bg-panel`、`.flex`、`.grid-cols-`、`.h-screen`）。
2. 起后端（`market-data serve`，含 Bitget WS 流）→ 起前端 `npm run dev`。
3. 浏览器打开 `http://127.0.0.1:5173`，人工目检：K 线渲染、VOL/MACD 副图、图层叠加、价格/最后一根 K 线实时跳动。
4. 若图表不可见，按序排查：容器高度（h-full 链路）、klinecharts init 时机、数据加载（/candles 返回）、resize。

### D3: 图表运行时问题排查路径（按可能性排序）

- **容器尺寸**：`AppShell` 中列 grid + `min-h-0` 链路、`Chart.vue` 容器 `h-full`；若高度为 0，klinecharts 不渲染 → 检查布局高度链路与浏览器 devtools。
- **init 时机**：`onMounted` 时容器须已在 DOM 且非零尺寸；若字体/CSS 未就绪导致 0 尺寸，考虑 `nextTick` 后再 init。
- **数据**：`/candles` 需有数据（存量 parquet）；`candlesToKLineData` 毫秒时间戳对齐 klinecharts 默认单位。
- **指标副图**：`createIndicator(name, false, {id})` 创建独立 pane；VOL/MACD 未显示时检查 paneOptions 用法。
- **resize**：klinecharts 自带容器 ResizeObserver（验证时确认）；若窗口缩放图表不变，补 `chart.resize()`。

### D4: 产物级回归校验（防复发）

- 在 `npm test` 增加一个轻量校验：构建产物（或 Tailwind 扫描结果）断言关键工具类存在。
- 实现方式：新增 vitest 测试读取 `index.css` 的 Tailwind 扫描输出（`@tailwind utilities` 由构建生成），或直接断言 `vite build` 产物 CSS 含 `.bg-panel`。简单做法：单测解析 tailwind 配置的 `content` 数组必须包含 `**/*.vue`，并在 CI 构建后抽查产物。

## Risks / Trade-offs

- **[浏览器环境不可用（本机 headless 缺失）]** → 验证分两级：自动化产物校验（CSS 含工具类）+ 人工浏览器目检（交付后由用户确认）。
- **[klinecharts 有比预期更多的运行时问题]** → 按 D3 顺序排查，单问题单修复，不改整体架构。
- **[存量数据太少（仅 BTCUSDT 5m 两天）]** → 足够验证渲染与实时；如需更多周期可用 CLI `pull` 增量。

## Migration Plan

1. 修复 tailwind content → build → CSS 产物校验。
2. 起全栈 → 浏览器验证图表（分步：蜡烛 → 指标 → 图层 → 实时）。
3. 修复运行时问题（按 D3），每步回归 typecheck/build/test。
4. 补产物级回归测试。

回滚：单文件配置修复，可随时 revert；图表运行时修复均为局部改动。

## Open Questions

- 图表不可用的根因是否只有 tailwind 一处？（验证后若仍有问题，逐个定位）
- 是否需要为浏览器验证引入自动化（Playwright）？本期倾向人工目检 + 产物校验，避免引入重型依赖。
