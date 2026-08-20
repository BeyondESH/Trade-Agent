## Why

1h K 线在 8/19 09:00（北京时间）与 8/20 09:00 之间整整缺失 24 根小时蜡烛。实测确认：parquet store 停在 8/19 09:00（`2026-08-19.parquet` 仅 2 根、`2026-08-20.parquet` 缺失），而实时 buffer 有完整数据（`/candles/recent` 返回 08-12 ~ 08-20 10:00）。根因有两层：(1) webapi 运行时从不启动增量落盘 scheduler，实时 buffer 不写 parquet，历史只靠手动 CLI 拉取；(2) 前端 `fetchStored` 只要 store 返回非空就直接用，gap 段不合并 buffer，导致图表把 gap 直接透传。

## What Changes

- **后端**：`webapi.py` lifespan 启动 `build_scheduler`（增量落盘），让实时 buffer 周期写入 parquet，避免 store 长期停在历史时刻。
- **前端**：`datafeed.getHistoryKLineData` 在 `fetchStored` 返回非空时，将 `[store 尾部, to]` 区间的 buffer 数据合并进结果，补齐 store 与实时之间的 gap（兜底，即使后端落盘延迟也不显示空洞）。
- **回填**：对当前已存在的 gap（BTCUSDT 1h 8/19-8/20）执行一次 backfill 补齐数据。
- 不涉及：实时保序防护（已由上一 change 处理）、REST 历史/回填主链路。

## Capabilities

### New Capabilities
- `kline-history-gap-fill`: 图表历史数据 gap 补齐能力——后端启动增量落盘、前端合并实时 buffer 到 store 结果，确保任何时刻图表时间序列连续。

### Modified Capabilities
- `scheduled-ingestion`: 定时增量拉取任务原先仅在 CLI `schedule` 命令中启动；现新增在 webapi 常驻运行时（lifespan）启动同一 scheduler，使实时数据持续落盘 parquet。

## Impact

- 后端：`backend/src/market_data/webapi.py`（lifespan 启动 scheduler）、可能 `scheduler.py`。
- 前端：`frontend/src/api/datafeed.ts`（`getHistoryKLineData` 合并 buffer）。
- 依赖：无新增；`schedule_interval_seconds` 已有配置（默认 300s）。
- 运行影响：webapi 启动后会周期性执行增量拉取（REST），对 Bitget 公共端点产生低频请求（默认每 5 分钟）。
