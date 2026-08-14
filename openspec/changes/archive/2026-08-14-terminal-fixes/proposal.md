## Why

交易终端存在 5 个用户可见问题：(1) K 线图切换时间级别后图表空白不显示数据；(2) 组件为固定 grid 布局，无法拖动位置、动态排布、调整大小；(3) K 线图渲染默认的 klinecharts-pro Logo 水印；(4) 全局字体/主题未统一为无衬线、圆润、简约的现代风格；(5) 左上角站名仍为旧名称。这些问题直接影响终端可用性与观感。

## What Changes

- 修复 K 线周期切换：统一前端 `periodToTimeframe` 与后端 timeframe 大小写约定（`1h/4h/12h/1d`），扩展现有数据订阅覆盖全部可选周期，使周期切换后图表能正确加载并展示数据。
- 实现可拖拽布局：将固定三列 grid 改为可拖拽面板布局，支持拖动位置、交换排布与拖拽调整面板大小，布局持久化到本地。
- 移除 K 线图水印：向 `KLineChartPro` 传入空 `watermark`，不再渲染默认 Logo。
- 全局主题美化：统一无衬线字体栈，完善圆角、间距与配色 tokens，实现圆润高级简约的深色 UI 风格。
- 站名更新：左上角站点标题由 `AI-Trade` 改为 `RaiBro Trading`（含 `index.html` 标题）。

## Capabilities

### New Capabilities

- `draggable-layout`: 交易终端面板可拖拽、可重排、可调整大小的布局能力，布局状态本地持久化。

### Modified Capabilities

- `chart-terminal`: 周期切换后图表 SHALL 正确加载并展示对应周期数据（当前周期切换存在数据空白）。
- `chart-theming`: 图表水印 SHALL 可移除，图表区域不再渲染默认 Logo。
- `design-system`: 全局字体栈统一为无衬线，UI tokens 增加圆角/间距/配色以呈现圆润简约风格。
- `exchange-terminal-ui`: 左上角站名 SHALL 显示 `RaiBro Trading`。

## Impact

- 前端：`App.tsx`、`KLineChartProView.tsx`、`datafeed.ts`、`client.ts`、`index.css`、`tailwind.config.js`、`index.html`，新增布局组件与 hooks。
- 后端：`models.py`（timeframe 大小写容错）、`config.py`（订阅 timeframes 扩至全部周期）。
- 依赖：新增 1 个拖拽布局库（如 `gridstack.js` 或自研拖拽）。
- 测试：更新 `App.test.tsx`，新增布局与周期数据链路测试。
