## Why

前端当前完全无法使用：`tailwind.config.js` 的 `content` 扫描通配为 `{ts,tsx}`，Vue 迁移后 `.vue` 文件不被扫描，生成的 CSS 不含任何工具类（实测仅 353 字节，无 `.bg-panel`/`.flex`/`.h-screen`），导致全站布局、高度、配色失效、图表容器高度为 0。此外 klinecharts 图表从未在真实浏览器中验证过，仅打过桩单测。先修复致命问题使前端可用，再谈 UI 重建。

## What Changes

- 修复 `frontend/tailwind.config.js`：`content` 通配加入 `./src/**/*.vue`。
- 验证并修复 klinecharts 真实浏览器渲染：蜡烛、VOL/MACD 指标副图、S/R/结构/SMC 图层、实时 `last_candle` 增量更新；修复发现的运行时问题（容器尺寸、面板、重绘/缩放等）。
- 端到端数据流验证：后端（含实时 WS 流）+ 存量 Parquet 数据 + 前端 dev 全链路可看到 K 线与实时跳动。
- 回归：`npm run typecheck`、`npm run build`、`npm test` 全绿，构建 CSS 产物确认包含组件所用工具类。

## Capabilities

### New Capabilities

（无新增能力；本次为缺陷修复与运行时验证。）

### Modified Capabilities
- `design-system`: Tailwind 工具类必须覆盖 Vue SFC 组件（修复 content 扫描缺失导致的样式失效），并增加产物校验场景。
- `charting`: K 线渲染需在真实浏览器环境验证通过（修复仅打桩、未实测的问题）。

## Impact

- `frontend/tailwind.config.js`：content 通配增加 `.vue`。
- `frontend/`：可能修复 `Chart.vue`/`ChartController`/样式/布局的运行时问题（以浏览器实测结果为准）。
- 测试：`design-system`/`charting` 相关断言与产物校验。
- 不影响：后端、数据管道、实时 WS 通道、风控执行。
