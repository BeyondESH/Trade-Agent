## MODIFIED Requirements

### Requirement: 全量 series 数据质量门禁
测试系统 SHALL 枚举 PostgreSQL `candles` 表中的全部 series（category/symbol/timeframe），对每个 series 校验数据质量，作为回归基线。枚举 SHALL 通过对 `candles` 表执行 `SELECT DISTINCT category, symbol, timeframe` 自动发现，而非硬编码列表；无可用 Postgres（或表为空）时 SHALL 跳过而非失败。
#### Scenario: 自动发现全部 series
- **WHEN** 数据完整性测试运行
- **THEN** 测试 SHALL 从 `candles` 表发现并校验全部 series，且测试参数化按 series 展开
