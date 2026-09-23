## MODIFIED Requirements

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
