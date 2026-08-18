## 1. 后端实时缓存改造

- [x] 1.1 `realtime.py`：buffer 从单 bar 改为每 series `deque`（容量 200），`snapshot` 批次逐行 upsert、`update` 同 open_time 覆盖，超出裁剪
- [x] 1.2 `realtime.py`：新增 `recent(category, symbol, timeframe, limit)` 返回升序副本；`latest()` 复用或保留
- [x] 1.3 `tests/test_realtime.py` 增补：快照批次缓存、update upsert、同 open_time 覆盖、裁剪上限、多 series 隔离、`recent()` 空与有数据

## 2. 后端端点

- [x] 2.1 `webapi.py`：新增 `GET /candles/recent`（symbol/timeframe/category/limit，返回与 `/candles` 同形状）
- [x] 2.2 `tests/test_webapi.py` 增补：注入带缓存/空缓存的 stream，断言 `/candles/recent` 返回形状与空语义

## 3. 前端修复与回退

- [x] 3.1 `Chart.vue`：candles watch 空数组时调用 `applyData([])` + `rebuildAutoOverlays()` 清空图表（移除提前 return）
- [x] 3.2 `api/client.ts`：新增 `candlesRecent(s, limit=200)` 方法与类型
- [x] 3.3 `App.vue` `load()`：`/candles` 为空时回退 `/candles/recent`；切币种/周期时沿用

## 4. 前端测试

- [x] 4.1 Chart 测试：candles 由非空变为空时断言 `applyData([])` 被调用（清图）
- [x] 4.2 App/回退链路测试：mock candles 空 + candlesRecent 有数据，断言回退调用与图表数据
- [x] 4.3 `transform`/client 测试不受影响回归

## 5. 无头浏览器回归

- [x] 5.1 起全栈，无头浏览器依次点击 ETHUSDT/SOLUSDT/切换 1d，断言 header 同步、图表 canvas 有内容、不残留上一币种数据
- [x] 5.2 全量回归：`npm run typecheck`、`npm run build`、`npm test`、后端 `pytest`
