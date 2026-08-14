## Why

产品后期需接入 Web3 组件（钱包/链上数据），该生态以 React 为主导（wagmi/RainbowKit/ConnectKit/Web3Modal 均仅提供 React 实现）；同时目标图表基座 `klinecharts-pro` 提供开箱即用的交易所式图表终端（画线工具/周期条/搜索/指标弹窗），且交易所前端开源生态（trevortrinh/exchange、HypeTerminal 等）均为 React。综合判断，将前端从 Vue 3 重构为 React，并基于 `klinecharts-pro` 二次开发，数据层沿用 Bitget MCP 后端代理。

## What Changes

- 前端框架从 Vue 3 重构为 React + TypeScript（UI 层全量重写；框架无关的 `api/`、`transform.ts` 保留）。
- 直接 clone `@klinecharts/pro` 源码进项目本地并二次开发（该库已停更，仅 clone 自用，不做 fork/PR）：暴露底层 klinecharts 实例、增加 symbol/period 变更回调、提供图表状态序列化（供自动层/持久化/联动使用）。
- 新增 React 包装器组件：`useRef` 容器 + `new KLineChartPro(...)` + 事件桥接 + 生命周期清理。
- 实现 datafeed 对接后端代理端点：`searchSymbols→/tickers`、`getHistoryKLineData→/candles(+recent)`、`subscribe/unsubscribe→/ws`。
- 自动层（S/R/结构/SMC）控制器迁移到 Pro 暴露的 widget 实例，图层开关与 AI 决策面板作为 React 组件保留在 Pro 容器之外。
- **BREAKING**: `frontend-scaffold`（Vue→React）、`charting`（klinecharts→klinecharts-pro）、`design-system`（UI 原子 Vue→React）、`chart-terminal`（终端基于 Pro 二次开发）。
- 提交当前 Vue 工作树为 git 基线（仓库当前零提交，重构前必须落盘可回退）。

## Capabilities

### New Capabilities
- `klinecharts-pro-integration`: klinecharts-pro 二次开发与 React 集成——fork 改造（暴露实例/回调/序列化）、React 包装器、datafeed 数据接入、自动层叠加与联动。

### Modified Capabilities
- `frontend-scaffold`: 前端工程由 Vite + Vue 3 重构为 Vite + React + TypeScript（构建链 React 插件、tsc 类型检查）。
- `charting`: 图表渲染层由 klinecharts 原生 API 迁移为基于 klinecharts-pro（datafeed 契约 + Pro 内置 chrome）。
- `design-system`: UI 原子组件（Panel/Button/Input/Tabs/Modal/Badge）由 Vue 实现重构为 React 实现，设计 tokens 不变。
- `chart-terminal`: 图表终端（画线工具栏/指标/图层/周期）改为基于 klinecharts-pro 的二次开发形态。

## Impact

- `frontend/`：全量。Vue 组件/包装器/测试重写为 React；`package.json`、`vite.config.ts`、`tsconfig.json` 调整；新增 `@klinecharts/pro` 本地 fork 依赖（`file:` 或 vendoring）；保留 `api/`、`lib/transform.ts`。
- 新增 fork 仓库：`klinecharts-pro` 源码克隆 + 3 处改造（widget 暴露、onSymbolChange/onPeriodChange、序列化）。
- `backend/`：不变（现有 `/candles`、`/candles/recent`、`/ws`、`/chart-config` 即 datafeed 数据源；`/tickers` 等代理端点属后续 exchange-data-api change）。
- 测试：前端组件测试以 React Testing Library 重写；无头浏览器验证图表渲染与联动。
- 涉及规格归档：frontend-scaffold / charting / design-system / chart-terminal。
