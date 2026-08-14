# drawdown-circuit-breaker Specification

## Purpose
TBD - created by archiving change risk-position-management. Update Purpose after archive.
## Requirements
### Requirement: 回撤跟踪与熔断

系统 SHALL 跟踪权益峰值与当前权益,计算回撤比例;当单笔或组合回撤达到阈值时 MUST 触发熔断信号(建议平仓)。

#### Scenario: 触发熔断

- **WHEN** 组合回撤达到最大回撤阈值
- **THEN** 系统 SHALL 返回熔断触发
- **AND** 给出建议平仓的信息

#### Scenario: 未达阈值不熔断

- **WHEN** 回撤小于阈值
- **THEN** 系统 SHALL 不触发熔断

### Requirement: 熔断先于爆仓保证

系统 SHALL 提供全仓下爆仓价格逆向距离与熔断价格逆向距离的估算,且 MUST 保证熔断距离小于爆仓距离(比例等于最大回撤比例)。

#### Scenario: 熔断早于爆仓

- **WHEN** 给定名义敞口与权益
- **THEN** 熔断触发对应的价格逆向幅度 SHALL 严格小于爆仓对应的逆向幅度

