## Context

后端回灌链路：`POST /candles/backfill`（`webapi.py:258`）→ `KlineIngestor(client, store, page_limit=settings.candle_page_limit=100)` → `backfill_before(series, before, max_pages=3)` → MCP 桥 `candlesHistory` → Bitget `/api/v3/market/history-candles`。

该 v3 历史接口文档化限制为**仅最近 90 天**（SDK `chunk-FSYROE5S.js` 内嵌 OpenAPI：`getKlineCandlestickHistory` → "within the last 90 days"）。本地 1d store 最早停在 2025-10-31 即由此造成（1 月底某次回灌恰好灌满 90 天窗口）。

另 `backfill_before`（`ingestion.py:150-166`）对**空页**与**不足页**一律 `return (appended, True)`（earliest_reached）。空页可能来自访问窗口边界、接口抖动、频控，未必是真正的数据尽头；前端 `exhausted` 后该 series 会话内不再回灌。

后端已有直连 Bitget v2 REST 的先例：`_seed_candles_from_rest`（`webapi.py:197`，`/api/v2/mix/market/candles`、无鉴权、limit≤200）。v2 REST 对 futures 历史深度无 90 天限制，可作为回灌的深度数据源。

## Goals / Non-Goals

**Goals:**
- 回灌可突破 90 天窗口，持续向前分页直到交易所真正的最早数据。
- `earliest_reached` 只在确认数据边界时返回，临时空页不终止回灌。
- REST 失败时回退 MCP 路径，保证既有能力不退化。
- 复用现有 per-series 锁 + 并发信号量限流；页间限速防止频控。

**Non-Goals:**
- 不改前端（`fix-kline-history-lazy-load` 已覆盖空区间与 `earliest_reached` 处理）。
- 不替换 scheduled incremental 拉取（`ingest_incremental`）的数据源；仅改按需回灌。
- 不做历史数据一次性全量迁移（受限于页数上限与频控，回灌仍是按需渐进式）。
- 不改 `fetch_range` 的 MCP 使用（保留既有能力）。

## Decisions

### D1: `KlineIngestor` 新增 `backfill_before_rest(series, before_ms, *, max_pages, max_retries, backoff_base)` 方法

与 `backfill_before` 同构（cursor 向前、每页即时落库、返回 `(appended, earliest_reached)`），但数据源为 httpx 直连 v2 REST：

```
cursor_end = before_ms
for _page in range(max(1, max_pages)):
    rows = fetch_page_v2(category, symbol, granularity, cursor_end, page_limit)
    frame = normalize + filter open_time < cursor_end
    if frame.empty:
        # D3: 退避重试一次，仍空 → earliest_reached=True
        if not _retry_once(...): return appended, True
        continue
    appended += store.save(series, frame)
    page_min = frame.open_time.min()
    if len(frame) < page_limit:
        return appended, True          # 真到最早（数据稀疏/尽头）
    next_end = page_min - step
    if next_end >= cursor_end or next_end < 0:
        return appended, True
    cursor_end = next_end
return appended, False
```

- 端点选择（D1a）：`"FUTURES" in category` → `https://api.bitget.com/api/v2/mix/market/candles` + `productType=category`；`category == "SPOT"` → `https://api.bitget.com/api/v2/spot/market/candles`。与 `_seed_candles_from_rest` 完全一致。
- 参数：`symbol`、`granularity`（`timeframe_to_granularity`）、`endTime=str(cursor_end)`、`limit=min(page_limit, 200)`（沿用 seed 的 200 上限，v2 允许更大但保持保守）。
- v2 返回数组按时间**降序**；统一用 `KlineIngestor._coerce_row` 归一化后**升序排序去重**再落库（`store.save` 幂等去重）。

### D2: `/candles/backfill` 端点优先 REST、失败回退 MCP

`webapi.candles_backfill` 中 `_run()` 改为：

```
with series_lock, backfill_sem:
    ingestor = KlineIngestor(store, page_limit=settings.candle_page_limit)
    try:
        return ingestor.backfill_before_rest(series, body.before, max_pages=body.max_pages)
    except Exception as exc:   # REST 持续失败 → 回退 MCP
        logger.warning("REST backfill failed, falling back to MCP: %s", exc)
        with client_factory() as client:
            return KlineIngestor(client, store, ...).backfill_before(series, body.before, max_pages=body.max_pages)
```

