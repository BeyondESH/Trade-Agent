## ADDED Requirements

### Requirement: 熔断自动执行与幂等

系统 SHALL 在常驻运行期按调度周期自动执行熔断检查：当组合回撤达阈值时，SHALL 对触发时的全部持仓按各自最新可得的 store 收盘价执行保护性平仓并写入交易日志；某持仓无可用价格时 SHALL 记录告警并跳过该标的（留待下轮），且 MUST NOT 中断其他标的的平仓。熔断执行 SHALL NOT 新开任何仓位，SHALL NOT 被 kill-switch 阻断，且 SHALL 幂等——同一持仓 SHALL NOT 被重复平仓。

#### Scenario: 触发时自动平仓

- **WHEN** 组合回撤达阈值且存在持仓，到达熔断执行周期
- **THEN** 系统 SHALL 以各持仓最新可得收盘价平掉全部触发持仓
- **AND** 每笔平仓 SHALL 写入含盈亏与反思的交易日志

#### Scenario: 无价格时跳过且不中断

- **WHEN** 某触发持仓无任何可读的最新收盘价
- **THEN** 系统 SHALL 记录告警并跳过该标的
- **AND** 其余可定价标的的平仓 SHALL 不受影响

#### Scenario: 幂等不重复平仓

- **WHEN** 熔断执行在同一次触发后重复运行
- **THEN** 已平掉的持仓 SHALL NOT 被再次平仓

#### Scenario: 不受 kill-switch 阻断

- **WHEN** kill-switch 打开且组合回撤达阈值
- **THEN** 熔断执行 SHALL 仍然平掉触发持仓（保护性平仓）

#### Scenario: 未触发时不做任何动作

- **WHEN** 组合回撤未达阈值
- **THEN** 熔断执行 SHALL 不产生任何平仓或新开仓
