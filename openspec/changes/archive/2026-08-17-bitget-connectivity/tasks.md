# Tasks — bitget-connectivity

## 1. K 线流断线重连 (kline-stream-resilience / realtime-ws)

- [x] 1.1 在 `frontend/src/api/ws.ts` 的 `connectSnapshot` 中实现重连：`onclose`/`onerror` 触发，`manualClose` 标志区分主动关闭，指数退避 `min(500*retry, 5000)`，重连即重建同 URL 订阅
- [x] 1.2 `connectSnapshot` 增加 `onStatus(state: "live"|"reconnecting"|"closed")` 回调；收到消息 → live，onclose 非主动 → reconnecting，主动关闭 → closed
- [x] 1.3 `SnapshotConn.close()` 设置 `manualClose=true` 后再 `sock.close()`，确保切 symbol/卸载不触发重连
- [x] 1.4 单测：断线后自动重连并重订阅、主动关闭不重连、退避递增（沿用现有 vitest 风格）

## 2. 连接态传播到状态栏 (kline-stream-resilience)

- [x] 2.1 `api/datafeed.ts` `BitgetDatafeed.subscribe` 透传 `onStatus`；新增 `onConnState` 监听挂点（datafeed 为 App 单例）
- [x] 2.2 `App.tsx` 持有 `connState`，从主图 datafeed 订阅状态变化
- [x] 2.3 `layout/TVStatusBar.tsx` 增加连通性 badge：实时(绿)/重连中(黄)/断开(红)，含 i18n key
- [x] 2.4 单测/渲染测试：三种状态 badge 正确呈现

## 3. 越界历史回灌 — 后端 (history-backfill / kline-ingestion)

- [x] 3.1 `backend/src/market_data/webapi.py` 新增 `POST /candles/backfill { category, symbol, timeframe, before }`，调用 `KlineIngestor.fetch_range` 向 `before` 之前分页拉取并落 `chartstore`
- [x] 3.2 在回灌逻辑中判定 `earliest_reached`（某页空或 `page_min` 不前进），响应体返回 `{ appended, earliest_reached }`
- [x] 3.3 单次回灌页数上限（防一次拉满巨量历史），支持多次调用增量向前
- [x] 3.4 同一 series 回灌串行 + 跨 series 限并发（信号量）；遇频控错误退避重试并保留已拉取分页进度
- [x] 3.5 确认 `/candles` 在回灌后能连续返回更早区间（`_read` 起止参数覆盖）
- [x] 3.6 后端测试：分页回溯落库、无更早时终止、频控退避不丢进度

## 4. 越界回灌 + 后台预取 — 前端 (history-backfill)

- [x] 4.1 `api/client.ts` 增加 `backfill(series, before)` 调用新端点
- [x] 4.2 `api/datafeed.ts` `getHistoryKLineData`：当 `from` 早于本地最早 bar 时调用 `backfill`，回灌后重新取 `/candles` 拼接；`earliest_reached` 后不再触发
- [x] 4.3 在途请求去重：对 `(category:symbol:timeframe:before)` 缓存 Promise，预取与按需共用；失败后清除缓存允许重试
- [x] 4.4 `App.handleSelect` 后触发一次后台预取当前周期额外深度（低优先、节流）
- [x] 4.5 单测：越界触发回灌并拼接、到最早停止、在途去重合并

## 5. 跨品类 symbol 消歧 + 精度统一 (market-symbol-search)

- [x] 5.1 `hooks/useTickerList.ts`：对外 `symbols` 由 `instId` 去重改为 `category:instId` 复合标识（保留展示名）
- [x] 5.2 `App.tsx` `toSymbolInfo`：按 `category:instId` 精确匹配，精度取自 instrument（`pricePrecision/volumePrecision`），移除回退 `2`
- [x] 5.3 顶栏搜索统一走 datafeed `searchSymbols`（基于 `/instruments`），删除对内存 `symbols` 的第二条路径；`TVTopBar` 搜索项携带 category
- [x] 5.4 选中携带 category 全链路传递（搜索 → setSymbol → chart 加载 → orderbook/trades/derivative 订阅）
- [x] 5.5 单测：同 instId 多品类保持独立、选中采用对应精度、搜索单一入口

## 6. 校验与回归

- [x] 6.1 `openspec validate bitget-connectivity` 通过
- [x] 6.2 前端 lint + typecheck + 相关 vitest 全绿
- [x] 6.3 后端相关 pytest 全绿
- [ ] 6.4 手动验证：拔网重连图表恢复、往前翻页持续加载、BTCUSDT 现货/合约切换精度正确、状态栏 badge 随连接变化
