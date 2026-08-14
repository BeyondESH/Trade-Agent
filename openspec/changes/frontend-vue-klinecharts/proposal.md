## Why

当前前端为 React 18 + lightweight-charts，只能渲染 K 线与 S/R 价格线，后端已算好的 MACD/KDJ/BOLL、结构趋势线、SMC 箱体等分析结果全部未上屏，缺乏指标副图与交互作图能力，不符合币安/欧易式交易终端的展示预期。团队希望迁移到 Vue 3 以获得更快更简单的开发体验，并同步升级为 klinecharts 图表终端，一次解决技术栈与展示能力两个问题。

## What Changes

- 前端框架从 React 18 全面迁移至 Vue 3（组件/UI 原子/composables/测试全量重写），构建链切换为 `@vitejs/plugin-vue` + `vue-tsc`。
- 图表库从 lightweight-charts 更换为 klinecharts，升级为图表终端：内置指标副图（MACD/KDJ/RSI/VOL 等）、主图叠加（MA/BOLL 等）、16 种交互作图工具。
- 图层分级：用户手绘层、自动识别层（S/R / 结构 / SMC，可整层开关）、指标层三类图层并存。
- 后端新增 ChartStore，图表状态（指标布局、手绘图形、图层开关）按 `category/symbol/timeframe` 持久化到本地 JSON，并提供读写端点。
- **BREAKING**: 前端工程栈从 React 改为 Vue 3（`frontend-scaffold` 规格变更）。
- **BREAKING**: 图表数据转换与渲染 API 从 lightweight-charts 迁移到 klinecharts（`charting` 规格变更）。
- **BREAKING**: UI 原子组件实现从 React 迁移到 Vue 3（`design-system` 规格变更）。

## Capabilities

### New Capabilities
- `chart-terminal`: 图表终端能力——klinecharts 渲染 K 线、内置指标副图与主图叠加、交互作图工具、自动识别图层分级（手绘/自动/指标）及图表状态按 series 持久化与读写。

### Modified Capabilities
- `frontend-scaffold`: 前端工程由 Vite + React + TypeScript 变更为 Vite + Vue 3 + TypeScript（vue-tsc 类型检查、生产构建）。
- `charting`: 图表数据转换与渲染从 lightweight-charts 迁移到 klinecharts（时间戳单位、K 线结构与 overlay 创建方式变更）。
- `design-system`: UI 原子组件（Panel/Button/Input/Tabs/Modal/Badge）从 React 实现迁移为 Vue 3 实现，设计 tokens 与配色语义不变。

## Impact

- `frontend/`：全量。`src/` 下组件/UI/hooks（→ composables）/入口/测试重写；`package.json`、`vite.config.ts`、`tsconfig.json`、`index.html` 构建配置调整；新增 `klinecharts` 依赖，移除 `react`/`react-dom`/`@vitejs/plugin-react`/`@testing-library/*`/`@types/react`。
- `backend/`：新增 ChartStore（数据/配置存储层，与 `appconfig.py` 平级），`webapi.py` 新增 `GET/PUT /chart-config` 端点，`config.py` 增加 chart.json 路径配置。
- 测试：前端组件测试改用 `@vue/test-utils` 重写（Chart 沿用打桩模式规避 jsdom 无 canvas）；后端新增 ChartStore 单测与 `/chart-config` 端点测试。
- 不涉及：数据管道（MCP/Parquet）、风控执行、AI Agent 层、实时 WS 通道（属后续 `realtime-kline` change）。
