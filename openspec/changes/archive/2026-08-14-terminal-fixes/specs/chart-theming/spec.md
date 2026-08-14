## ADDED Requirements

### Requirement: 图表水印可移除

系统 SHALL 允许图表不渲染任何默认水印标识（klinecharts-pro 默认 Logo）。

#### Scenario: 无水印渲染

- **WHEN** 图表终端加载完成
- **THEN** K 线区域 SHALL 不显示默认 Logo 水印

#### Scenario: 数据流与配色不变

- **WHEN** 移除水印后渲染相同 candles/analyze
- **THEN** 图表 SHALL 展示相同数据与配色，仅水印消失
