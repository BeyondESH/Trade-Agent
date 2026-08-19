# news-blockbeats-cleanup Specification

## ADDED Requirements

### Requirement: 移除界面 BlockBeats 品牌字样

系统 SHALL 不在任何用户可见界面文本中展示 "BlockBeats" 品牌字样，包括新闻页标题与副标题、市场概览副标题、数据窗口标签；新闻卡片上的来源标签 SHALL 不再显示。

#### Scenario: 新闻页标题

- **WHEN** 用户查看新闻界面标题与副标题
- **THEN** 文本中 SHALL 不包含 "BlockBeats" 字样

#### Scenario: 其他界面字样

- **WHEN** 用户查看市场概览视图副标题与数据窗口 "Market Pulse" 标签
- **THEN** 文本中 SHALL 不包含 "BlockBeats" 字样

#### Scenario: 新闻来源标签

- **WHEN** 用户查看新闻卡片头部
- **THEN** SHALL 不再显示来源标签（如 "BlockBeats"）

### Requirement: 保留外链与数据来源

系统 SHALL 保留新闻的 "Full Article" 外链跳转（指向 `m.theblockbeats.info/flash/{id}`）；数据层 `NewsItem.source` 字段 SHALL 保持 "BlockBeats" 不变，不影响既有测试与数据契约。

#### Scenario: 外链保留

- **WHEN** 用户点击新闻卡片的 "Full Article"
- **THEN** SHALL 正常跳转到对应新闻原文链接

#### Scenario: 数据字段保留

- **WHEN** 接口返回的新闻数据被转换为 `NewsItem`
- **THEN** `source` 字段 SHALL 仍为 "BlockBeats"
