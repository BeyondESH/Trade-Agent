## ADDED Requirements

### Requirement: 熔断阻断与建议平仓

系统 SHALL 在组合回撤达阈值时阻断新订单,并提供应平仓的持仓集合供执行。

#### Scenario: 熔断阻断新单

- **WHEN** 组合回撤达阈值时尝试下新单
- **THEN** 系统 SHALL 拒绝该单

#### Scenario: 给出应平仓持仓

- **WHEN** 触发熔断并请求执行熔断
- **THEN** 系统 SHALL 返回当前应平仓的持仓集合
