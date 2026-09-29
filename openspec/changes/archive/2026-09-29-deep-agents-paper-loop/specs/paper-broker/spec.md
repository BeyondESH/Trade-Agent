# paper-broker Specification

## Purpose

Phase 1 的确定性纸面撮合：无真实对手方，按给定价格成交，维护持仓、PnL 与权益（供风控读取）。

## ADDED Requirements

### Requirement: 纸面撮合

系统 SHALL 提供确定性纸面 broker：按传入价格成交，支持开仓与平仓，维护持仓与已实现/未实现 PnL。

#### Scenario: 开仓

- **WHEN** 提交一个通过全部风控的 open 指令
- **THEN** SHALL 生成持仓并更新权益

#### Scenario: 平仓结算

- **WHEN** 对已有持仓提交 close 指令
- **THEN** SHALL 结算已实现 PnL 并从持仓移除

### Requirement: 权益与回撤

broker SHALL 维护权益曲线；当回撤超过阈值 SHALL 标记熔断状态，供执行图风控读取。

#### Scenario: 触发熔断

- **WHEN** 回撤超过配置阈值
- **THEN** SHALL 置熔断状态，后续 open 指令 SHALL 被风控拒绝

### Requirement: 无真实交易通路

纸面 broker MUST NOT 发出任何真实交易所请求；MUST NOT import 任何交易写客户端。

#### Scenario: 隔离真实下单

- **WHEN** 审查 broker 代码
- **THEN** MUST NOT 存在真实下单/撤单的网络调用
