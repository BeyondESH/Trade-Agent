## ADDED Requirements

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
