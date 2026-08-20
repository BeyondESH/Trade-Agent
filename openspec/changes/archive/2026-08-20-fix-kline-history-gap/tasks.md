## 1. 后端增量落盘

- [x] 1.1 在 `webapi.py` lifespan 中启动 `build_rest_scheduler(store, settings)`，shutdown 时 `scheduler.shutdown(wait=False)`
- [x] 1.2 采用 REST-only 增量任务 `run_incremental_pull_rest`（v3 历史端点），无 MCP/npx 依赖
- [x] 1.3 补充后端单测：REST 增量补 gap、已最新时跳过、失败隔离、scheduler 注册

## 2. 前端 buffer 合并

- [x] 2.1 在 `datafeed.getHistoryKLineData` 的 store 非空分支，追加调用 `api.candlesRecent(series, 500)` 并合并 `open_time > store 尾部` 的 bar
- [x] 2.2 用 `normalizeBackwardList` 保证合并结果升序去重
- [x] 2.3 补充前端单测：store 缺段时返回连续升序序列；store 完整时不引入重复；buffer 失败时回退 store

## 3. 回填当前 gap

- [x] 3.1 用 `run_incremental_pull_rest`（v3 REST 增量）回填 BTCUSDT 1h store：`2026-08-20.parquet` 生成，8/19-8/20 段写入磁盘
- [x] 3.2 验证 `/candles` 与磁盘 store 覆盖 8/19 00:00 → 当前时刻连续；前端图表 8/19-8/20 窗口 27 根连续（原 23h gap 已补）

## 4. 验证

- [x] 4.1 后端全量 pytest（243 通过）、前端 `npm run test`（239 通过）+ `typecheck` 全绿
- [x] 4.2 重跑 Playwright 诊断脚本：图表数据列 500 根严格升序无 gap（8/19-8/20 窗口 27 根连续）
- [x] 4.3 在 change 记录修复结论，供归档同步主 specs
