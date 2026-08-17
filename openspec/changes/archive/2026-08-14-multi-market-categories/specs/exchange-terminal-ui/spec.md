## MODIFIED Requirements

### Requirement: 全量市场列表

系统 SHALL 在左侧提供 Bitget 全产品线合约/交易对市场列表，含品类 Tab（现货 / 合约组（U 本位/USDC/币本位）/ 杠杆）与 `symbolType` 二级过滤（全部 / 加密货币 / 贵金属 / 股票 / 大宗）、搜索过滤、按列排序，并支持大量行的高效渲染（虚拟滚动）。列表数据按品类从后端拉取并实时刷新。

#### Scenario: 品类 Tab 切换

- **WHEN** 用户切换品类 Tab（现货/合约组/杠杆）
- **THEN** SHALL 加载并展示对应品类的交易对列表

#### Scenario: symbolType 二级过滤

- **WHEN** 用户选择贵金属/股票等 symbolType 过滤
- **THEN** SHALL 仅展示该类别（如 `symbolType=metal`、`isReality=yes`）的交易对

#### Scenario: 列表初次加载

- **WHEN** 打开某品类列表
- **THEN** SHALL 加载该品类全量交易对并按默认排序展示

#### Scenario: 搜索过滤

- **WHEN** 输入搜索关键词
- **THEN** SHALL 仅展示 symbol 匹配的交易对

#### Scenario: 按列排序

- **WHEN** 点击某列头（如 24h 涨跌幅）
- **THEN** SHALL 按该列升/降序重排列表

#### Scenario: 列表实时刷新

- **WHEN** ticker 增量推送到达
- **THEN** SHALL 更新对应行的价格与统计且不破坏滚动位置

#### Scenario: 选择联动

- **WHEN** 点击列表某行
- **THEN** SHALL 切换当前 symbol 与品类，并联动图表、订单簿、成交、行情条

#### Scenario: 虚拟滚动

- **WHEN** 列表渲染大量交易对行
- **THEN** SHALL 仅渲染可视窗口内的行以维持流畅

### Requirement: 跨品类图表联动

系统 SHALL 支持 symbol 切换跨品类联动：K 线图、订单簿、最新成交、资金费率与标记价格均以所选 symbol 的品类加载对应数据。

#### Scenario: 跨品类加载 K 线

- **WHEN** 从现货切换到某 U 本位合约 symbol
- **THEN** 图表 SHALL 按新品类加载该 symbol 的 K 线并实时更新

#### Scenario: 跨品类订单簿与成交

- **WHEN** symbol 品类变化
- **THEN** SHALL 重新拉取对应品类的订单簿快照与成交历史，并退订旧品类频道

#### Scenario: 行情条跨品类

- **WHEN** 行情条展示各品类交易对
- **THEN** SHALL 按各品类 ticker 更新价格与涨跌幅并保持滚动位置
