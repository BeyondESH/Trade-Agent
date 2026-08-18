# system-architecture Specification

## Purpose
TBD - created by archiving change ai-trading-system-roadmap. Update Purpose after archive.
## Requirements
### Requirement: 分层架构与主语言

系统 SHALL 采用分层架构:数据层、分析层(指标+结构)、风控执行层、AI Agent 层、DL 量化层、自动化编排层、前端层。系统主语言 SHALL 为 Python,并以依赖形式消费 `bitget-agent-hub`(`bitget-agent-sdk`/`bitget-agent-mcp`/`bitget-signal`),不得 fork 修改其源码。

#### Scenario: 各层职责隔离

- **WHEN** 任一层需要另一层能力
- **THEN** 只能通过该层公开接口调用
- **AND** 不得跨层直接访问 Bitget API 绕过风控执行层

#### Scenario: 依赖以包形式引入

- **WHEN** 集成 Bitget 交易/行情能力
- **THEN** 通过 npm 包 `@bitget-ai/bitget-agent-*` 引入
- **AND** 仓库内不包含被 fork 的其源码副本

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

### Requirement: 安全基线默认纸面

系统 SHALL 默认运行于纸面交易(paper-trading),实盘 MUST 由用户显式开启。凭据 MUST 仅从环境变量读取。

#### Scenario: 默认纸面

- **WHEN** 系统在未显式开启实盘的情况下启动
- **THEN** 所有下单路由至 Bitget Demo 环境
- **AND** 不触及真实资金

#### Scenario: 实盘显式开启

- **WHEN** 用户切换为实盘
- **THEN** 系统 SHALL 要求二次确认后方可对真实账户下单

### Requirement: 可插拔 LLM Provider

系统 SHALL 通过统一的 `LLMProvider` 抽象兼容主流供应商(Anthropic、OpenAI、OpenAI 兼容端点)与本地部署(Ollama)。供应商、模型、密钥与 base_url MUST 可配置切换,且切换 provider MUST NOT 影响 MCP 工具调用逻辑。

#### Scenario: 切换供应商

- **WHEN** 用户将 LLM provider 由某厂商切换为本地 Ollama
- **THEN** AI Agent SHALL 使用新 provider 继续决策
- **AND** MCP 工具调用逻辑保持不变

#### Scenario: 弱模型降级容错

- **WHEN** 所选本地模型工具调用或长上下文能力不足
- **THEN** 系统 SHALL 对记忆-反思注入与结构化输入做降级处理而非崩溃

