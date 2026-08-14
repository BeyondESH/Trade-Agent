## Context

产品方向定型：React 基座（Web3 生态、交易所开源生态均在 React 侧）+ 基于 klinecharts-pro 二次开发 + Bitget MCP 后端代理。`@klinecharts/pro` 已停更（最后源码提交 2023-05），但其依赖声明 `klinecharts >=9.0.0` 且所用核心 API 与当前 9.8 签名兼容，可 clone 自用、锁 9.x。

现状：Vue 3 前端已可用（图表/实时/持久化/切币种均验证），仓库零 git 提交。重构前必须先 commit 基线。

## Goals / Non-Goals

**Goals:**
- 提交当前 Vue 工作树为 git 基线（可回退）。
- 前端重构为 React + TS，`api/`、`lib/transform.ts` 等框架无关层保留。
- clone klinecharts-pro 源码进项目本地并二次开发：暴露 widget 实例、symbol/period 变更回调、状态序列化。
- React 包装器 + datafeed 对接现有后端端点（`/candles`、`/candles/recent`、`/ws`），自动层/AI 面板保留为产品能力。
- 无头浏览器验证图表渲染与联动。

**Non-Goals:**
- 不接 Web3（后期独立 change，仅选型预留 React）。
- 不做完整交易所 UI 与 `/tickers`/`/orderbook` 等数据代理端点（属 exchange-data-api / exchange-frontend-ui 后续 change；本期 datafeed 的 searchSymbols 先用固定/有限列表）。
- 不维护 klinecharts-pro 上游（停更，纯自用 vendor）。

## Decisions

### D1: klinecharts-pro 源码 vendor

- `git clone https://github.com/klinecharts/pro` → `frontend/vendor/klinecharts-pro`，作为 npm 本地包（`package.json` 中 `"@klinecharts/pro": "file:vendor/klinecharts-pro"`）。
- 锁 `klinecharts@^9`（保留 9.x 兼容，Pro 依赖声明 `>=9.0.0`）。
- 停更即稳定：不做上游同步，所有改造直接写在 vendor 源码里。

### D2: Pro 二次开发（三处小改造）

- `src/types.ts`：`ChartPro` 增加 `getChart(): Chart | null`；`ChartProOptions` 增加 `onSymbolChange?/onPeriodChange?` 回调。
- `src/ChartProComponent.tsx`：`props.ref` 暴露 `getChart: () => widget`；symbol/period 变化时调用回调。
- 序列化/自动层不侵入 Pro：通过 `getChart()` 拿到底层 klinecharts 实例，复用现有 `chartController.ts` 的 overlay id 跟踪与按 groupId 分组逻辑（已实现，改造成接收 widget 实例即可）。

### D3: React 包装器 `KLineChartProView.tsx`

- `useRef<HTMLDivElement>` 容器 → `useEffect` 内 `new KLineChartPro({ container, symbol, period, datafeed, ... })`。
- 生命周期：spike 确认 Pro 实例销毁方式（Pro class 未暴露 dispose；优先确认 `dispose(widgetRef)` 在内部 unmount 的触发条件），cleanup 中执行。
- 事件桥接：`onSymbolChange/onPeriodChange` → `props.onChange` 上抛；外部通过 ref 调用 `setSymbol/setPeriod`。
- 样式对齐：`styles`/`theme` 传现有深色 tokens。

### D4: datafeed 实现（`src/api/datafeed.ts`）

- `searchSymbols(search?)`：本期返回固定有限列表（BTC/ETH/SOL + instruments 元数据映射 SymbolInfo），待 `exchange-data-api` 提供 `/tickers` 后切换。
- `getHistoryKLineData(symbol, period, from, to)`：`GET /candles`（空则 `GET /candles/recent`），转换 ms OHLCV。
- `subscribe/unsubscribe(symbol, period, cb)`：桥接 `/ws` 快照 `last_candle` → `cb(kline)`；管理每 (symbol,period) 的连接生命周期。

### D5: React 组件树重建（保留 tokens/结构，实现语言换 React）

- `ui/`：Button/Input/Tabs/Panel/Badge/Modal React 版（tokens 不变）。
- `layout/`：AppShell/Header/MarketList/BottomTabs React 版；移除交易相关（OrderPanel/下单）。
- 状态：React Context + hooks（不引入重型状态库；后续如需 zustand 再引入，与 Web3 生态一致）。
- AI 分析面板（决策/指标/S/R/日志）：新组件，数据来自 `/agent/decide`、`/analyze`、`/structure`、`/journal`。

### D6: 测试策略

- 组件测试：React Testing Library 重写（等价断言：布局、切币种联动、AI 面板、图层开关）。
- `chartController` 单测保留（改造为接收 widget 实例，mock klinecharts）。
- datafeed 单测：mock fetch 校验映射与回退。
- 无头浏览器（puppeteer + 本机 Chrome）验证：Pro 渲染、自动层叠加、实时更新、切币种/周期联动。

## Risks / Trade-offs

- **[Pro 停更 + Solid 实现]** → 纯 vendor 自维护；测试/调试心智成本略高；改动尽量小且集中在暴露层。
- **[Pro 与 klinecharts 9.x 兼容性仅"声明与签名"级确认]** → 任务前置 spike：在 React 页面实跑一次 Pro + 9.8，验证渲染与改造点。
- **[Pro 无 class 级 dispose]** → spike 确认销毁/重建语义，避免内存泄漏与热重载脏实例。
- **[Vue→React 重写量大]** → 框架无关层保留，UI 原子/布局逐组件等价移植；测试面重写。
- **[仓库零提交]** → P0 强制 commit 基线，重构全程可回退。
- **[历史未归档 change 与新 change 并存]** → 各 change 独立可验证，不阻塞。

## Migration Plan

1. P0：`git add -A && git commit` 当前 Vue 状态为基线。
2. React 脚手架：deps/vite/tsconfig/空壳 App 通过 typecheck+build。
3. clone klinecharts-pro 至 vendor + file: 引用 + D2 三处改造。
4. D3 包装器 + D4 datafeed → 图表真实渲染（spike 先行）。
5. D5 组件树重建（UI 原子→布局→AI 面板）。
6. D6 测试重写 + 无头浏览器回归。

回滚：P0 基线 commit 后可整体还原 Vue 状态。

## Open Questions

- Pro 实例销毁语义（spike 结论写回 D3）。
- Pro + klinecharts 9.8 实测兼容性（spike 结论写回 D1）。
- searchSymbols 本期数据源（固定列表 vs 后端加临时 /tickers 端点）。
