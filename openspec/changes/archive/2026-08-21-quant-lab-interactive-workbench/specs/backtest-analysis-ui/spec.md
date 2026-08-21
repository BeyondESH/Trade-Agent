# backtest-analysis-ui Specification

## Purpose
曲线分析增强:权益曲线叠加 buy&hold 基准、proba+阈值带、月度收益年×月热力图(保留柱状图切换);错误横幅透出 pipeline 错误。

## MODIFIED Requirements

### Requirement: 收益经济学图形

回测 tab SHALL 使用 Recharts 渲染收益相关图形:月度收益(默认年×月热力图,可切换柱状图)、单笔交易盈亏柱状图、收益分布直方图、权益与回撤曲线(权益 SHALL 叠加 buy&hold 基准线)、proba 时间序列 + 阈值带。图形数据 SHALL 由可单测的纯函数计算。

#### Scenario: 月度收益柱状图

- **WHEN** 存在 equity 与 open_time 序列
- **THEN** SHALL 按年×月聚合出月度收益并渲染热力图(正收益与负收益以不同颜色区分),可切换为柱状图

#### Scenario: 单笔交易盈亏柱状

- **WHEN** 存在 trade_list 列表
- **THEN** SHALL 渲染每笔交易的净利柱,盈利绿/亏损红

#### Scenario: 收益分布直方图

- **WHEN** 存在 equity 序列且点数足够分桶
- **THEN** SHALL 对 equity 差分分桶并渲染频率直方图

#### Scenario: 权益与回撤曲线

- **WHEN** 存在 series 且含 `benchmark` 序列
- **THEN** SHALL 渲染权益曲线与回撤曲线,并在权益图叠加 buy&hold 基准线
- **AND** `benchmark` 缺失时 SHALL 仅渲染权益曲线,不报错

#### Scenario: proba 与阈值带

- **WHEN** series 含 proba 序列
- **THEN** SHALL 渲染 proba 时间序列,并绘制 `thresh` 与 `1-thresh` 两条阈值线标识信号切分边界

## ADDED Requirements

### Requirement: 基准序列计算

前端 SHALL 支持基准曲线渲染:优先使用后端返回的 `series.benchmark`;后端缺失时 SHALL 尝试用 equity 首值归一化 `close`(若前端已有 close 数据)或显示无基准提示。纯函数 `benchmarkSeries` SHALL 可单测。

#### Scenario: 后端基准优先

- **WHEN** 回测结果含 `series.benchmark`
- **THEN** 权益图 SHALL 使用该序列绘制基准线

#### Scenario: 缺失降级

- **WHEN** 回测结果不含 `series.benchmark` 且前端无 close 序列
- **THEN** 权益图 SHALL 仅渲染权益曲线并显示"无基准"占位提示
