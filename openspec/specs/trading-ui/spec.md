# trading-ui Specification

## Purpose
TBD - created by archiving change web-frontend. Update Purpose after archive.
## Requirements
### Requirement: 交易面板与控制

系统 SHALL 展示组合/盈亏与交易日志,提供时间段选择与数据导出,并提供运行控制(kill-switch)与实盘二次确认下单。交易面板 SHALL 提供可见的 kill-switch 控件：其状态 SHALL 取自 `GET /health`（`kill_switch`/`live_enabled`），用户切换时 SHALL 调用 `PUT /control` 并以后端返回/重新拉取的状态为准，停机态 SHALL 有明确视觉标识，`live_enabled` SHALL 可见但 MUST NOT 在本轮提供实盘开启入口。交易面板 SHALL 提供「Reset Funds」控件，点击后 SHALL 将模拟账户余额 / 持仓 / 挂单重置为初始状态，该控件 SHALL 仅作用于本地模拟账户。

#### Scenario: 展示组合与日志

- **WHEN** 打开交易面板
- **THEN** SHALL 显示当前权益/持仓与历史交易记录

#### Scenario: 实盘二次确认

- **WHEN** 用户发起实盘下单
- **THEN** SHALL 先请求得到 confirm token 并弹出确认对话框
- **AND** 用户确认后携带 token 调用 /order/confirm 才真正执行

#### Scenario: kill-switch 控件状态

- **WHEN** 交易面板加载且 `GET /health` 返回 `kill_switch` 与 `live_enabled`
- **THEN** 控件 SHALL 反映当前停机/运行状态，且 `live_enabled` SHALL 可见
- **AND** `kill_switch` 为真时 SHALL 显示明确停机标识

#### Scenario: 打开 kill-switch

- **WHEN** 用户打开 kill-switch
- **THEN** SHALL 调用 `PUT /control` 使后端拒绝一切下单
- **AND** SHALL 以后端返回的状态更新控件

#### Scenario: 关闭 kill-switch

- **WHEN** 用户关闭 kill-switch
- **THEN** SHALL 调用 `PUT /control` 恢复接单
- **AND** SHALL 以后端返回的状态更新控件

#### Scenario: 重置资金

- **WHEN** 用户点击 Reset Funds
- **THEN** SHALL 将模拟账户余额 / 持仓 / 挂单重置为初始状态
- **AND** SHALL NOT 触发任何后端下单或资金操作

#### Scenario: kill-switch

- **WHEN** 用户打开 kill-switch
- **THEN** SHALL 调用 PUT /control 使后端拒绝一切下单

### Requirement: 实时快照刷新

系统 SHALL 通过 WebSocket 快照驱动价格/指标/持仓的界面刷新。

#### Scenario: 快照刷新

- **WHEN** 收到 WS 快照
- **THEN** 界面 SHALL 更新最新价格与相关显示

