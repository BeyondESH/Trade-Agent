# chart-theming Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: 图表 OKX 风格配色

系统 SHALL 将 K 线图表配色为 OKX 风格:上涨绿、下跌红蜡烛,深色网格与十字光标,S/R 价格线按支撑绿/压力红着色。配色变化 MUST NOT 改变图表的数据流与既有 props 语义。

#### Scenario: 蜡烛配色

- **WHEN** 渲染 K 线
- **THEN** 上涨蜡烛 SHALL 为绿色、下跌蜡烛为红色

#### Scenario: 数据流不变

- **WHEN** 传入相同 candles/analyze
- **THEN** 图表 SHALL 展示相同的数据(仅视觉配色不同)

### Requirement: 图表水印可移除

系统 SHALL 允许图表不渲染任何默认水印标识（klinecharts-pro 默认 Logo）。

#### Scenario: 无水印渲染

- **WHEN** 图表终端加载完成
- **THEN** K 线区域 SHALL 不显示默认 Logo 水印

#### Scenario: 数据流与配色不变

- **WHEN** 移除水印后渲染相同 candles/analyze
- **THEN** 图表 SHALL 展示相同数据与配色，仅水印消失

