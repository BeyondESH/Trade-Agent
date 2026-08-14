## ADDED Requirements

### Requirement: K 线图与叠加层

系统 SHALL 用 lightweight-charts 渲染 K 线,并叠加指标线、S/R 水平线,以及趋势线与箱体 overlay。

#### Scenario: 渲染 K 线

- **WHEN** 提供 candles 数据
- **THEN** 图表 SHALL 显示对应的 K 线

#### Scenario: 叠加 S/R 水平线

- **WHEN** 提供 S/R 候选位
- **THEN** 图表 SHALL 在对应价格绘制水平线

### Requirement: 图表数据转换

系统 SHALL 提供纯函数将 API 数据转换为图表所需格式(K 线序列、价格线、趋势线段、箱体矩形)。

#### Scenario: candles 转序列

- **WHEN** 传入 API 的 candles(open_time 毫秒 + OHLC)
- **THEN** 转换结果 SHALL 为按时间升序、字段为 time/open/high/low/close 的序列

#### Scenario: levels 转价格线

- **WHEN** 传入 S/R 候选
- **THEN** 转换结果 SHALL 为含价格与类型(支撑/压力)的价格线配置
