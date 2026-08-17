## MODIFIED Requirements

### Requirement: 按参数拉取 K 线

系统 SHALL 支持按「品类 + 币种 + 时间级别 + 时间段(起止)」通过 MCP 拉取 K 线,并支持所有 MCP 支持的品类/币种。返回数据 MUST 归一为统一 OHLCV 模型,时间戳以 UTC 存储。系统 SHALL 支持面向图表的按需深度回灌：对全部受支持的时间级别，能从已存最早 bar 继续向更早方向分页回溯拉取，并落库供 `/candles` 连续返回，直至交易所无更早历史。

#### Scenario: 按时间段拉取

- **WHEN** 指定品类、币种、级别与起止时间
- **THEN** 系统 SHALL 返回该区间内的 K 线
- **AND** 字段包含 open_time/open/high/low/close/volume

#### Scenario: 超出单次上限自动分页

- **WHEN** 请求区间超过 MCP 工具单次返回上限
- **THEN** 系统 SHALL 分页循环拉取并拼接为完整区间

#### Scenario: 全周期向更早方向深度回溯

- **WHEN** 图表请求早于本地已存最早 bar 的历史，且级别为任一受支持周期
- **THEN** 系统 SHALL 从最早 bar 继续向更早方向分页拉取并落库
- **AND** 直至补齐所请求区间或交易所已无更早历史

#### Scenario: 无更早历史时终止回溯

- **WHEN** 向更早方向分页返回空或不再前进
- **THEN** 系统 SHALL 停止回溯，不进入无限分页循环
