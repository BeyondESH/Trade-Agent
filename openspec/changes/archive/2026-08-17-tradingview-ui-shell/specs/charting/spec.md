## ADDED Requirements

### Requirement: 图表左上 legend 浮层

系统 SHALL 在图表左上角叠加 legend 浮层：第一行品种名 + 周期 + 交易所（加粗），第二行 O/H/L/C 四值与涨跌额/幅；下方每个指标一行，行尾 hover 时渐显 眼睛/设置/更多/删除 图标（渐进式披露），操作 SHALL 通过底层图表实例完成（隐藏/参数设置/删除指标）。

#### Scenario: legend 静态展示

- **WHEN** 图表加载完成
- **THEN** legend SHALL 显示品种、周期、OHLC 与当前指标列表

#### Scenario: 指标行操作

- **WHEN** hover legend 指标行并点击 删除/眼睛/设置
- **THEN** 对应指标 SHALL 被移除/显隐/打开参数设置

### Requirement: 坐标轴与十字光标

系统 SHALL 将价格轴置于右侧且宽度自适应（~60-70px，`yAxis.size:'auto'`），刻度 11px，当前价以填充色标签（涨绿跌红、白字）加左侧虚线延伸；时间轴高 28px，右侧保留约 5% 未来空白；轴右下角 SHALL 提供 %/log/auto 三个小切换按钮（hover 图表时淡入），对应价格轴 normal/percentage/log 类型。十字光标 SHALL 为 1px 虚线 `#9598A1`，两端跟随价格轴与时间轴标签块。

#### Scenario: 当前价标签与虚线

- **WHEN** 渲染价格轴
- **THEN** SHALL 显示当前价填充色 pill（涨绿跌红白字）与向左延伸的虚线

#### Scenario: 轴类型切换

- **WHEN** hover 图表并点击 %/log/auto
- **THEN** 价格轴 SHALL 在 normal/percentage/log 之间切换

#### Scenario: 十字光标标签

- **WHEN** 移动十字光标
- **THEN** 价格轴与时间轴 SHALL 跟随显示对应数值标签块

### Requirement: 成交量贴底半透明叠加

系统 SHALL 默认将成交量作为半透明副图叠加在主图底部（高度约主图 20%，透明度 ~0.5），而非独立完整副图 pane；副图指标（MACD/RSI 等）仍为独立 pane，支持分隔线拖拽。

#### Scenario: 成交量叠加渲染

- **WHEN** 图表加载完成
- **THEN** SHALL 在主图底部显示半透明成交量柱，不挤压主图可用高度

## MODIFIED Requirements

### Requirement: 图表数据转换

系统 SHALL 提供纯函数将 API 数据转换为 klinecharts-pro 所需格式（K 线序列、价格线、趋势线段、箱体矩形），时间戳单位与 API 的毫秒 `open_time` 对齐。

#### Scenario: candles 转序列

- **WHEN** 传入 API 的 candles(open_time 毫秒 + OHLC)
- **THEN** 转换结果 SHALL 为按时间升序、字段为 timestamp/open/high/low/close/volume 且时间戳单位为毫秒的序列

#### Scenario: levels 转价格线

- **WHEN** 传入 S/R 候选
- **THEN** 转换结果 SHALL 为含价格与类型(支撑/压力)的 klinecharts priceLine 配置

#### Scenario: 结构转叠加段

- **WHEN** 传入趋势线与箱体
- **THEN** 转换结果 SHALL 为 klinecharts 的 segment/rect overlay 配置
