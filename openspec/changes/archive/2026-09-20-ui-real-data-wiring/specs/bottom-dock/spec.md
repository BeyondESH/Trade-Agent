## MODIFIED Requirements

### Requirement: 筛选器面板

系统 SHALL 在筛选器 tab 复用 MarketList 全屏能力（分类 tab、搜索、排序、虚拟滚动），并 SHALL 消费实时行情 hub 的 ticker 数据源（`useTickerList`，`/tickers` 快照 + `/ws` `ticker/default` 增量）驱动全部行；系统 MUST NOT 渲染 `INITIAL_SCREENER_ITEMS` 等静态 mock 数组作为行情来源。筛选器 SHALL 提供基于 Bitget 已有维度的"基本面"列：资金费率、标记价、24h 振幅（(high24h-low24h)/low24h 作为波动率代理）、24h 成交量/成交额，各列可排序；数据 SHALL 全部取自行情 hub 已有字段，MUST NOT 引入外部基本面数据源。当某维度字段在 hub 缺失时，该单元格 SHALL 显示占位（如 `--`）并排到排序末尾，MUST NOT 以静态 mock 数值填充。选中品种 SHALL 联动图表。

#### Scenario: 基本面列展示与排序

- **WHEN** 打开筛选器并按资金费率或振幅列排序
- **THEN** SHALL 展示资金费率/标记价/24h 振幅/量额列并按所选列排序

#### Scenario: 筛选与联动

- **WHEN** 在筛选器中筛选并点击某品种
- **THEN** SHALL 展示筛选结果并按 `category:instId` 联动切换图表品种

#### Scenario: 仅用 Bitget 维度

- **WHEN** 渲染基本面列
- **THEN** 每列数值 SHALL 来自 hub 已有字段（fundingRate/markPrice/high24h/low24h/成交量额），SHALL NOT 依赖外部数据源

#### Scenario: 实时驱动的行数据

- **WHEN** `/ws` `ticker/default` 推送某 instId 的价格或基本面字段更新
- **THEN** 对应行 SHALL 就地更新，且列表 MUST NOT 回退渲染静态 mock 数组

#### Scenario: 缺失维度显示占位

- **WHEN** 某 instId 的 hub 数据不含振幅或成交额字段
- **THEN** 该单元格 SHALL 显示占位（如 `--`）并排到排序末尾，MUST NOT 以 mock 数值填充
