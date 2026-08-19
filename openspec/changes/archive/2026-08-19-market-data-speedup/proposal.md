## Why

实测一次 K 线懒加载 ≈7.7s，其中 **~42% 是本地 parquet 库读取**（`store.read` 把该 series 全部日文件 concat 后再过滤，无缓存无裁剪；1d 已有 1235 个日文件 → 每次 `/candles` 1.6s，且一次加载调用 1-2 次），**~58% 是回灌翻页串行**（`backfill_before_rest` 顺序 10 页 × RTT 0.1-0.2s → 4.5s）。前端渲染与 WS 均非瓶颈。两项优化可将单次加载压到 ~0.5s。

## What Changes

- **`ParquetStore.read` 提速**：
  - 读前按 `[start,end]` 裁剪候选日文件（不再全量 concat）。
  - 支持 `limit`：最新优先反向累积，够 `limit` 即停。
  - per-file 内存缓存（`save`/`delete` 时失效对应文件），重复读接近 O(1)。
  - `/candles` 端点把 `limit` 传入 `read`。
- **`backfill_before_rest` 翻页并行化**：
  - v2 REST 每页窗口固定（`min(90 天, page_limit×step)`），按此预计算 cursor 链，`ThreadPoolExecutor` 并发拉取，合并时按 `open_time` 去重排序落库。
  - 空页并发重试一次；最旧窗口仍空 → `earliest_reached=True`。
  - REST 页大小上限提到 1000（`rest_candle_page_limit` 默认 500），低周期单页覆盖更广。
- 前端/渲染/WS 不改。

## Capabilities

### New Capabilities
- `market-data-read-speed`: 本地 parquet 库读取与历史回灌的速度特性——按需裁剪日文件、反向限量读取、文件级缓存、回灌页并行拉取。

### Modified Capabilities
<!-- 无：history-backfill / market-data-store 的既有需求语义不变，仅实现提速。 -->

## Impact

- `backend/src/market_data/store.py` — `read` 裁剪/限量/缓存 + 缓存失效（核心）。
- `backend/src/market_data/ingestion.py` — `backfill_before_rest` 并行路径、页大小上限。
- `backend/src/market_data/webapi.py` — `/candles` 传 `limit`；`/candles/backfill` 传 `parallel=True`、REST 页大小设置。
- `backend/src/market_data/config.py` — 新增 `rest_candle_page_limit`。
- `backend/tests/` — store 读取缓存/限量、并行回灌新测试。
