## Context

实时 K 线链路当前两条数据源彼此独立：

```
Bitget WS ──► stream buffer (内存, MAX 200 根/series)   ← 实时完整
                    │
   webapi lifespan 不启动增量落盘 scheduler ── 不写 parquet
                    │
  parquet store ── 只靠 CLI `schedule` 命令手动增量拉取
                    │
  前端 getHistoryKLineData ── fetchStored(→/candles 读 parquet)
       └─ 只要 store 有数据就返回，绝不合并 buffer → gap 透传图表
```

实测：BTCUSDT 1h 的 store 停在 8/19 09:00（`2026-08-19.parquet` 2 根，`2026-08-20.parquet` 缺失），buffer 有 08-12 ~ 08-20 10:00 完整数据。图表因此显示 8/19 09:00 后直接跳 8/20 09:00。

约束：`build_scheduler`/`run_incremental_pull` 已存在于 `scheduler.py`（供 CLI 使用），`schedule_interval_seconds` 默认 300s 已配置；`KlineIngestor.ingest_incremental(series, start_ms, end_ms)` 是现成的增量拉取入口。后端测试用 `TestClient` 的 lifespan 会被触发（`create_app` 已接受 `stream`/`market` 等注入）。

## Goals / Non-Goals

**Goals:**
- 后端在 webapi 运行时周期落盘实时 buffer → parquet，store 与实时不再长期脱节。
- 前端加载历史时合并 store 与 buffer，使图表时间序列始终连续（不显示空洞）。
- 补齐当前 BTCUSDT 1h 的 8/19-8/20 gap。

**Non-Goals:**
- 不改实时保序逻辑（上一 change 已覆盖）。
- 不重写 REST 历史/回填主链路。
- 不为所有 symbol/timeframe 全量补历史（仅对当前报告的 BTCUSDT 1h 回填，其余靠新落盘机制自然补齐）。

## Decisions

### 1. 后端：lifespan 启动增量落盘 scheduler（而非仅依赖手动 CLI）
在 `create_app` 的 `_lifespan` 中启动 `build_scheduler(ingestor, settings)`（与 CLI `schedule` 相同），shutdown 时停止。选择理由是：webapi 是常驻服务，手动 CLI 不可持续；`build_scheduler` 已封装好错误隔离（单目标失败仅记日志）。
- 备选（弃用）：在 stream 收到新 bar 时同步写 parquet —— 高频写盘 + 与 store 的去重/分区逻辑耦合，风险高。
- 备选（弃用）：让 buffer 与 store 在 `/candles` 端点合并 —— 治标不治本，且每次读都要扫描 buffer。

### 2. 前端：`getHistoryKLineData` 合并 buffer 到 store 结果
在 `fetchStored` 返回非空后，额外调用 `api.candlesRecent(series, 500)` 取 buffer，将其中 `open_time > store 尾部` 的 bar 追加到结果尾部（用 `normalizeBackwardList` 去重/排序保证语义不变）。这是兜底层：即使后端落盘延迟，图表也不显示 gap。
- 备选（弃用）：让前端只信 `/candles/recent` —— 丢失深历史，向左拖动会缺数据。
- 注意：`applyMoreData` 语义要求返回列表升序且无重复，合并必须保持 `timestamp` 严格升序去重。

### 3. 回填当前 gap：直接用现有 backfill 端点
对 `BTCUSDT/1h` 调 `POST /candles/backfill`（v3 REST 全量历史，`before` 取当前时刻），补齐 8/19-8/20 缺失段。该端点已有 `backfill_before_rest` 实现与锁/信号量，无需新代码。
- 备选（弃用）：手动写 SQL/pandas 拼数据 —— 重复造轮子且易错。

### 4. 测试策略
- 后端单测：断言 lifespan 启动 scheduler（或 `run_incremental_pull` 被调用）；`/candles` 返回含 buffer 合并后的连续序列。
- 前端单测：`getHistoryKLineData` 在 store 有旧数据 + buffer 有新数据时，返回含 gap 段补齐的升序列表。
- 端到端验证：重跑 Playwright 诊断脚本确认图表无 gap（数据列连续升序）。

## Risks / Trade-offs

- [lifespan 启动 scheduler 后，默认每 5 分钟对配置的 symbol×timeframe 做一次 REST 拉取] → 请求量可控（默认 3 symbols × 8 timeframes）；`max_instances=1`+`coalesce=True` 防重叠；若 Bitget 限流，`run_incremental_pull` 已按目标隔离异常。
- [前端合并 buffer 增加一次 `/candles/recent` 调用] → 已有 200/500 上限，量小；仅首次/滚窗加载触发。
- [合并可能引入重复 bar] → 用 `normalizeBackwardList` 排序去重，且仅追加 `open_time > store 尾部` 的 bar。
- [回填与运行中 scheduler 并发写同一 parquet] → `store.save` 按天分区合并去重（`drop_duplicates(subset=open_time)`），幂等。
- [后端测试里 lifespan 触发 scheduler 可能引入网络请求] → 测试注入 fake `stream`/`market`，并让 scheduler 间隔足够长或注入 mock ingestor。

## Migration Plan

1. 部署代码（后端 webapi + 前端 datafeed）。
2. 重启后端：scheduler 随 lifespan 启动，开始周期落盘。
3. 对 BTCUSDT 1h 执行一次 `/candles/backfill` 回填 gap。
4. 前端刷新：图表加载时合并 buffer，gap 消失。
5. 回滚：若 scheduler 引发异常，仅需在 lifespan 中注释掉启动代码并重启；前端合并逻辑可单独回滚。

## Open Questions

- 增量拉取使用的 `KlineIngestor` 需要 MCP client（`McpDataClient(settings.mcp_command, settings.mcp_args)`）——CLI 里是这么构造的。webapi 环境里 `npx` MCP 是否可达？若不可达，`ingest_incremental` 走 REST 回退（`_fetch_v3_history_page`/v2），需确认 `backfill_before_rest` 的 fallback 链在无 MCP 时仍可用。
  - **已解决**：webapi 采用新增的 `run_incremental_pull_rest`（纯 v3 REST，无 MCP/npx 依赖），实测从后端环境可直达 `api.bitget.com` v3 端点。

## 实证结论

- 回填：对 BTCUSDT 1h 执行 `run_incremental_pull_rest` 后，磁盘 store 生成 `2026-08-20.parquet`，8/19-8/20 段写入；前端图表 8/19 00:00 → 08/20 02:00 UTC 窗口 27 根连续（原 23 小时 gap 消失）。
- 前端合并：`getHistoryKLineData` 现合并完整 buffer 到 store（排序去重），不仅追加尾部——修复了「store 尾部比缺口新」的中间段缺口场景。
- 已知残留：历史中存在极少量单点缺根（如 08-06 14:00 UTC 一根），属历史采集质量问题，不在本次核心范围内；`run_incremental_pull_rest` 无法覆盖 buffer 范围外的深历史缺根，如需可对历史段单独跑 v3 回填。
- 运行中后端（`market-data serve`）为旧代码，其 ParquetStore 进程内 `_file_cache` 保持旧数据；**重启后端**后 lifespan 将启动 `build_rest_scheduler` 持续落盘并刷新缓存。

