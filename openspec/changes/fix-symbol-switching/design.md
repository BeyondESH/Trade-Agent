## Context

前端已修复样式并验证可用（frontend-ui-fix）。当前"切换币种"失效的根因已定位：

1. `Chart.vue:100-101`：candles watch 对空数组提前 `return`，未调用 `applyData([])` 清图 → 切到无数据币种时旧币种 K 线残留（无头实测证实）。
2. Parquet 仅 `USDT-FUTURES/BTCUSDT/5m` 有数据；ETHUSDT/SOLUSDT（及 BTC/1d）`/candles` 返回空。
3. Bitget WS 流订阅全部币种，订阅时收到 `action:snapshot` 历史批次，但 `realtime.py` 只保留最后一根 bar，批次被丢弃。

## Goals / Non-Goals

**Goals:**
- 修复空数据串图 bug。
- 实时流按 series 缓存最近 N 根 bar（订阅快照 + 实时 upsert），支持批量读取。
- 前端在 `/candles` 为空时回退实时缓存，任何已订阅币种/周期切换后立即有图。
- 回归验证（单元 + 无头浏览器）。

**Non-Goals:**
- 不改变 Parquet 历史数据管道（回填历史仍由 ingestion/scheduler 负责）。
- 不做动态订阅（新增币种需重启后端沿用现状）。
- 不合并实时/历史双源渲染（本期仅回退：有存量用存量，无存量用实时缓存）。

## Decisions

### D1: realtime buffer 改为"最近 N 根"

- 结构：`dict[series_key, deque[dict]]`（容量 N=200，按 open_time 升序）。
- `snapshot` 批次：逐行 upsert（同 open_time 覆盖），末行为最新；`update` 单行同样 upsert。
- 裁剪：写入后若超过 N，从队首移除。
- 读取：`recent(category, symbol, timeframe, limit) -> list[dict]` 返回升序副本（锁保护）；`latest()` 改为 `recent(..., 1)[-1]` 或保留独立实现。

### D2: `GET /candles/recent` 端点

- 参数：`symbol`、`timeframe`、`category`（默认 USDT-FUTURES）、`limit`（默认 200，上限 500）。
- 返回与 `/candles` 同形状：`{"series": "...", "count": N, "candles": [...]}`。
- 无数据返回 `count: 0`（与 `/candles` 空语义一致，便于前端统一判断）。

### D3: 前端数据加载回退

- `App.vue` 的 `load()`：
  ```
  candles = await api.candles(series)
  if candles.count == 0:
      candles = await api.candlesRecent(series)
  ```
- `Chart.vue`：candles watch 去掉"空数组提前 return"，改为空则 `applyData([])` + `rebuildAutoOverlays()`（清理自动层），非空则正常渲染。
- `api/client.ts` 新增 `candlesRecent(s, limit=200)`。

### D4: 切周期语义

- 周期切换同样走 D3 回退：BTC/1d 无存量 → 实时缓存（流已订阅 candle1d）。
- 注意：实时缓存是滚动窗口（最近 N 根），与 Parquet 全历史语义不同，属可接受的回退展示。

## Risks / Trade-offs

- **[实时缓存窗口有限（200 根）]** → 回退展示比空图好；有存量数据的币种仍走完整历史。
- **[流未连接/未订阅时 `/candles/recent` 空]** → 前端回退仍为空图，但不再串图（比现状进步）；后续可加"数据新鲜度"提示。
- **[快照批次与 update 乱序]** → 以 open_time 为 key upsert，天然幂等。
- **[内存增长]** → 每 series 上限 200 根，3 币 × 2 周期 ≈ 1200 条，可忽略。

## Migration Plan

1. `realtime.py` buffer 改造 + `recent()`，单测（快照批次/upsert/裁剪/多 series）。
2. `webapi.py` `/candles/recent` + 单测。
3. 前端 `Chart.vue` 清图修复 + `client.ts`/`App.vue` 回退。
4. 前端单测：Chart 空数据清图、App 回退链路。
5. 无头浏览器回归：切 ETH/SOL/1d 图表有内容、不串图。

回滚：后端为增量（buffer 改造 + 新端点），前端为局部逻辑，可独立回退。

## Open Questions

- 回退窗口大小 200 是否合适？（可配置为 settings 项，本期先用常量。）
- 是否需要把"数据来源（实时回退 vs 存量）"暴露给前端显示？本期否。
