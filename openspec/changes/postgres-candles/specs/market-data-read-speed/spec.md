## MODIFIED Requirements

### Requirement: 本地库读取按需裁剪与限量

`ParquetStore.read` SHALL 借助 `candles` 主键索引与 `open_time` 范围条件下推数据库，支持反向限量读取（`ORDER BY open_time DESC LIMIT n` 后反转为升序），使宽区间读取不随历史深度线性变慢。热数据缓存 SHALL 由 PostgreSQL 共享缓冲池与连接池承担，进程内 MUST NOT 维护按文件/按 bar 的应用级缓存（避免跨进程陈旧读）。

#### Scenario: 区间裁剪

- **WHEN** 读取指定 `[start_ms, end_ms]`
- **THEN** 系统 SHALL 仅由数据库返回区间内的行，而非加载全量后过滤

#### Scenario: 限量反向读取

- **WHEN** 提供 `limit`
- **THEN** SHALL 由数据库按 `open_time` 倒序取最新 `limit` 行后反转为升序，返回区间内最后 `limit` 根

#### Scenario: 热数据由数据库缓存

- **WHEN** 同一区间被再次读取且期间未写入
- **THEN** SHALL 由 PostgreSQL 缓冲池/连接池承担热数据复用，系统不维护进程内按文件缓存

#### Scenario: 写入/删除立即可见

- **WHEN** `save`/`delete` 修改了某 series
- **THEN** 后续读取 SHALL 立即反映最新已提交数据，不得命中陈旧的应用级缓存