- `KlineIngestor.__init__` 的 `client` 改为可选（REST 路径不需要 MCP client）；MCP 路径仍原样。
- 备选：把"REST/MCP"做成策略注入端点测试 → 拒绝：增加抽象层，测试 mock httpx 已足够，保持简单。

### D3: 空页判定收敛（`earliest_reached` 语义修正）

实测确认 v2 REST 的窗口**锚定在 `endTime`**（每页返回其前 90 个日历日的蜡烛；1d 周期下每页仅约 90 根 < page_limit），因此**短页不是"到最早"的信号**——短页是常态。改为：
- 空页（或非 2xx/业务码异常）**不立即**判"已到最早"：`time.sleep(backoff_base)` 后退避重试同一 `cursor_end` 一次；重试仍空 → `(appended, True)`；重试非空 → 继续分页。
- **移除** `len(page) < page_limit` 即判最早的分支；分页靠 `endTime` 锚定窗口逐 90 天向前推进，穿越任意深度，直至空页确认真正边界。
- `next_end` 无前向推进或越界时仍终止（防死循环）。

### D4: 页间限速与复用现有限流

- 每页之间 `time.sleep(settings.backfill_page_delay)`（默认 0.05s，可配 0 关闭），避免连击 v2 频控。
- 复用现有 `backfill_locks`（per-series）与 `backfill_sem`（跨 series 并发 2）。
- `_is_rate_limited`/退避重试逻辑复用（REST 路径把 HTTP 429/业务码"429xxx"映射到同一判定）。
- 端点默认 `max_pages` 3→10：1d 一次约 900 天、5m 约 1000 根，单次回灌足以覆盖前端 500 根后向请求窗口，减少拖动往返。

### D5: 保持 MCP 路径原样可用

`backfill_before`（MCP）不改动，作为 REST 失败的兜底；其 90 天限制在兜底语义下可接受（尽力而为）。前端无需感知来源差异——只消费 `{appended, earliest_reached}`。

## Risks / Trade-offs

- [v2 REST 数据量与深度未实测（理论上无 90 天限制，需验证 BTCUSDT 历史到底）] → 落地第一步用真实网络跑一次 `backfill_before_rest`（任务含冒烟验证），确认可越过 90 天窗口。
- [v2 REST 对 futures 是否同样限制访问窗口存在不确定性] → 已实测确认存在 endTime 锚定的 90 天窗口（每页 90 个日历日），但可通过 endTime 前移穿越任意深度；本设计的空页终止 + 页间 cursor 推进即为此形态设计。
- [REST 空页判定仍可能误判（稀疏成交短页）] → 已移除"短页即最早"，仅空页+重试判最早；若极端稀疏导致偶发空页，空页重试已覆盖。
- [MCP 兜底仍受 90 天限制，REST 全挂时用户退回现状] → 可接受（尽力而为），日志明确告警以便运维介入。
- [直连 REST 绕过 MCP 桥的鉴权/封装] → v2 历史 candles 为公开无鉴权接口（`_seed_candles_from_rest` 已使用），无凭据暴露风险。

## Migration Plan

后端改动、无 DB schema/数据迁移：
1. 先合并 ingestion/webapi 改动（REST 主路径 + MCP 回退），默认 `backfill_page_delay=0.2s`。
2. 用真实网络对 BTCUSDT 1d 执行一次 `/candles/backfill`（before 设到 1 年前），验证返回数据越过 90 天窗口、`earliest_reached` 正确。
3. 回滚：`git revert`；端点行为退回 MCP 路径即可（REST 失败自动回退 MCP，天然兼容）。

## Open Questions

- ~~v2 REST futures 的历史深度是否确有 90 天以上~~ → 已实网验证：存在 **endTime 锚定**的 90 天窗口，且 `endTime` 有下界（< 2023-01-01 返回空）——即 BTCUSDT USDT-M 期货产品**真实历史始于 2022-10**（产品上市边界）。回灌已从旧边界 2025-10-31 一路走到 2022-10-08，`earliest_reached=True` 是正确的终止状态。
- 每页仅 90 个日历日。端点默认 `max_pages` 已提至 10（约 900 天/次、1d），覆盖前端 500 根请求窗口；"加载触发时机"（拖到空白才触发）与"内联等待回灌"的 UX 优化属后续变更（kline-history-preload），本次不做。
