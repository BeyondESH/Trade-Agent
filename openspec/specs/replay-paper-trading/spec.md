# replay-paper-trading Specification

## Purpose
TBD - created by archiving change tv-replay-and-alerts. Update Purpose after archive.
## Requirements
### Requirement: 回放模拟下单

系统 SHALL 在回放模式提供纸面下单：以回放当前价开/平多空仓，维护纸面账户（持仓、均价、浮动盈亏、已实现盈亏），MUST NOT 触达真实 `/order` 接口。

#### Scenario: 回放中开仓与浮盈

- **WHEN** 回放中以当前价开多仓，随后回放前进使价格上涨
- **THEN** 纸面账户 SHALL 显示该持仓的实时浮动盈亏随回放价更新

#### Scenario: 平仓结算已实现盈亏

- **WHEN** 回放中平掉某持仓
- **THEN** 系统 SHALL 结算该笔已实现盈亏并从持仓移除

#### Scenario: 与真实交易隔离

- **WHEN** 进行回放模拟下单
- **THEN** SHALL NOT 调用真实 `/order` / `/order/confirm`，不影响真实账户

### Requirement: 回放小结

系统 SHALL 在退出回放或回放结束时给出纸面交易小结（总已实现盈亏、笔数、胜率）。

#### Scenario: 退出时小结

- **WHEN** 退出回放且存在纸面交易记录
- **THEN** SHALL 展示总盈亏、成交笔数与胜率小结

