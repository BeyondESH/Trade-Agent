## MODIFIED Requirements

### Requirement: 底部抽屉与 Tab

系统 SHALL 在底部提供 30px tab 栏（AI 分析 / 回测 / 筛选器 / 交易面板）；Tab 无背景，选中项文字变白 + 底部 2px 蓝色下划线；点击 tab SHALL 向上展开为 20-40vh 高度（默认 32vh），上缘 SHALL 可拖拽调整高度并再次折叠。展开时抽屉容器高度 MUST 显式等于当前 heightVh（不得由内容撑开），以保证中心图表区拿到确定的剩余空间、二者不重叠。

#### Scenario: 展开与折叠

- **WHEN** 点击某个 tab
- **THEN** 抽屉 SHALL 展开为 heightVh 高度（20-40vh，默认 32）显示对应内容，该 tab SHALL 显示白色文字与 2px 蓝色下划线；再次点击 SHALL 折叠回 30px

#### Scenario: 展开不与图表重叠

- **WHEN** 抽屉展开且面板内容超过抽屉高度
- **THEN** 抽屉高度 SHALL 保持等于 heightVh，内容在抽屉内滚动，中心图表区 SHALL NOT 被内容撑开或覆盖

#### Scenario: 高度拖拽

- **WHEN** 拖拽抽屉上缘
- **THEN** 抽屉高度 SHALL 在 20-40vh 间实时调整并在释放后保持

### Requirement: 筛选器面板

系统 SHALL 在筛选器 tab 复用 MarketList 全屏能力（分类 tab、搜索、排序、虚拟滚动），并提供基于 Bitget 已有维度的"基本面"列：资金费率、标记价、24h 振幅（(high24h-low24h)/low24h 作为波动率代理）、24h 成交量/成交额，各列可排序；数据 SHALL 全部取自行情 hub 已有字段，MUST NOT 引入外部基本面数据源。选中品种 SHALL 联动图表。

#### Scenario: 基本面列展示与排序

- **WHEN** 打开筛选器并按资金费率或振幅列排序
- **THEN** SHALL 展示资金费率/标记价/24h 振幅/量额列并按所选列排序

#### Scenario: 筛选与联动

- **WHEN** 在筛选器中筛选并点击某品种
- **THEN** SHALL 展示筛选结果并按 `category:instId` 联动切换图表品种

#### Scenario: 仅用 Bitget 维度

- **WHEN** 渲染基本面列
- **THEN** 每列数值 SHALL 来自 hub 已有字段（fundingRate/markPrice/high24h/low24h/成交量额），SHALL NOT 依赖外部数据源
