## MODIFIED Requirements

### Requirement: 图标条与面板

系统 SHALL 在右侧提供 44px 常驻图标条（Watchlist / Alerts / Data Window / DOM / OrderBook / Broker），选中项左侧 2px 蓝色高亮竖条且图标变白；点击当前 tab 图标 SHALL 折叠/展开面板；面板宽度 SHALL 在 260-500px 间可拖拽。News tab SHALL 被移除（范围外，无数据源）。

#### Scenario: tab 选中态

- **WHEN** 点击图标条某 tab
- **THEN** 该图标 SHALL 左侧出现 2px 蓝条并变白，面板切换内容

#### Scenario: 面板折叠

- **WHEN** 点击当前已展开 tab 的图标
- **THEN** 面板 SHALL 折叠为仅图标条，图表区占满释放空间

#### Scenario: 面板宽度拖拽

- **WHEN** 拖拽面板左缘
- **THEN** 面板宽度 SHALL 在 260-500px 间实时调整

#### Scenario: 无 News 入口

- **WHEN** 渲染右图标条
- **THEN** SHALL NOT 出现 News tab 或新闻入口

## REMOVED Requirements

### Requirement: Data Window 与 News

**Reason**: News 已从产品范围移除（无数据源），其空态场景随之下线；Data Window 内容由新增的 `Data Window` requirement 承接。
**Migration**: 使用下方新增的 `Data Window` requirement 描述 OHLCV 数据表行为；News 相关场景不再适用。

## ADDED Requirements

### Requirement: Data Window

系统 SHALL 提供 Data Window tab（当前 K 线的 O/H/L/C/V 数据表）；该数据 SHALL 随十字线悬停与最新 K 线更新。

#### Scenario: 数据窗口

- **WHEN** 打开 Data Window tab
- **THEN** SHALL 展示当前品种与周期下的 OHLCV 数值表，随最新 K 线更新
