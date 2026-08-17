# chart-theming Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: 图表 TV 风格配色

系统 SHALL 将 K 线图表配色为 TradingView 风格：上涨 `#089981`、下跌 `#f23645`、强调 `#2962ff`，网格/分隔线 `#2a2e39`（明度只比背景高一档，可单独开关横/竖线），十字光标 `#9598A1`。配色变化 MUST NOT 改变图表的数据流与既有 props 语义。

#### Scenario: 蜡烛配色

- **WHEN** 渲染 K 线
- **THEN** 上涨蜡烛 SHALL 为 `#089981`、下跌蜡烛为 `#f23645`，body 有同色描边、wick 1px

#### Scenario: 网格与十字光标

- **WHEN** 渲染图表
- **THEN** 网格 SHALL 为 `#2a2e39` 实线，十字光标 SHALL 为 `#9598A1` 虚线

#### Scenario: 数据流不变

- **WHEN** 传入相同 candles/analyze
- **THEN** 图表 SHALL 展示相同的数据(仅视觉配色不同)

### Requirement: 低透明度文本水印

系统 SHALL 在画布正中显示极低透明度（约 3-5%）的文本水印 `BTCUSDT · 15 · Bitget`（跟随当前品种/周期），替换默认 Logo 水印；水印 MUST NOT 影响图表交互。

#### Scenario: 文本水印渲染

- **WHEN** 图表加载完成
- **THEN** K 线区域 SHALL 居中显示低透明度的 `品种 · 周期 · 交易所` 文本水印

#### Scenario: 水印随品种/周期更新

- **WHEN** 切换品种或周期
- **THEN** 水印文本 SHALL 同步更新

#### Scenario: 数据流与配色不变

- **WHEN** 替换水印后渲染相同 candles/analyze
- **THEN** 图表 SHALL 展示相同数据与配色，仅水印形态不同

