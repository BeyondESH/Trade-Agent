# kline-ingestion Specification

## Purpose
TBD - created by archiving change market-data-foundation. Update Purpose after archive.
## Requirements
### Requirement: 按参数拉取 K 线

系统 SHALL 支持按「品类 + 币种 + 时间级别 + 时间段(起止)」通过 MCP 拉取 K 线,并支持所有 MCP 支持的品类/币种。返回数据 MUST 归一为统一 OHLCV 模型,时间戳以 UTC 存储。

#### Scenario: 按时间段拉取

- **WHEN** 指定品类、币种、级别与起止时间
- **THEN** 系统 SHALL 返回该区间内的 K 线
- **AND** 字段包含 open_time/open/high/low/close/volume

#### Scenario: 超出单次上限自动分页

- **WHEN** 请求区间超过 MCP 工具单次返回上限
- **THEN** 系统 SHALL 分页循环拉取并拼接为完整区间

### Requirement: 增量拉取与缺口校验

系统 SHALL 支持增量拉取:拉取前查询已存最新时间,仅补缺口。系统 MUST 按时间级别步长检测缺失 bar。

#### Scenario: 增量补齐

- **WHEN** 本地已存部分历史,再次触发拉取
- **THEN** 系统 SHALL 只拉取缺失区间
- **AND** 不重复拉取已存数据

#### Scenario: 检测缺口

- **WHEN** 已存数据中存在按步长应有却缺失的 bar
- **THEN** 系统 SHALL 标记该缺口并可触发补拉

