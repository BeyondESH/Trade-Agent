# right-sidebar Specification

## Purpose
TBD - created by archiving change tradingview-ui-shell. Update Purpose after archive.
## Requirements
### Requirement: Watchlist 自选列表

系统 SHALL 在 Watchlist tab 呈现三列右对齐表格（Symbol / Last / Chg%），涨跌用文字色而非背景色，行 hover 底色 `#2a2e39`，选中行左侧 2px 蓝条；支持按分类 tab（现货/合约等）与关键字过滤，选中后联动图表。

#### Scenario: 列表渲染与联动

- **WHEN** 加载 ticker 列表并点击某行
- **THEN** SHALL 显示 Symbol/Last/Chg% 三列（涨绿跌红），点击行后图表与顶栏 SHALL 切换到该品种并高亮该行

### Requirement: 订单簿 DOM 面板

系统 SHALL 在 DOM/OrderBook tab 呈现盘口深度、最近成交与资金费率/标记价格；盘口深度 SHALL 用背景色条（涨绿跌红，非文字色）表示，列右对齐且 `tabular-nums`。资金费率与标记价格 SHALL 由 WS 衍生品通道提供（`funding-time` / `mark-price`，经 `useDerivative` 消费），MUST NOT 使用硬编码或静态占位数值；对应通道数据未到达时，该字段 SHALL 显示占位（如 `--`）。

#### Scenario: 盘口渲染

- **WHEN** 打开 DOM tab 且有实时盘口
- **THEN** SHALL 展示卖盘/买盘深度条、最近成交与资金费率，数字等宽对齐

#### Scenario: 资金费率与标记价来自 WS

- **WHEN** WS `funding-time` / `mark-price` 通道推送当前品种的数据
- **THEN** DOM 面板 SHALL 展示该品种的实时资金费率与标记价格，数值随通道更新

#### Scenario: 无衍生品数据时占位

- **WHEN** 当前品种的 `funding-time` / `mark-price` 数据尚未到达
- **THEN** 资金费率与标记价格字段 SHALL 显示占位（如 `--`），MUST NOT 显示硬编码 mock 数值

### Requirement: Data Window

系统 SHALL 提供 Data Window tab（当前 K 线的 O/H/L/C/V 数据表）；该数据 SHALL 随十字线悬停与最新 K 线更新。

#### Scenario: 数据窗口

- **WHEN** 打开 Data Window tab
- **THEN** SHALL 展示当前品种与周期下的 OHLCV 数值表，随最新 K 线更新

### Requirement: 图标条面板与新闻入口

系统 SHALL 在右侧提供 44px 常驻图标条（Watchlist / Alerts / News / Data Window / Hotlists / Calendar / OrderBook / Ideas），选中项左侧 2px 蓝色高亮竖条且图标变白；点击当前 tab 图标 SHALL 折叠/展开面板；面板宽度 SHALL 在 260-500px 间可拖拽，且 SHALL NOT 以固定宽度类（如 `w-[280px]`）写死。拖拽 SHALL 通过面板左缘的拖拽手柄实时调整宽度并限制在 260-500px；调整后的宽度 SHALL 被持久化（如 `localStorage`），重载后复原。News tab SHALL 存在并接入 BlockBeats 快讯数据源。

#### Scenario: tab 选中态

- **WHEN** 点击图标条某 tab
- **THEN** 该图标 SHALL 左侧出现 2px 蓝条并变白，面板切换内容

#### Scenario: 面板折叠

- **WHEN** 点击当前已展开 tab 的图标
- **THEN** 面板 SHALL 折叠为仅图标条，图表区占满释放空间

#### Scenario: 面板宽度拖拽

- **WHEN** 拖拽面板左缘
- **THEN** 面板宽度 SHALL 在 260-500px 间实时调整

#### Scenario: 拖拽越界被钳制

- **WHEN** 用户将面板左缘拖到小于 260px 或大于 500px 的位置
- **THEN** 面板宽度 SHALL 被钳制在 260px / 500px 边界，MUST NOT 超出范围

#### Scenario: 宽度持久化

