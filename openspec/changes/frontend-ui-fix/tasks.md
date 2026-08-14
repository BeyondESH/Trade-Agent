## 1. 修复 Tailwind 扫描

- [x] 1.1 `frontend/tailwind.config.js`：`content` 改为 `["./index.html", "./src/**/*.{vue,ts,tsx}"]`
- [x] 1.2 `npm run build` 后校验产物 CSS：确认包含 `.bg-panel`、`.flex`、`.grid-cols-`、`.h-screen` 等工具类，CSS 体积显著增大（>10KB）

## 2. 真实浏览器验证图表

- [x] 2.1 起后端（`market-data serve`，含 Bitget WS 流）与前端 dev，确认 `/candles`、`/ws` 可用
- [x] 2.2 浏览器打开 `http://127.0.0.1:5173`，目检 K 线蜡烛是否渲染（BTCUSDT 5m 存量数据）
- [x] 2.3 目检 VOL/MACD 指标副图、S/R/结构/SMC 图层叠加是否显示
- [x] 2.4 目检价格与最后一根 K 线是否随 `/ws` 快照实时跳动

## 3. 修复图表运行时问题

- [x] 3.1 若图表不渲染：按容器高度链路（AppShell grid → min-h-0 → h-full）排查并修复
- [x] 3.2 若指标副图不显示：核查 `createIndicator` pane 用法与默认指标（VOL/MACD）加载
- [x] 3.3 若图层不显示：核查 S/R（priceLine）、结构（segment/rect）、SMC overlay 创建逻辑
- [x] 3.4 若实时不更新：核查快照 `last_candle` 字段与 `updateData` 链路
- [x] 3.5 若窗口缩放图表异常：确认 klinecharts resize 行为，必要时补 `chart.resize()`

## 4. 回归校验

- [x] 4.1 新增产物级回归测试：断言 tailwind 配置 content 含 `**/*.vue`（防复发）
- [x] 4.2 `npm run typecheck`、`npm run build`、`npm test` 全绿
- [x] 4.3 后端 `pytest` 全绿（确认未受影响）
- [x] 4.4 再次浏览器目检通过（图表完整可用）
