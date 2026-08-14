## ADDED Requirements

### Requirement: 图表 OKX 风格配色

系统 SHALL 将 K 线图表配色为 OKX 风格:上涨绿、下跌红蜡烛,深色网格与十字光标,S/R 价格线按支撑绿/压力红着色。配色变化 MUST NOT 改变图表的数据流与既有 props 语义。

#### Scenario: 蜡烛配色

- **WHEN** 渲染 K 线
- **THEN** 上涨蜡烛 SHALL 为绿色、下跌蜡烛为红色

#### Scenario: 数据流不变

- **WHEN** 传入相同 candles/analyze
- **THEN** 图表 SHALL 展示相同的数据(仅视觉配色不同)
