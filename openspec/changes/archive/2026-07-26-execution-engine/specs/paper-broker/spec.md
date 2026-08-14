## ADDED Requirements

### Requirement: 纸面开仓/加仓

系统 SHALL 提供纸面撮合:按成交价建仓或加仓,更新组合的占用保证金、名义敞口、加仓计数与入场价。

#### Scenario: 纸面开仓

- **WHEN** 通过风控的开仓在纸面执行
- **THEN** 系统 SHALL 在组合中记录该持仓(保证金/敞口/入场价/杠杆)
- **AND** 加仓计数加一

### Requirement: 纸面平仓与 PnL

系统 SHALL 支持纸面平仓,按方向计算盈亏并更新权益与权益峰值,移除该持仓。

#### Scenario: 盈利平仓

- **WHEN** 多头持仓在高于入场价处平仓
- **THEN** 系统 SHALL 增加权益(正 PnL)
- **AND** 移除该持仓

#### Scenario: 亏损平仓

- **WHEN** 多头持仓在低于入场价处平仓
- **THEN** 系统 SHALL 减少权益(负 PnL)
