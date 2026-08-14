# trading-ui Specification

## Purpose
TBD - created by archiving change web-frontend. Update Purpose after archive.
## Requirements
### Requirement: 交易面板与控制

系统 SHALL 展示组合/盈亏与交易日志,提供时间段选择与数据导出,并提供运行控制(kill-switch)与实盘二次确认下单。

#### Scenario: 展示组合与日志

- **WHEN** 打开交易面板
- **THEN** SHALL 显示当前权益/持仓与历史交易记录

#### Scenario: 实盘二次确认

- **WHEN** 用户发起实盘下单
- **THEN** SHALL 先请求得到 confirm token 并弹出确认对话框
- **AND** 用户确认后携带 token 调用 /order/confirm 才真正执行

#### Scenario: kill-switch

- **WHEN** 用户打开 kill-switch
- **THEN** SHALL 调用 PUT /control 使后端拒绝一切下单

### Requirement: 实时快照刷新

系统 SHALL 通过 WebSocket 快照驱动价格/指标/持仓的界面刷新。

#### Scenario: 快照刷新

- **WHEN** 收到 WS 快照
- **THEN** 界面 SHALL 更新最新价格与相关显示

