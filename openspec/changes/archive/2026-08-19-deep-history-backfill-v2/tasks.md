## 1. v2 REST 历史分页回灌（核心）

- [x] 1.1 `KlineIngestor.__init__` 将 `client` 改为可选；新增 `backfill_before_rest(series, before_ms, *, max_pages, max_retries, backoff_base)` 方法：`endTime` 向前逐页拉取、每页即时 `store.save`、返回 `(appended, earliest_reached)`
- [x] 1.2 端点选择：`"FUTURES" in category` → `/api/v2/mix/market/candles` + `productType`；`SPOT` → `/api/v2/spot/market/candles`；参数 `symbol/granularity/endTime/limit=min(page_limit,200)`
- [x] 1.3 v2 降序响应归一化：`_coerce_row` 后按 `open_time` 升序排序去重再落库
- [x] 1.4 空页判定收敛：空页先退避重试一次同 `cursor_end`，仍空才 `earliest_reached=True`；`next_end` 无前向推进时终止（实测确认 v2 每页即 90 个日历日、1d 仅 ~90 根 < page_limit，**移除**"短页即判最早"）
- [x] 1.5 页间限速：每页间 `time.sleep(settings.backfill_page_delay)`（默认 0.05s），HTTP 429/频控业务码走退避重试（复用 `_is_rate_limited` 判定思路）
- [x] 1.6 `webapi.candles_backfill` `_run()` 改为：REST 路径优先，持续失败（非频控类异常）时回退 MCP `backfill_before`；保持 per-series 锁与信号量不变

## 2. 后端单测

- [x] 2.1 新增 `backend/tests/test_ingestion_rest.py`：mock httpx，验证多页向前推进、`store.save` 按页调用、最终返回 `(appended, earliest_reached=False)`
- [x] 2.2 新增：空页先重试（`sleep` 用注入 fake），重试非空继续分页；重试仍空返回 `earliest_reached=True`
- [x] 2.3 新增：短页不终止、继续向前分页，仅空页+重试判 `earliest_reached=True`
- [x] 2.4 新增：futures 端点带 `productType`、SPOT 端点不带；`limit` 上限 200
- [x] 2.5 调整 `test_webapi.py`：`/candles/backfill` 在 REST 失败时回退 MCP（mock `httpx.get` 抛错 + mock client_factory）
- [x] 2.6 回归：既有 `test_ingestion.py`/`test_webapi.py` 全部通过

## 3. 验证

- [x] 3.1 后端 `pytest`（backend 目录）全量通过（210 passed）
- [x] 3.2 实网冒烟：对 BTCUSDT 1d 调 `/candles/backfill`（`before=2024-01-01`, max_pages=10）→ 从旧边界 2025-10-31 一路回灌到 2022-10-08（交易所 USDT-M 产品真实上市边界），`earliest_reached=True` 正确；146 根连续无缺口
- [x] 3.3 前端回归（可选）：拖动越过原 90 天边界点（如 2025-11-01）能继续加载更早数据（需重启后端加载新代码后再测）

## 4. 回灌提速（方案 B，纯后端）

- [x] 4.1 `/candles/backfill` `BackfillBody.max_pages` 默认 3→10（1d 一次 ~900 天、5m ~1000 根，覆盖前端 500 根请求窗口）
- [x] 4.2 `backfill_page_delay` 默认 0.2→0.05s；`backfill_before_rest` 方法默认 `max_pages` 同步提至 10
- [x] 4.3 后端 `pytest` 回归通过（211 passed）；实网验证默认 `max_pages=10` 单次回灌 10 页直达 2022-10 真边界并补齐缺口（appended=180, earliest=True, 5.2s），500 根连续无缺口
