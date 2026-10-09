## MODIFIED Requirements

### Requirement: K 线持久化存储层（PostgreSQL）

系统 SHALL 将 K 线持久化到 PostgreSQL `candles` 表（连接串来自 `MD_POSTGRES_DSN`），以 `(category, symbol, timeframe, open_time)` 为主键，`open_time` 为 epoch 毫秒整数，OHLCV 五列为 double precision，`open_time` SHALL 建有 BRIN 索引。写入 MUST 以主键 UPSERT 去重合并，保证同一 bar 不重复。

#### Scenario: 写入并去重合并

- **WHEN** 保存 K 线且表中已存在相同 `(category, symbol, timeframe, open_time)`
- **THEN** 系统 SHALL 以 UPSERT 覆盖该 bar，不产生重复行
- **AND** 可按同一组合精确读取

#### Scenario: 去重合并

- **WHEN** 新拉取数据与已存数据存在相同 open_time
- **THEN** 系统 SHALL 合并去重
- **AND** 不产生重复行
