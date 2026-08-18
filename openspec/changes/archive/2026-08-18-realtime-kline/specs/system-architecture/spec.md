## MODIFIED Requirements

### Requirement: 两条执行/数据通道

系统 SHALL 为 DL 量化与前端实时行情提供 Bitget 直连 REST/WebSocket 通道,为 AI Agent 提供 `bitget-agent-mcp` 工具调用通道。

#### Scenario: DL 量化走直连

- **WHEN** DL 量化模式需要实时 5 分钟 K 线或下单
- **THEN** 通过 Bitget 直连 REST/WebSocket 完成
- **AND** 不经由 MCP

#### Scenario: 前端实时行情走直连

- **WHEN** 前端需要实时 K 线/价格更新
- **THEN** 通过 Bitget 直连公共 WebSocket 订阅行情并注入快照
- **AND** 不经由 MCP 轮询

#### Scenario: AI Agent 走 MCP

- **WHEN** AI Agent 模式需要下单、查行情或获取新闻/宏观分析
- **THEN** 通过 `bitget-agent-mcp` / `bitget-signal` 的工具调用完成