- **WHEN** 用户调整面板宽度后重新加载应用
- **THEN** 面板宽度 SHALL 恢复为用户上次设定的值（限制在 260-500px）

#### Scenario: News 入口存在

- **WHEN** 渲染右图标条
- **THEN** SHALL 出现 News tab，点击后 SHALL 呈现接入 BlockBeats 数据源的市场头条面板

### Requirement: 市场头条分类栏

系统 SHALL 在市场头条（News）面板以可折叠的紧凑 chip 组呈现新闻分类，MUST NOT 采用"仅单行横向滚动堆叠"的呈现方式。折叠态 SHALL 单行呈现且不额外占用垂直空间，末尾 SHALL 常驻"展开/收起"切换控件；展开态 SHALL 换行完整平铺全部分类。当前活动分类 SHALL 在折叠态始终可见——若其在折叠态处于被裁切位置，系统 SHALL 将其提前呈现。分类集合 SHALL 沿用既有的 10 项 `NEWSFLASH_TYPES`，MUST NOT 增删分类或引入新数据源。

#### Scenario: 折叠态单行呈现

- **WHEN** 打开市场头条面板且未展开分类
- **THEN** 分类 chip SHALL 呈现为单行且末尾 SHALL 显示展开控件，SHALL NOT 因分类过多而出现横向滚动条

#### Scenario: 展开查看全部分类

- **WHEN** 点击展开控件
- **THEN** 全部 10 个分类 SHALL 换行平铺完整可见；再次点击 SHALL 收起回单行

#### Scenario: 活动分类始终可见

- **WHEN** 选中一个在折叠态原本处于裁切位置的分类后收起分类栏
- **THEN** 该活动分类 SHALL 依然可见并保持选中态高亮

#### Scenario: 切换分类拉取对应新闻

- **WHEN** 点击某个分类 chip
- **THEN** 系统 SHALL 按该分类 key 拉取新闻并更新列表，该 chip SHALL 呈现选中态

### Requirement: 市场头条新闻列表排版

系统 SHALL 以高信息密度呈现市场头条新闻列表：时间 SHALL 显示为相对时间（1 分钟内"刚刚"、1 小时内"N 分钟前"、24 小时内"N 小时前"、更早为 `MM-DD HH:mm`），MUST NOT 直接呈现 ISO 时间戳；列表 SHALL 按日期分组并显示分组标题（今天 / 昨天 / `MM-DD`）；标题 SHALL 最多 2 行截断，摘要 SHALL 最多 2 行截断且以弱化文字色呈现；"全文"链接等次级操作 SHALL 在条目 hover 时渐显，静置时保持列表干净。时间格式化 SHALL 在展示层完成，MUST NOT 改变 `NewsItem.time` 的 ISO 字符串契约。

#### Scenario: 相对时间显示

- **WHEN** 渲染一条 10 分钟前发布的新闻
- **THEN** 其时间 SHALL 显示为"10 分钟前"，SHALL NOT 显示 ISO 时间戳

#### Scenario: 更早新闻显示日期时间

- **WHEN** 渲染一条超过 24 小时的新闻
- **THEN** 其时间 SHALL 显示为 `MM-DD HH:mm` 格式

#### Scenario: 日期分组

- **WHEN** 新闻列表跨越多个日期
- **THEN** SHALL 按日期分组并在每组前显示分组标题，当天组标题 SHALL 为"今天"、前一天为"昨天"

#### Scenario: 标题与摘要截断

- **WHEN** 某条新闻标题或摘要超过限定行数
- **THEN** 标题 SHALL 截断至最多 2 行、摘要 SHALL 截断至最多 2 行，SHALL NOT 无限撑高条目

#### Scenario: 次级操作 hover 渐显

- **WHEN** 鼠标未悬停于某新闻条目
- **THEN** 该条目的"全文"链接 SHALL 隐藏；悬停时 SHALL 渐显

#### Scenario: 列表使用隐式滚动条

- **WHEN** 新闻列表内容超出面板高度
- **THEN** 该列表 SHALL 使用主题化隐式滚动条，静置时滑块不可见、hover 时渐显

