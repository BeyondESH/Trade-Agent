## Context

当前交易终端（React + klinecharts-pro + Tailwind）为固定 CSS grid 布局（`App.tsx` 三列：240px 市场列表 / 1fr 图表 / 300px 右侧面板）。已知问题：

1. **周期切换数据空白**：前端 `datafeed.ts:periodToTimeframe()` 生成 `1H/4H/12H/1D`（大写），后端 `models.py` 的 `_TIMEFRAME_STEP_MS` / `_TIMEFRAME_GRANULARITY` 仅认小写 `1h/4h/12h/1d`，导致这些周期请求触发 `ValueError` → HTTP 400 → 图表空白。同时后端 `config.py` 默认仅订阅 `["5m","1d"]` 两个 timeframe，`BitgetWsStream` 的 `/candles/recent` 对其他周期返回空，parquet 历史存储也缺这些周期。
2. **固定布局**：无拖拽/重排/缩放能力。
3. **水印**：`KLineChartPro.tsx` 中 `watermark: options.watermark ?? (Logo as Node)`，未传即渲染默认 Logo。
4. **主题**：字体栈已含系统无衬线但 `.tnum` 用等宽字体，无圆角体系。
5. **站名**：`App.tsx` header 显示 `◆ AI-Trade`，`index.html` title 为 `AI Trading`。

## Goals / Non-Goals

**Goals:**
- 修复所有可切换周期（1m/5m/15m/30m/1H/4H/12H/1D）的数据链路，切换后图表正确加载历史数据并实时更新。
- 终端面板支持拖拽移动、交换排布、拖拽调整大小，布局持久化（localStorage）。
- 移除 K 线图默认水印。
- 全局统一无衬线字体与圆润简约深色主题。
- 左上角站名改为 `RaiBro Trading`。
- 前端 typecheck / vitest / build 保持通过。

**Non-Goals:**
- 不改变 K 线数据存储格式、不引入新的数据后端。
- 不做多工作区/多窗口布局预设。
- 不重写 klinecharts-pro 内部实现（通过公开选项与 CSS 定制）。
- 不做主题切换器（本期仅暗色主题美化）。

## Decisions

### D1: 周期数据链路修复（前后端一致性）

**方案**：后端作为规范方，扩大 timeframe 容错与订阅。

- `models.py`：`timeframe_step_ms` / `timeframe_to_granularity` 对输入做小写归一化（`tf.lower()`），并映射大写 `H` → 小写 `h`、`D` → `d`（`"1H".lower()=="1h"` 天然成立），使 `1H/4H/12H/1D` 与 `1h/4h/12h/1d` 均可解析。这样即使前端曾发送大写也返回数据而非 400。
- `config.py`：默认 `timeframes` 扩至全部可选周期 `["1m","5m","15m","30m","1h","4h","12h","1d"]`（`BitgetWsStream` 会自动按此订阅；Bitget 公开 WS 支持这些 `candle{interval}` 频道）。
- 前端 `datafeed.ts`：`periodToTimeframe` 统一输出后端规范形式 `1m/5m/15m/30m/1h/4h/12h/1d`（小时/天用小写）。
- **数据兜底**：`BitgetDatafeed.getHistoryKLineData` 已先查 `/candles`（parquet）再退 `/candles/recent`（WS 缓冲）。WS 订阅覆盖全部周期后，`/candles/recent` 即可为任意可选周期提供最近 200 根；配合 parquet 历史，切换即可渲染。
- 备选考虑：在前端按周期动态请求 Bitget REST 历史（绕过本后端）——否决，违背集中数据链路架构且重复鉴权逻辑。

### D2: 可拖拽布局实现

**方案**：采用 `gridstack.js`（MIT，零依赖 React 封装，支持 12 列栅格、拖拽移动、resize handle、持久化序列化）。

- 用 React 封装 `GridStackProvider`/`useGridStackLayout`：初始化 `GridStack.init`，`onChange` 时 `grid.save(false)` 存 `localStorage`，启动时 `grid.load(saved)` 恢复。
- 面板枚举（面板 id → 组件）：`market-list`（240px）、`chart`（flex 主区）、`right-panel`（OrderBook + TradesTape + Funding 纵向堆叠，resize）、`ai-panel`（底部占位）。GridStack 单元格分别映射。
- 将现有 CSS grid 结构替换为 GridStack 容器；`KLineChartProView` 挂载在 `chart` 单元格内，容器尺寸变化时调用 `widget.resize()`（`documentResize` 已有 window resize 监听，但面板 resize 需额外 `grid.on('resizestop')` 触发 chart resize）。
- 备选考虑：`react-grid-layout`（需搭配 `useMeasure`，与 klinecharts canvas 尺寸联动需更多胶水）与自研 Pointer 拖拽（易出 edge case）——选择 gridstack.js 因为对 canvas 类组件 resize 事件支持更成熟，且纯 JS 与 React 共存简单。
- 依赖：新增 `gridstack`（含 `.css` 引入），无需额外 React 绑定库。

### D3: 移除水印

`KLineChartProView.tsx` 创建实例时传 `watermark: ""`。`ChartProComponent` 对字符串 watermark 走 `innerHTML` 分支（空字符串 → 空内容），不再 append 默认 Logo。备选：传空 Node——字符串方案更简单。

### D4: 主题美化

- `tailwind.config.js`：新增 `fontFamily.sans` 统一无衬线栈（`Inter`/`-apple-system`/`Segoe UI`/`PingFang SC`/`Microsoft YaHei` 回退，中文场景友好）；增加圆角 tokens（`rounded-panel`、`rounded-btn`）与次级配色（hover/active 态）。
- `index.css`：`.tnum` 数字改为无衬线 + `tabular-nums`（保留对齐特性但不再用等宽族）；滚动条更细更圆；全局 `font-feature-settings` 开启。
- 面板/卡片统一 `rounded-xl` + 微边框 + 柔和阴影，header/按钮 hover 过渡动画。
- 图表区样式由 klinecharts 自身 `styles` 维持（深色）不变，仅保证与面板圆角衔接。

### D5: 站名更新

- `App.tsx` header 左端改为 `RaiBro Trading`（保留 accent 色强调）。
- `index.html` `<title>` 改为 `RaiBro Trading`。

## Risks / Trade-offs

- [gridstack.js 与 klinecharts canvas resize 不联动] → 监听 `resizestop` 手动调用 `chart.resize()`；保留 window resize 监听兜底。
- [timeframe 扩订阅增加 WS 连接订阅数] → 8 周期 × 3 符号 = 24 频道，远低于 Bitget 单连接上限，chunk 发送逻辑已存在。
- [布局持久化版本兼容] → localStorage 存 `{version, grid}`，启动时校验版本号，不匹配则回退默认布局。
- [空历史周期首屏无数据] → 切换周期时显示 loading；`/candles/recent` 有 WS 数据即可兜底，无需 parquet。
- [水印参数改动依赖 vendored klinecharts-pro API] → 仅用公开 `watermark` option，不改 vendor 源码。

## Migration Plan

1. 先后端：`models.py` 小写归一化 + `config.py` timeframes 扩展 → 重启后端。
2. 再前端：`datafeed.ts` timeframe 规范化、`KLineChartProView` 水印、站名、主题。
3. 新增 `gridstack` 依赖并替换布局。
4. 全部完成后跑 `npm run typecheck`、`npm test`、`npm run build`。

## Open Questions

- gridstack 面板最小宽度/高度约束需要确认（避免图表区被拖到过小）。
- 面板默认布局是否保留当前三列 + 底部 AI 结构（计划保留，作为默认 layout）。
