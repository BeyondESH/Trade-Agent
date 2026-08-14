## 1. 工程脚手架

- [x] 1.1 `frontend/` Vite React-TS:package.json、tsconfig、vite.config(代理 /api、/ws)
- [x] 1.2 依赖:react、react-dom、vite、typescript、lightweight-charts;dev:vitest、@types
- [x] 1.3 入口 `index.html`、`src/main.tsx`、`src/App.tsx`

## 2. API 客户端

- [x] 2.1 `src/api/types.ts`:端点响应/请求类型
- [x] 2.2 `src/api/client.ts`:fetch 封装 + 各端点函数 + 非2xx 抛错
- [x] 2.3 `src/api/ws.ts`:`connectSnapshot(params, onMsg)` + 断开清理

## 3. 数据转换

- [x] 3.1 `src/lib/transform.ts`:candlesToSeries/levelsToPriceLines/trendlineToSegment/boxToRect(纯函数)

## 4. 图表

- [x] 4.1 `src/components/Chart.tsx`:lightweight-charts K线 + 指标线 + S/R 价格线
- [x] 4.2 趋势线/箱体 overlay(canvas/SVG 叠加)

## 5. 策略编辑器

- [x] 5.1 `src/components/StrategyEditor.tsx`:provider/risk 表单 + system_prompt + manual_rules,绑定 /config
- [x] 5.2 保存(PUT /config)、错误提示、保存后重载

## 6. 交易面板与控制

- [x] 6.1 `src/components/TradingPanel.tsx`:组合/盈亏、交易日志、时间段选择
- [x] 6.2 数据导出(CSV/JSON;Excel 触发后端)
- [x] 6.3 `src/components/Controls.tsx`:kill-switch、实盘开关
- [x] 6.4 `src/components/OrderConfirmDialog.tsx`:/order 拿 token → 确认 → /order/confirm
- [x] 6.5 `src/hooks/useSnapshot.ts`:WS 快照驱动刷新

## 7. 测试与构建

- [x] 7.1 Vitest:client.ts(mock fetch:成功解析 / 非2xx 抛错)
- [x] 7.2 Vitest:transform.ts(candles→序列升序、levels→价格线、trendline/box)
- [x] 7.3 `tsc --noEmit` 通过
- [x] 7.4 `vite build` 成功
