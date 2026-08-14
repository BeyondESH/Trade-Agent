# api-client Specification

## Purpose
TBD - created by archiving change web-frontend. Update Purpose after archive.
## Requirements
### Requirement: 类型化 API 客户端

系统 SHALL 提供类型化的 REST 客户端,覆盖行情/分析/结构/回测/Agent/配置/控制/下单端点,并在非 2xx 响应时抛出可识别错误。

#### Scenario: 成功请求返回解析结果

- **WHEN** 调用某端点且服务返回 2xx
- **THEN** 客户端 SHALL 返回解析后的 JSON

#### Scenario: 错误响应抛出

- **WHEN** 服务返回非 2xx
- **THEN** 客户端 SHALL 抛出含状态与信息的错误

### Requirement: WebSocket 快照客户端

系统 SHALL 提供连接 `/ws` 并接收快照消息的客户端封装,支持传入回调处理消息与断开清理。

#### Scenario: 收到快照回调

- **WHEN** 连接后服务端推送快照
- **THEN** 客户端 SHALL 以解析后的消息调用回调

