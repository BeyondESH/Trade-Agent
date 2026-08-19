## 1. 本地库读取提速（store.read）

- [x] 1.1 `store.py`：`read` 增加 `limit` 参数；按 `[start_ms,end_ms]` 映射日期裁剪候选日文件
- [x] 1.2 `read` 反向限量：有 `limit` 时从最新日文件累积至 `limit` 即停，返回区间内末尾 `limit` 根升序
- [x] 1.3 `store.py` 新增 `_file_cache` 与 `_read_cached`；`save`/`delete` 失效对应文件缓存；`save` 无新行跳过写盘；新增 `earliest_open_time`
- [x] 1.4 `webapi.py` `/candles`：`_read(..., limit)` 传入 `read`，去掉端点 `.tail(limit)` 重复裁剪

## 2. 回灌翻页并行化

- [x] 2.1 `ingestion.py` `_fetch_v2_page` 上限 200→1000
- [x] 2.2 `config.py` 新增 `rest_candle_page_limit: int = 500`
- [x] 2.3 `ingestion.py` `backfill_before_rest` 增加 `parallel` 分支：预计算 cursor 链（`min(90天, page_limit×step)` 间隔）、`ThreadPoolExecutor(min(8,max_pages))` 并发拉取、空页并发重试一次（停顿 ≤0.2s）、最旧窗口空→`earliest_reached=True`、合并去重排序一次落库；合并/分页按 `store.earliest_open_time` 裁剪仅存新行
- [x] 2.4 `webapi.py` `/candles/backfill`：REST 路径传 `page_limit=rest_candle_page_limit` + `parallel=True`；MCP 回退不变

## 3. 测试

- [x] 3.1 `tests/test_store.py` 新增 5 例：区间裁剪、反向限量、缓存命中、save/delete 失效
- [x] 3.2 `tests/test_ingestion_rest.py` 新增并行回灌：多页并发合并去重、最旧窗口空判 earliest
- [x] 3.3 后端 `pytest` 全量通过（218 passed）
- [x] 3.4 实网验证：`/candles` 1d 1599ms→17ms（热，冷 607ms）；`/candles/backfill` 10 页 4.5s→0.83s；单次懒加载 ≈7.7s→≈0.85s
