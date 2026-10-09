## Context

Phase 2 的最后一块持久化：K 线从 `data/parquet/<cat>/<sym>/<tf>/<YYYY-MM-DD>.parquet` 迁到 PostgreSQL。现网 6,684 个文件仅 78,422 行、约 28 MiB，`USDT-FUTURES/BTCUSDT/1d` 更是 2,423 文件对应 2,423 行——日文件分区的文件系统开销已远超数据本身。34 处调用点依赖 `ParquetStore` 的方法语义，迁移必须保持这些语义不变。

## Decisions

### D1：单表 + BRIN，不做声明式分区

`candles(category,symbol,timeframe,open_time)` 主键即覆盖所有读取路径（主键 btree 支持 `ORDER BY open_time DESC LIMIT n`）；`open_time` 上的 BRIN 索引服务跨 series 的时间范围扫描。78k 行规模下声明式分区只会增加运维复杂度。`open` 等列用 `double precision`（非 `numeric`）以避免浮点漂移。

### D2：保留 `ParquetStore` 名称与公共 API

34 处调用点仅通过方法调用依赖该类；保留类名可让所有导入与调用**零改动**，只改 4 处构造点。类名保留是权衡：重命名会波及每个 import 与测试。docstring 明确标注其为 PostgreSQL 实现。

### D3：`save` 净新增计数用 `xmax = 0`

`INSERT ... ON CONFLICT (PK) DO UPDATE SET ... RETURNING (xmax = 0) AS inserted` 在单条多行语句里区分"真正插入"与"冲突更新"，天然等于旧日文件 merge 的 `len(combined) - before`。写入前对入参 frame 按 `open_time` 去重 keep=last，避免同一语句内重复 key 触发 `ON CONFLICT DO UPDATE cannot affect row a second time`。整批写入在一个事务内完成。

### D4：`read` 复刻"最新优先 + 限量即停 + 升序 tail"

`limit` 非空时 `ORDER BY open_time DESC LIMIT n` 后反转（等价旧"从最新日文件反向累积至 limit、排序、tail"）；`limit=None` 时直接升序全量。无数据时返回带 canonical 列的空 DataFrame；非空结果统一 cast 回 `int64`/`float64`，与旧 Parquet 帧 dtype 一致。

### D5：删除 `_file_cache`

旧缓存无界、无 TTL、按已不存在的文件路径 key；且 agent worker 是独立进程，写同一张表，进程内缓存需要跨进程失效。PostgreSQL 共享缓冲池 + 连接池已承担热数据复用，故移除应用级缓存。三个依赖缓存内部的测试改写为行为断言：读取可重复、写入/删除立即可见、无陈旧读。

### D6：`find_gaps` 维持 `read` 实现

`find_gaps` 需要返回"min..max 之间缺失的具体 open_time 列表"，旧的 set 差集语义最直观。DB `read` 已是单条索引查询，直接复用可保证返回语义逐项不变；改为 `lead()` 窗口扫描需在 SQL 侧重建缺失序列，收益不足而回归风险高。

### D7：导入脚本与 Parquet 保留

一次性导入脚本只读 Parquet、幂等 UPSERT、支持 `--dry-run`、源目录缺失退出 0；**不删除** Parquet 文件，保留用于审计与重跑。

## Risks

- **无 Postgres 环境**：所有 DB 相关测试按既有 `<db>_test` fixture 策略 skip（不 fail）；`live_server` 播种测试库。
- **`MD_POSTGRES_DSN` 缺失**：`DatabaseUnavailable` 会让后端启动失败（fail-fast，与既有 store 一致）。
- **数据侧白名单漂移**：`test_data_integrity` 的 18 项失败为 `STRUCTURAL_EXEMPTIONS` 相对当前数据集的既有漂移，DB 与 Parquet 判定逐项一致（非迁移引入）。
