## 1. v3 fetcher 与配置

- [x] 1.1 `config.py` 新增 `v3_candle_page_limit: int = 100`
- [x] 1.2 `ingestion.py` 新增 `V3_HISTORY_CANDLES_URL = "https://api.bitget.com/api/v3/market/history-candles"` 常量
- [x] 1.3 `ingestion.py` 新增 `_fetch_v3_history_page(category, symbol, interval, end_ms, limit)`：请求 `category`/`symbol`/`interval`/`endTime`/`limit≤100`，非 00000 或 HTTP 429 抛 `V2RestError`，返回 `{data: [...]}` 数组（复用 `_normalize_payload`）
- [x] 1.4 `ingestion.py` 新增 `V3RestError` 或复用 `V2RestError`，`_is_rate_limited` 对 v3 频控消息命中

## 2. 回灌通道切换

- [x] 2.1 `backfill_before_rest`：顺序分支默认 fetcher 改为 v3（`_fetch_v3_history_page`），`strict`/空页重试逻辑不变，仅 v3 空页判定 earliest
- [x] 2.2 `_backfill_before_rest_parallel`：`window` 计算改用 v3 每页上限 `min(v3_candle_page_limit, 100) × step`（且不超过 90 天）
- [x] 2.3 `backfill_before_rest` 签名新增 `page_limit` 透传（v3 上限 100），默认取 `config.v3_candle_page_limit`
- [x] 2.4 `webapi.py` `/candles/backfill`：REST 优先分支传 `page_limit=v3_candle_page_limit`；MCP 回退分支不变

## 3. 测试

- [x] 3.1 `tests/test_ingestion_rest.py` 新增 v3 fetcher 用例：正常分页、HTTP 429/频控重试、错误码抛错、limit≤100 约束
- [x] 3.2 新增并行回灌 v3 用例：多页合并去重、v3 空页判 earliest、90 天区间限制不中断
- [x] 3.3 回归：既有 v2/MCP 回灌用例保持通过（`backfill_rest_fetcher` 注入点不受影响）
- [x] 3.4 后端 `pytest` 全量通过（既有 218 例 + 新增 = 224 例）

## 4. 实网验证

- [x] 4.1 实网触发 1d 深度回灌：确认可回溯至 2019-07 之前（不再停在 2022-10）→ 1d 库最早 2022-09-10 → **2019-07-09**（2290 根连续至 2026，仅 3 处数据源缺日）
- [x] 4.2 实网触发 1h/4h/1m 深度回灌：确认超过 v2 的 30/150 天深度上限，持续向更早方向推进 → 4h 至 **2019-07-18**，1h 至 **2019-11-20**，1m 每轮 1000 根持续推进（超出 v2 30 天上限后仍向前）
- [x] 4.3 边界验证：回溯至真实最早时 `earliest_reached=True` 且前端停止加载，不报错 → 1d/4h 在 before=2019-07-01（早于真实边界）时均 `appended=0, earliest_reached=True`
