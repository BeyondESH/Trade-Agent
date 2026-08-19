## ADDED Requirements

### Requirement: 图标条面板与新闻入口

系统 SHALL 在右侧提供 44px 常驻图标条（Watchlist / Alerts / News / Data Window / Hotlists / Calendar / OrderBook / Ideas），选中项左侧 2px 蓝色高亮竖条且图标变白；点击当前 tab 图标 SHALL 折叠/展开面板；面板宽度 SHALL 在 260-500px 间可拖拽。News tab SHALL 存在并接入 BlockBeats 快讯数据源。

#### Scenario: tab 选中态

- **WHEN** 点击图标条某 tab
- **THEN** 该图标 SHALL 左侧出现 2px 蓝条并变白，面板切换内容

#### Scenario: 面板折叠

- **WHEN** 点击当前已展开 tab 的图标
- **THEN** 面板 SHALL 折叠为仅图标条，图表区占满释放空间

#### Scenario: 面板宽度拖拽

- **WHEN** 拖拽面板左缘
- **THEN** 面板宽度 SHALL 在 260-500px 间实时调整

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

## REMOVED Requirements

### Requirement: 图标条与面板

**Reason**: 该需求同时承载了图标条面板行为与其内部的"无 News 入口"约束。其中"News tab 被移除（范围外，无数据源）"这一约束已与实现偏离——右侧栏已内置 News tab，并通过 `api.blockbeatsNews` 接入 BlockBeats 快讯数据源，数据源前提不再成立；本次变更进一步优化了该面板的分类栏与列表排版。由于 "无 News 入口" 是图标条需求下的一个场景（OpenSpec 无法单独移除场景），故整体移除本需求，并以新增的"图标条面板与新闻入口"需求承载更新后的全部行为。

**Migration**: 图标条的行为（44px 常驻图标条、选中蓝色竖条、折叠/展开、宽度拖拽）与 News 入口行为统一定义于新增需求"图标条面板与新闻入口"中；市场头条的分类栏与列表排版由新增的"市场头条分类栏"与"市场头条新闻列表排版"两项需求定义。
