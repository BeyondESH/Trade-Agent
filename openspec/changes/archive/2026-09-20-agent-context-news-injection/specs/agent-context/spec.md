## MODIFIED Requirements

### Requirement: 结构化 Agent 上下文

系统 SHALL 将 K 线的指标末值、Top-N 支撑/压力候选、当前价与新闻摘要组装为结构化上下文，供 provider 决策。在生产端点（`/agent/decide`、`/agent/cycle` 及编排定时循环）中，系统 SHALL 从新闻管线环形缓冲自动读取新闻，按时间窗与类别过滤并截断为摘要文本注入上下文 `news` 字段；当环形缓冲为空或过滤后无条目时，上下文 SHALL 仍可成功组装且 `news` 为空字符串。显式传入的新闻 SHALL 优先于自动注入。

#### Scenario: 组装上下文

- **WHEN** 传入某 series 的 OHLCV 帧
- **THEN** 系统 SHALL 输出含 price、indicators 末值、levels(Top-N)的上下文

#### Scenario: 自动注入新闻

- **WHEN** 新闻环形缓冲存在时间窗内且类别匹配的条目，触发某生产 Agent 端点
- **THEN** 上下文 `news` SHALL 包含按时间窗与类别过滤并截断后的摘要文本

#### Scenario: 新闻为空仍可用

- **WHEN** 环形缓冲为空或过滤后无匹配条目
- **THEN** 上下文 SHALL 仍成功组装，`news` 为空字符串

#### Scenario: 显式新闻优先

- **WHEN** 调用方显式提供新闻/宏观摘要文本
- **THEN** 上下文 SHALL 包含该文本
- **AND** 自动注入 SHALL NOT 覆盖显式文本

#### Scenario: 可注入新闻

- **WHEN** 提供新闻/宏观摘要文本
- **THEN** 上下文 SHALL 包含该文本
- **AND** 未提供时上下文仍可用(新闻为空)
