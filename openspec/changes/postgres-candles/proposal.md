## Why

`postgres-checkpointer` 与 `postgres-json-stores` 已把 checkpointer、告警/图表配置/BlockBeats 缓存/事件日志迁到 PostgreSQL，Phase 2 的最后一块是 **OHLCV K 线存储**。当前 `ParquetStore` 按 `category/symbol/timeframe` 分区、**按 UTC 自然日每日一个 `.parquet` 文件**（现网 6,684 个文件仅承载 78,422 行），分区开销远大于数据本身；同时 `market-data-read-speed` 规定了一个**无界、无 TTL、按文件路径 key 的内存缓存**，需要与文件布局一同退役。

## What Changes

- `db.py` 的幂等 schema bootstrap 新增 `candles` 表 + `open_time` BRIN 索引。
- `store.py` 的 `ParquetStore` 改为 PostgreSQL 实现：**公共 API 与语义完全不变**（`save` 返回净新增 distinct bar 数、`read` 复刻"最新优先、限量即停、升序 tail"、`latest/earliest_open_time` 为 MAX/MIN、`delete` 删除该 series），仅更换存储介质。**移除**按日文件缓存 `_file_cache`——热数据交由 PostgreSQL 缓冲池/连接池，避免跨进程陈旧读。
- `save` 在单事务内用 `INSERT ... ON CONFLICT ... RETURNING (xmax = 0)` 统计净新增，保持去重合并语义。
- 新增一次性导入脚本 `scripts/import_candles_to_pg.py`（幂等、`--dry-run`、不删 Parquet、源缺失退出 0）；修复 `scripts/backfill_micro_gaps.py` 硬编码的 `Path("data/parquet")`。
- 4 处生产构造点改为注入 `Database`/`MD_POSTGRES_DSN`：`webapi.py`、`cli.py`、`agent/runtime.py`、`agent/tools.py`。
- 测试改用 conftest 既有的 `<db>_test` fixture 策略：重写 `test_store.py`（含三处缓存断言改为"数据库缓存/写入立即可见"行为断言）、`test_data_integrity.py`（目录遍历→`SELECT DISTINCT`）、以及 `test_offline` / `test_ingestion_rest` / `test_webapi` / agent 相关 tests，`conftest` 的 parquet 播种改为 DB 播种。
- `/candles` 与 `/candles/recent` 的响应形状不变（硬契约）。

## Impact

- 新增：`backend/scripts/import_candles_to_pg.py`、`openspec/changes/postgres-candles/**`。
- 修改：`backend/src/market_data/{db,store,webapi,cli}.py`、`backend/src/market_data/agent/{runtime,tools}.py`、`backend/scripts/backfill_micro_gaps.py`、`backend/tests/{conftest,agent_fakes,test_store,test_offline,test_ingestion_rest,test_data_integrity,test_webapi,test_agent_tools,test_agent_research,test_agent_runtime}.py`、`AGENTS.md`、`openspec/specs/**`（受影响的规格）。
- 排除：`excel_export.py`（`.xlsx` 仍按日文件、保持文件型）、agent 投影与 SSE（`agent/store.py`，Phase 3）、`/candles` 响应形状、Parquet 源文件（只读保留）。
- 不引入 ORM / Alembic / 声明式分区 / 新依赖。
