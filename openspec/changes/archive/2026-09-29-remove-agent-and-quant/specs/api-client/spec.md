# api-client Specification (delta)

## MODIFIED Requirements

### Requirement: 类型化 API 客户端

系统 SHALL 提供类型化的 REST 客户端,覆盖行情/分析/结构/图表配置/告警端点,并在非 2xx 响应时抛出可识别错误。原覆盖的回测/Agent/控制/下单端点已随量化与自定义 Agent 层移除,客户端 MUST NOT 再暴露这些方法;provider 配置端点(`/config`)一并移除,图表配置端点(`/chart-config`)保留。

#### Scenario: 成功请求返回解析结果

- **WHEN** 调用某端点且服务返回 2xx
- **THEN** 客户端 SHALL 返回解析后的 JSON

#### Scenario: 错误响应抛出

- **WHEN** 服务返回非 2xx
- **THEN** 客户端 SHALL 抛出含状态与信息的错误

#### Scenario: 无已移除端点的方法

- **WHEN** 检查客户端导出
- **THEN** MUST NOT 存在 `backtest` / `sweep` / `walkforward` / `dlFeatures` / `decide` / `cycle` / `portfolio` / `journal` / `control` / `order` / `orderConfirm` 等方法或其类型
