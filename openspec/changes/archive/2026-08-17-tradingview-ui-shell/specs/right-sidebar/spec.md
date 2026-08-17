## ADDED Requirements

### Requirement: 图标条与面板

系统 SHALL 在右侧提供 44px 常驻图标条（Watchlist / Alerts / Data Window / DOM / OrderBook / Broker / News），选中项左侧 2px 蓝色高亮竖条且图标变白；点击当前 tab 图标 SHALL 折叠/展开面板；面板宽度 SHALL 在 260-500px 间可拖拽。

#### Scenario: tab 选中态

- **WHEN** 点击图标条某 tab
- **THEN** 该图标 SHALL 左侧出现 2px 蓝条并变白，面板切换内容

#### Scenario: 面板折叠

- **WHEN** 点击当前已展开 tab 的图标
- **THEN** 面板 SHALL 折叠为仅图标条，图表区占满释放空间

#### Scenario: 面板宽度拖拽

- **WHEN** 拖拽面板左缘
- **THEN** 面板宽度 SHALL 在 260-500px 间实时调整

### Requirement: Watchlist 自选列表

系统 SHALL 在 Watchlist tab 呈现三列右对齐表格（Symbol / Last / Chg%），涨跌用文字色而非背景色，行 hover 底色 `#2a2e39`，选中行左侧 2px 蓝条；支持按分类 tab（现货/合约等）与关键字过滤，选中后联动图表。

#### Scenario: 列表渲染与联动

- **WHEN** 加载 ticker 列表并点击某行
- **THEN** SHALL 显示 Symbol/Last/Chg% 三列（涨绿跌红），点击行后图表与顶栏 SHALL 切换到该品种并高亮该行

### Requirement: 订单簿 DOM 面板

系统 SHALL 在 DOM/OrderBook tab 呈现盘口深度、最近成交与资金费率/标记价格；盘口深度 SHALL 用背景色条（涨绿跌红，非文字色）表示，列右对齐且 `tabular-nums`。

#### Scenario: 盘口渲染

- **WHEN** 打开 DOM tab 且有实时盘口
- **THEN** SHALL 展示卖盘/买盘深度条、最近成交与资金费率，数字等宽对齐

### Requirement: Data Window 与 News

系统 SHALL 提供 Data Window tab（当前 K 线的 O/H/L/C/V 数据表）与 News tab（占位，无数据源时显示空态）；空态 SHALL 展示占位文案而非报错。

#### Scenario: 数据窗口

- **WHEN** 打开 Data Window tab
- **THEN** SHALL 展示当前品种与周期下的 OHLCV 数值表，随最新 K 线更新

#### Scenario: 新闻空态

- **WHEN** 打开 News tab 且无数据源
- **THEN** SHALL 显示空态占位文案
