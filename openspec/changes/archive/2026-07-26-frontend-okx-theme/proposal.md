## Why

现有前端(`web-frontend`)功能齐全但观感朴素(内联样式、2×2 面板)。本 change 以 **Tailwind CSS** 引入 OKX 风格的**专业交易终端**观感与布局:顶栏 + 左市场列表 + 中间大图表 + 右侧下单区 + 底部持仓/委托/日志/策略 Tab。纯表现层重构,不动后端/API/业务逻辑。

## What Changes

- 引入 **Tailwind CSS**(v3)+ PostCSS,定义 OKX 风格设计 tokens(深色底、绿涨红跌、紧凑排版、等宽数字、1px 分隔线)。
- 新增一套 **Tailwind UI 原子组件**:Panel、Button、Input/NumberField、Tabs、Table、Modal、Badge。
- 重排为**交易终端布局** `AppShell`:Header、MarketList(左)、ChartArea(中)、OrderPanel(右)、BottomTabs(底)。
- **复用并重绘**既有逻辑组件:下单确认(→Modal)、策略编辑器/组合/日志(→底部 Tab)、控制(→Header)。
- **图表**调成 OKX 观感(绿涨红跌蜡烛、深色网格、十字光标、S/R 价格线配色)。
- 保留组件的文本标签/角色,使既有 vitest 组件测试继续通过。

## Capabilities

### New Capabilities
- `design-system`: Tailwind 接入、OKX tokens、UI 原子组件。
- `terminal-layout`: AppShell 终端式布局(header/market/chart/order/bottom-tabs)。
- `chart-theming`: lightweight-charts 的 OKX 风格配色。
- `reskinned-panels`: 市场列表、下单区、底部 Tab(包装既有逻辑组件)。

### Modified Capabilities
<!-- 无(表现层重构;不改 api-client/charting 转换/后端能力的既有 spec 行为) -->

## Impact

- **新增依赖**:tailwindcss、postcss、autoprefixer(dev)。
- **代码**:`frontend/tailwind.config.js`、`postcss.config.js`、`src/index.css`、`src/ui/*`、布局组件;重绘既有组件(不改其对外行为/文本)。
- **不改**:后端、API 客户端、transform、hooks 的逻辑。
- **对齐**:UI 增强;验证仍靠 `tsc` + `vite build` + `vitest`。
- **合规**:OKX-inspired 自有视觉,不使用 OKX logo/商标/专有素材。
