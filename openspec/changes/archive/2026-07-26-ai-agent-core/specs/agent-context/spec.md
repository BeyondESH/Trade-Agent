## ADDED Requirements

### Requirement: 结构化 Agent 上下文

系统 SHALL 将 K 线的指标末值、Top-N 支撑/压力候选、当前价与可选新闻/宏观摘要组装为结构化上下文,供 provider 决策。

#### Scenario: 组装上下文

- **WHEN** 传入某 series 的 OHLCV 帧
- **THEN** 系统 SHALL 输出含 price、indicators 末值、levels(Top-N)的上下文

#### Scenario: 可注入新闻

- **WHEN** 提供新闻/宏观摘要文本
- **THEN** 上下文 SHALL 包含该文本
- **AND** 未提供时上下文仍可用(新闻为空)
