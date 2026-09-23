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

### Requirement: 平仓 PnL 结算与权益更新

系统 SHALL 在平仓时按方向结算已实现盈亏，且对所有 broker（纸面与实盘）语义一致：`direction = 1.0`（long）或 `-1.0`（short），`pnl = notional * (exit_price - entry_price) / entry_price * direction`。平仓成功后系统 SHALL 执行 `equity += pnl`、`peak_equity = max(peak_equity, equity)`，并移除该持仓，且 SHALL 返回该 `pnl`。当目标标的不存在持仓时，系统 SHALL 返回 `0.0` 且 MUST NOT 改动权益或权益峰值。

#### Scenario: 多头盈利平仓更新权益

- **WHEN** 以高于入场价的价格平掉一个多头持仓
- **THEN** 系统 SHALL 返回正 PnL
- **AND** SHALL 使 `equity` 增加该 PnL、`peak_equity` 取更新后权益与旧峰值的较大者
- **AND** SHALL 从组合中移除该持仓

#### Scenario: 空头盈利平仓更新权益

- **WHEN** 以低于入场价的价格平掉一个空头持仓
- **THEN** 系统 SHALL 返回正 PnL
- **AND** SHALL 按同一公式更新 `equity` 与 `peak_equity`、移除该持仓

#### Scenario: 无持仓平仓

- **WHEN** 对不存在持仓的标的执行平仓
- **THEN** 系统 SHALL 返回 `0.0`
- **AND** MUST NOT 改动 `equity` 或 `peak_equity`

### Requirement: broker 执行失败的可判别错误

系统 SHALL 将 broker 下单（含 MCP `order` 工具调用）的失败包装为可判别的执行层错误类型，MUST NOT 让底层传输异常以未处理异常的形式暴露为 500。上层 API 在收到该执行层错误时 SHALL 返回带错误信息的结构化 JSON 响应与合适的 5xx 状态码。实盘闸门（未开启/未确认）导致的拒绝 MUST 保持为执行结果的拒绝（`filled=false`），与传输失败区分。

#### Scenario: 下单失败返回结构化错误

- **WHEN** 实盘 broker 通过 MCP 发出下单请求且该调用失败
- **THEN** 系统 SHALL 抛出可判别的执行层错误
- **AND** 上层 API SHALL 返回带错误信息的结构化 JSON 响应而非未处理的 500

#### Scenario: 闸门拒绝仍为执行结果拒绝

- **WHEN** 实盘未开启或二次确认未通过
- **THEN** 系统 SHALL 返回 `filled=false` 的执行结果
- **AND** MUST NOT 将其当作传输失败抛出

