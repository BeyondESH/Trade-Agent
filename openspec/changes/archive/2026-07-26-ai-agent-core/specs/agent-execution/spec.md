## ADDED Requirements

### Requirement: 决策经风控执行落地

系统 SHALL 仅经执行层(含风控闸门,默认纸面)落地决策:open 走下单校验后执行,close 走平仓,hold 不动作。Agent MUST NOT 绕过风控直接下单。

#### Scenario: 开仓经风控闸门

- **WHEN** 决策为 open 且通过风控
- **THEN** 系统 SHALL 通过执行层建仓并返回执行结果

#### Scenario: 风控拒绝则不建仓

- **WHEN** 决策为 open 但风控拒绝(如无额度或熔断)
- **THEN** 系统 SHALL 不建仓
- **AND** 返回未成交的结果

#### Scenario: hold 不动作

- **WHEN** 决策为 hold
- **THEN** 系统 SHALL 不产生任何下单
