# market-endpoints Specification

## Purpose
TBD - created by archiving change web-api. Update Purpose after archive.
## Requirements
### Requirement: 行情与分析端点

系统 SHALL 提供读取 K 线、技术分析(指标末值 + Top-N 支撑/压力)、市场结构(趋势线/箱体/订单块)与 S/R 候选的端点,数据来自本地存储。

#### Scenario: 读取 K 线

- **WHEN** 请求某品类/币种/级别(可带时间段)的 candles
- **THEN** 系统 SHALL 返回该区间的 OHLCV 数据

#### Scenario: 分析端点

- **WHEN** 请求某 series 的 analyze
- **THEN** 系统 SHALL 返回指标末值与 Top-N S/R 候选

#### Scenario: 数据不足

- **WHEN** 该 series 数据不足以分析
- **THEN** 系统 SHALL 返回明确的提示而非 500

### Requirement: 回测与拉取后台任务

系统 SHALL 将回测与数据拉取作为后台任务处理,返回 job id 并可查询进度/结果。

#### Scenario: 提交回测

- **WHEN** 提交某 series 的回测
- **THEN** 系统 SHALL 返回 job id
- **AND** 该 job 可查询到运行中或完成的状态与指标

