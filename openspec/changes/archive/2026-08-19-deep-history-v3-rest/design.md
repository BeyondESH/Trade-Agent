## Context

- 深度回灌当前实现：`backend/src/market_data/ingestion.py` 中 `backfill_before_rest` 使用 Bitget v2 `/api/v2/mix/market/candles`（`_fetch_v2_page`），endTime cursor 翻页，limit≤1000，并行版本预计算 cursor 链（window=`min(90天, page_limit×step)`）。
- 实测问题：v2 `candles` 对 1m/1h 仅返回最近 ~30 天、4h ~150 天、1d ~2022-10 的数据，更早的 endTime 一律返回空 `data`。这些空页被 `_backfill_before_rest_parallel` 判定为 `oldest_empty=True` → 前端 `exhausted`，停止加载。
- Bitget v3 `/api/v3/market/history-candles` 实测可回溯到 2019-07（BTCUSDT USDT-M 上市边界），规则：limit≤100、单次 startTime/endTime 区间≤90 天（超限报 `00001 startTime and endTime interval cannot be greater than 90 day`）、20 req/s 频控。
- 相关依赖：`config.py` 已有 `rest_candle_page_limit=500`、`backfill_page_delay`；`webapi.py` 的 `/candles/backfill` 通过 `backfill_rest_fetcher` 注入点传递 `parallel=True` + page_limit。

## Goals / Non-Goals

**Goals:**
- 深度回灌切换为 v3 `history-candles`，各受支持周期均可回溯至交易所真实最早历史（2019-07 起）。
- `earliest_reached` 判定仅基于 v3 深历史通道的空页，与 v2 深度上限解耦。
- 并行回灌按 v3 每页 100 根计算 cursor 间隔，保持现有"一次回灌多页→合并→一次落库"的结构与频控退避。
- 保持 `/candles/backfill` REST 优先 + MCP 回退的端点契约不变（前端零改动）。

**Non-Goals:**
- 不改变前端 datafeed 逻辑、图表组件、存储模型（Parquet 按日分文件）与 MCP 回退路径。
- 不做全量历史一次性回灌的 UI 或编排改动（懒加载渐进式不变）。
- 不引入新依赖；仅新增 v3 端点常量与 fetcher。

## Decisions

### D1: v3 `history-candles` 作为深度回灌主通道（新增 fetcher，不替换 v2 通道）

- 新增 `_fetch_v3_history_page(category, symbol, interval, end_ms, limit)`：请求 `GET /api/v3/market/history-candles`，参数 `category`、`symbol`、`interval`、`endTime`、`limit≤100`；响应结构与 v2 相同的 `{data: [[ts,o,h,l,c,v], ...]}` 数组，可复用 `_normalize_payload`。
- `interval` 复用 `timeframe_to_granularity`（`1D/1H/4H/1m` 等，v3 也接受该命名，实测一致）。
- 保留 v2 `_fetch_v2_page` 用于 MCP 回退（webapi 注入点）与近期窗口场景，不在本 change 中删除。
- 备选：原地修改 `_fetch_v2_page` 的 URL 指向 v3 → 拒绝：v2/v3 参数名不同（`productType` vs `category`）、limit 上限不同（1000 vs 100），混合会引入隐性错误；独立 fetcher 更清晰、可独立测试。

### D2: cursor 间隔按每页 100 根计算

- v3 单次最多 100 根，`window = min(90*86_400_000, 100 * step)`：
  - 1d：100 天（小于 90 天上限时取 min → 实际 90 天窗口只能装 90 根，cursor 链按 90 天间隔，页间略有重叠由去重吸收）。
  - 1h：100 小时 ≈ 4.2 天；1m：100 分钟。
- 并行版本 cursor 链间隔改为该 window；顺序版本每页自然按 `endTime=oldest-1` 前进，无需改动。
- 与 D1 同处 `_backfill_before_rest_parallel` 的 `window` 计算：`page_limit` 参数传入 v3 上限（`min(rest_candle_page_limit, 100)`）。

### D3: earliest_reached 判定基于 v3 空页

- 现有 `_backfill_before_rest_parallel` 的 `oldest_empty` 逻辑保持，但 fetcher 换成 v3（可无限回溯），空页重试一次后仍空 ⇒ 真实最早。
- 顺序版本 `backfill_before_rest` 的空页重试判定同样只针对 v3 fetcher。
- v2 通道的深度空页问题通过"D1 主通道切换"自然消除，无需额外分支。

### D4: 配置项

- `config.py` 新增 `v3_candle_page_limit: int = 100`（对齐 v3 上限），`webapi.py` 的 `/candles/backfill` REST 路径传入该值替代 `rest_candle_page_limit`（v2 的 500 仅用于 MCP 回退不再用于 REST）。
- 保留 `rest_candle_page_limit` 配置，避免破坏其他引用（测试）。

### D5: 频控与错误处理

- 复用 `_call_v2_with_backoff` / `V2RestError` 模式：新增 fetcher 抛 `V2RestError`（代码 429 或 `_RATE_LIMIT_HINTS` 命中即频控），退避逻辑不变。
- 20 req/s 限制下并行 8 worker 安全；`backfill_page_delay` 在顺序模式保留。

## Risks / Trade-offs

- [v3 单页仅 100 根，分钟级全量翻页量大] → 懒加载渐进式：每次 `/candles/backfill` 只拉 max_pages(默认 10) 页 = 1000 根，用户拖动持续触发；并行 8 worker 下 1m 每轮耗时仍 <1s。
- [v3 端点稳定性未知（对比 v2）] → 保留 v2/MCP 回退路径；v3 失败抛 `V2RestError` 后由 webapi 回退逻辑接管。
- [并行 cursor 链页间重叠/缺口] → 重叠由 `drop_duplicates(open_time)` 吸收；缺口由各页 endTime 锚定保证（每页含 endTime 前 100 根，锚点按上页最旧-1 前进）。
- [earliest 判定回归] → 新增单测覆盖：v3 空页判 earliest、v2 深度上限不再触发 earliest、90 天超限分段。

## Migration Plan

- 纯后端改动，无数据迁移；部署后重启服务即生效。
- 回滚：恢复 `ingestion.py` 中 fetcher 指向 v2 常量即可（保留 v2 代码路径）。
