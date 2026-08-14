## MODIFIED Requirements

### Requirement: 最新与最近批次 bar 读取

系统 SHALL 为每个 series 缓存最近 N 根 bar（订阅快照批次逐行 upsert、实时更新同 open_time 覆盖，超出容量裁剪），并提供同步读取接口返回最新单根或最近批次。

#### Scenario: 读取最新 bar

- **WHEN** 查询某 series 的最新 bar
- **THEN** SHALL 返回该 series 内存中的最新 OHLCV（无数据返回 None）

#### Scenario: 读取最近批次

- **WHEN** 查询某 series 的最近 N 根 bar
- **THEN** SHALL 返回按时间升序的最近批次 OHLCV（无数据返回空列表）
