## Context

#9a 提供本地 FastAPI(REST + `/ws` 快照)。探索已定:React + Vite + TS + lightweight-charts;策略编辑 = 参数表单 + 系统提示 + 手动规则;实盘 = 确认对话框走后端 confirm-token;WS 用快照;本地自用。前端是独立 JS 工程,与 Python 测试基线分离(用 Vitest)。

## Goals / Non-Goals

**Goals:**
- 可构建、可跑的 Vite/React/TS SPA,dev 代理到 API。
- 类型化 API 客户端(REST + WS)。
- 图表:K 线 + 指标 + S/R 水平线 + 趋势线/箱体 overlay。
- 策略编辑器绑定 /config;交易面板(组合/日志/控制/实盘确认/时间段/Excel)。
- 纯逻辑 Vitest 单测;tsc + build 通过。

**Non-Goals:**
- 不改后端(仅消费 API)。
- 不做真逐笔(WS 快照);不做多用户/登录/部署。
- 不追求完善视觉设计,交付功能可用的 SPA。

## Decisions

### D1:工程与构建
`frontend/` = Vite React-TS 模板。`vite.config.ts` dev 代理 `/api` 与 `/ws` → `http://127.0.0.1:8000`。脚本:`dev`/`build`/`test`(vitest)/`typecheck`。

### D2:API 客户端(可测核心)
`src/api/client.ts`:`fetch` 封装,函数对应端点(getCandles/getAnalyze/getStructure/backtest/getJob/agentDecide/agentCycle/getConfig/putConfig/control/order/orderConfirm/getPortfolio/getJournal),统一 base、错误抛出。`src/api/ws.ts`:`connectSnapshot(params, onMsg)` 封装 WebSocket。**纯 TS、无 React 依赖 → Vitest 可测**(fetch mock)。

### D3:数据转换(可测)
`src/lib/transform.ts`:`candlesToSeries`(API→lightweight-charts 数据)、`levelsToPriceLines`、`trendlineToSegment`、`boxToRect`。纯函数,Vitest 覆盖。

### D4:图表
`src/components/Chart.tsx`:lightweight-charts createChart,candlestick series + 指标 line series + S/R `createPriceLine`;趋势线/箱体用叠加 canvas/SVG overlay(lightweight-charts 无原生矩形/斜线)。

### D5:UI 结构
- `StrategyEditor`:读/写 /config(provider kind、risk 参数、system_prompt、manual_rules)。
- `TradingPanel`:portfolio/PnL、journal、时间段选择、Excel 导入导出(用 sheetjs 或后端 Excel;前端先做 CSV/JSON 导出 + 触发后端导出)。
- `Controls`:kill-switch 开关、实盘开关;下单→`OrderConfirmDialog`(拿 token→确认)。
- `useSnapshot` hook:WS 驱动实时刷新。

### D6:测试策略
Vitest 覆盖 `client.ts`(mock fetch)、`transform.ts`(纯函数)。组件渲染测试可选(@testing-library)。整体验证 = `tsc --noEmit` + `vite build` 成功。

## Risks / Trade-offs

- **lightweight-charts 无原生矩形/斜线** → overlay 层自绘;先保证 K线+指标+S/R 水平线,趋势线/箱体做基础 overlay。
- **前端与 Python 测试分离** → 用 Vitest + build 作为前端质量门,不并入 pytest 基线。
- **Excel 导入导出** → 前端先做 CSV/JSON 与调用后端;完整 xlsx 可后续。
- **Node 依赖安装体量** → 一次性;构建产物纯静态。
- **WS 快照延迟** → 明确准实时,与 #9a 一致。

## Open Questions

- Excel 具体形态(前端 sheetjs vs 调后端导出)——先最小(CSV/JSON + 后端触发),按需增强。
- 组件级测试深度(仅纯逻辑 vs 加 @testing-library)——先纯逻辑,保证 build。
- UI 布局/主题细节——功能优先,后续打磨。
