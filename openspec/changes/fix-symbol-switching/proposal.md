## Why

切换币种（ETH/SOL）或周期（1d）时图表不可用，由两个问题叠加导致：① `Chart.vue` 的 candles watch 在空数组时提前 return，切到无数据币种后**旧币种 K 线残留在图上**（实测 header 已变 ETHUSDT 但 canvas 像素与 BTC 完全一致）；② 仅有 BTCUSDT/5m 有存量 Parquet 数据，ETH/SOL 及 BTC/1d 的 `/candles` 返回空 → 即使修了串图也只是空图。而实时 WS 流本就订阅全部币种并在订阅时收到历史快照批次，但当前 `realtime.py` 只保留最后一根 bar，历史批次被丢弃。

## What Changes

- 修复 `Chart.vue`：candles 为空数组时调用 `applyData([])` 清空图表，杜绝串图。
- `realtime.py`：每 series 缓存最近 N 根（默认 200）bar（订阅快照批次 + 实时更新 upsert），新增 `recent()` 读取。
- `webapi.py`：新增 `GET /candles/recent` 端点，从实时流缓存返回最近 K 线（与 `/candles` 同形状）。
- 前端：数据加载时 `/candles` 为空则回退 `/candles/recent`，使无存量数据的币种/周期也能立即显示实时 K 线。
- 回归：无头浏览器验证切换币种/周期后图表正确更新且不串图。

## Capabilities

### New Capabilities

（无新增能力。）

### Modified Capabilities
- `bitget-realtime-stream`: 从"每 series 保留最新一根 bar"扩展为"保留最近 N 根 bar 缓存并支持批量读取"。
- `market-endpoints`: 新增实时缓存 K 线读取端点（`GET /candles/recent`），数据来源扩展为实时流缓存。
- `charting`: 图表在数据为空时清空而非残留旧数据；无存量数据时可用实时引导数据渲染。

## Impact

- `backend/src/market_data/realtime.py`：buffer 从单 bar 改为最近 N 根（快照批次 + 更新 upsert + 裁剪），新增 `recent()`。
- `backend/src/market_data/webapi.py`：新增 `/candles/recent` 端点。
- `frontend/src/components/chart/Chart.vue`：空 candles 清图。
- `frontend/src/App.vue`、`src/api/client.ts`：数据加载回退逻辑。
- 测试：后端 realtime/webapi 单测增补；前端 Chart 空数据清图 + App 回退链路测试；无头浏览器回归。
- 不影响：Parquet 存储、风控执行、AI Agent 层。
