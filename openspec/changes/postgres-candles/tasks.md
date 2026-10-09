## 1. DB 基础

- [x] 1.1 `db.py` SCHEMA_SQL 新增 `candles` 表（`(category,symbol,timeframe,open_time)` 主键，OHLCV double precision）
- [x] 1.2 新增 `candles_open_time_brin` BRIN 索引（`open_time`）
- [x] 1.3 复用既有 advisory-lock + 单事务 bootstrap，不新增依赖

## 2. store 迁移

- [x] 2.1 `store.py`：`ParquetStore` 改 PostgreSQL，公共 API/语义不变（构造改为 `Database`/`dsn`）
- [x] 2.2 `save`：单事务 UPSERT，`RETURNING (xmax = 0)` 统计净新增；frame 内按 open_time 去重 keep=last
- [x] 2.3 `read`：`ORDER BY open_time DESC LIMIT n` 后反转；`limit=None` 升序全量；空结果返回带列空 DataFrame
- [x] 2.4 `latest/earliest_open_time` → `MAX`/`MIN`；`delete` → 删除该 series
- [x] 2.5 移除 `_file_cache`（改用 PostgreSQL 缓冲池；无跨进程陈旧读）

## 3. 构造点与脚本

- [x] 3.1 `webapi.py` → `ParquetStore(database)`；`cli.py` / `agent/runtime.py` / `agent/tools.py` → `ParquetStore(dsn=...)`
- [x] 3.2 新增 `scripts/import_candles_to_pg.py`（幂等、`--dry-run`、不删源、源缺失退出 0）
- [x] 3.3 `scripts/backfill_micro_gaps.py` 去掉硬编码 `Path("data/parquet")`，改用 DB store

## 4. 测试

- [x] 4.1 `conftest.py`：`_DB_TABLES` 加 `candles`；`seed_store` / `live_server` 改为 DB 播种并注入测试 DSN
- [x] 4.2 重写 `test_store.py`（含三处缓存测试→新行为断言；新增净新增/去重/dtype 用例）
- [x] 4.3 `test_data_integrity.py`：`_discover_series` 改 `SELECT DISTINCT`；无 Postgres 时跳过
- [x] 4.4 `agent_fakes.seeded_store` 及 `test_agent_{tools,research,runtime}.py` 改用测试库
- [x] 4.5 `test_offline.py` / `test_ingestion_rest.py` / `test_webapi.py` 改用测试库
- [x] 4.6 全量回归：`pytest -q -m "not integrity and not live and not online"`（291 → 298 passed）；`ruff check`/`ruff format --check` 干净
- [x] 4.7 `pytest -m integrity` 对 DB 运行（165 运行 / 147 passed / 18 failed，18 项为数据侧结构性缺口白名单漂移，与迁移前 Parquet 判定一致）

## 5. 导入与验收

- [x] 5.1 一次性导入 78,422 行，`SELECT count(*) = 78422`；二次运行行数不变（幂等）
- [x] 5.2 行为等价：对真实 series 对比 DB 与 Parquet 的 `read(limit=None)` / `read(start,end)` / `read(limit=n)` / `latest` / `earliest` / re-save 净新增（逐行一致）
- [x] 5.3 经 vite 代理验证 `/api/candles/recent`、`/api/candles` 非空且形状不变；`/api/health`、`/api/tickers` 200
- [x] 5.4 规格与 `AGENTS.md` 更新；`market-endpoints` 经核验无需改动

## 6. 规格

- [x] 6.1 `openspec/specs/market-data-store/spec.md`：Parquet 日文件 → PostgreSQL `candles`
- [x] 6.2 `openspec/specs/market-data-read-speed/spec.md`：文件级缓存 → 数据库缓冲池/立即可见
- [x] 6.3 `scheduled-ingestion` / `kline-history-gap-fill`：落盘介质改为 candle store（PostgreSQL）
- [x] 6.4 `e2e-data-integrity`：目录遍历 → `candles` 表枚举
- [x] 6.5 `e2e-live-api`：种子 parquet → 种子测试库
- [x] 6.6 新增本 change 的 delta specs
- [ ] 6.7 `docs/diagrams/**` 若仍画文件型存储则标注 stale（本次不编辑，见报告）
