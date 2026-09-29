# research-agent Specification

## Purpose
TBD - created by archiving change deep-agents-paper-loop. Update Purpose after archive.
## Requirements
### Requirement: Deep Agents 研究层装配

系统 SHALL 用 `deepagents.create_deep_agent` 构建研究图，配置 `model`、`tools`、`subagents`、`middleware=[TodoListMiddleware()]`、`backend`、`checkpointer` 与 `response_format=StrategyProposal`。

#### Scenario: 构建研究图

- **WHEN** worker 装配研究图
- **THEN** SHALL 得到一个 `CompiledStateGraph`，且规划工具（`write_todos`）经 `TodoListMiddleware` 启用

### Requirement: 只读工具集

研究层的全部工具 MUST 为只读（行情 / 技术面 / 新闻 / MCP 分析类）；MUST NOT 暴露任何下单、撤单、转账或账户写操作。

#### Scenario: 无写工具

- **WHEN** 枚举研究图可用工具
- **THEN** MUST NOT 存在交易写类工具
- **AND** 技术面工具 SHALL 复用 `indicators` / `levels` / `smc` / `structure`

### Requirement: 子代理

系统 SHALL 至少提供 `news-analyst` 与 `technical-analyst` 两个子代理，各自独立上下文并返回最终报告给主代理。

#### Scenario: 委派研究

- **WHEN** 主代理需要某维度的深度分析
- **THEN** SHALL 经 `task` 工具委派给对应子代理，子代理的中间上下文 MUST NOT 污染主代理

### Requirement: 研究图可观测

研究图 SHALL 可经 `stream_events(version="v3")` 暴露 `messages` / `values` / `subagents` 投影，供前端展示研究过程。

#### Scenario: 流式研究

- **WHEN** 消费研究图事件流
- **THEN** SHALL 可分别读取主代理消息、状态值与各子代理的执行投影

### Requirement: 提案产出

研究图 SHALL 以 `response_format` 输出 `StrategyProposal` 至最终状态键 `structured_response`。

#### Scenario: 产出契约

- **WHEN** 研究图运行结束
- **THEN** 最终状态 SHALL 含符合 `StrategyProposal` schema 的结构化结果

