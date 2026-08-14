# execution-core Specification

## Purpose
TBD - created by archiving change execution-engine. Update Purpose after archive.
## Requirements
### Requirement: 统一执行接口与风控前置闸门

系统 SHALL 提供统一的开/平仓接口,且在执行任何订单前 MUST 先通过熔断检查与下单风控校验。任一检查不通过时 MUST 拒绝且不得下单。

#### Scenario: 通过闸门后执行

- **WHEN** 订单通过熔断检查与风控校验
- **THEN** 系统 SHALL 交由 broker 执行
- **AND** 返回含决策(保证金/敞口/杠杆)的执行结果

#### Scenario: 风控拒绝则不下单

- **WHEN** 风控校验判定拒绝(如无保证金额度或加仓超限)
- **THEN** 系统 SHALL 返回未成交
- **AND** 不调用任何下单

#### Scenario: 熔断时阻断

- **WHEN** 组合回撤已达熔断阈值
- **THEN** 系统 SHALL 拒绝新订单并给出建议平仓的原因

