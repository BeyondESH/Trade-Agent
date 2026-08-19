## Context

实测（2026-08-19，BTCUSDT 1d，1235 个日文件）：
- `GET /candles`（`store.read` 全量 concat + 后过滤）平均 **1.6s**；前端一次懒加载调用 1-2 次。
- `POST /candles/backfill`（`backfill_before_rest` 顺序 10 页）**4.5s**；v2 REST 单页 RTT 实测 0.1-0.2s，纯串行累加。
- 前端渲染与 WS 非瓶颈。

## Goals / Non-Goals

**Goals:**
- `store.read` 宽区间读取不随日文件数线性增长；重复读 O(1)。
- 回灌 10 页耗时从 ~4.5s 降到 ~0.5s（并发 RTT 上限）。
- 不改变任何数据格式/语义/接口契约。

**Non-Goals:**
- 不改存储布局（parquet 按日分片保持）。
- 不改前端（渲染与调用链已够快，瓶颈在后端）。
- 不做多进程级缓存一致性（当前单进程写库）。

## Decisions

### D1: `ParquetStore.read` 裁剪 + 限量 + per-file 缓存

- 日期范围由 `_day_key(open_time_ms)` 映射：`start_ms/end_ms` → `YYYY-MM-DD` 字符串，与日文件名（`YYYY-MM-DD.parquet`）字典序比较裁剪候选文件。
- 反向累积：`limit` 存在时从最新日文件向旧读，累计行数 ≥ `limit` 即停（`/candles` 只取末尾）。
- 缓存：`_file_cache: dict[str, pd.DataFrame]`（键=文件绝对路径）；`save` 写入后删除对应键，`delete` 删除 series 目录下所有键。读取时 `_read_cached` 命中即用。
  - 备选：缓存整个 series 合并帧 → 拒绝：回灌后整体失效需全量重建，浪费。
  - 备选：按日分片读取不缓存 → 拒绝：拖动期反复读同区间，仍重复读盘。
- `save` 优化：某日无新行（`new_rows == 0`）跳过写盘，避免回灌重复写回已存区间；读取改用 `_read_cached`。
- 新增 `earliest_open_time`（读首日文件 min），供回灌按"仅存早于库最早 bar 的新行"裁剪，避免对已存区间逐日读改写。
- 线程安全：dict 读写为 GIL 原子操作，最坏并发双建（无害覆盖）；写入/删除的失效与读取竞态可接受（单写进程）。

### D2: `backfill_before_rest` 并行路径

- 窗口计算：`window = min(90 天, page_limit × step)`。v2 REST 每页至多返回 `endTime` 前 90 个日历日、且不超过 `limit` 根；低周期受 `limit` 约束（每页 = `page_limit×step` 时间跨度），高周期受 90 天窗口约束。
- cursor 链：`cursor_i = before_ms - i × window`（i=0..max_pages-1）。各窗口时间上不相交；数据稀疏时相邻页可能重叠 → 合并去重兜底，不丢覆盖。
- `ThreadPoolExecutor(max_workers=min(8, max_pages))` 并发执行 `fetch_one(cursor)`；首窗（cursor=before_ms）用严格 `<` 边界，其余 `<=`（保证与已存最早 bar 无缝）。
- 空页：收集空页并发重试一次（停顿 `min(backoff_base, 0.2)` 后）；最旧窗口仍空 → `earliest_reached=True`。
- 合并：`concat → drop_duplicates(open_time) → sort` 后按 `store.earliest_open_time` 裁掉已存行，一次 `store.save`（比逐页 save 更高效，且避免重写已存日文件）。
- 触发：webapi `/candles/backfill` 传 `parallel=True`；当注入 `backfill_rest_fetcher`（测试）时仍并行（现有测试 fake 均无状态/纯函数，线程安全）。
  - 备选：仅默认 httpx fetcher 并行 → 拒绝：削弱测试覆盖。
- 页大小：`_fetch_v2_page` 上限 200→1000；新增 `rest_candle_page_limit`（默认 500）作为 REST 路径 page_limit，webapi 传参。低周期（5m）单页覆盖 41.7h，10 页 17.4 天。

### D3: 端点接线

- `/candles`：`_read(..., start, end, limit)` 把 `limit` 传入 `read`（read 内部反向限量 + tail，替代端点 `.tail(limit)`）。
- `/candles/backfill`：REST 路径 `KlineIngestor(..., page_limit=settings.rest_candle_page_limit)` + `backfill_before_rest(..., parallel=True)`；MCP 回退不变。

## Risks / Trade-offs

- [并发 10 页可能触频控] → 并发上限 8、退避重试保留；触发则退避，极端情况回退 MCP。
- [并行空页（中段）在重试后仍空会留空洞] → 仅当某窗口确实无数据时发生（罕见）；合并去重保证不产生重复。
- [文件级缓存与外部写者（如另一进程）可能读到旧数据] → 单写进程部署；`save`/`delete` 均失效；如未来多进程写库需升级为 mtime 校验。
- [内存：缓存全 series 日文件帧] → 每帧仅当日行；1d 单文件 1 行、5m 288 行，内存可控。

## Migration Plan

纯后端实现优化，无数据/接口变更：
1. 合并后重启后端即生效。
2. 回滚：`git revert`（并行路径可通过 `parallel=False` 关闭，读优化可整体回退）。

## Open Questions

- 并行页并发数 8 与 `rest_candle_page_limit=500` 是否在 Bitget 频控范围内：落地后以实际回灌成功率观察，必要时调低并发或页大小。
