# quant-engine-vectorbt Specification

## Purpose
以 vectorbt v1.x 全量重写量化引擎:组合模拟(`vbt.Portfolio`)、walk-forward/多区间切分、信号工具、参数扫描与绩效分析。接受 vectorbt 标准语义,替代手写向量化回测。

## ADDED Requirements

### Requirement: vectorbt 组合模拟回测

系统 SHALL 使用 `vbt.Portfolio.from_signals`(或等价 vectorbt Portfolio API)执行回测,接受 vectorbt 标准成交/费用/滑点/持仓语义,不再维护自定义的"信号下一根生效/翻仓双边成本/末根按市值"逻辑。

#### Scenario: 信号驱动回测

- **WHEN** 传入对齐到蜡烛序列的 close、entries 与 exits 信号
- **THEN** 系统 SHALL 通过 vectorbt Portfolio 生成持仓与净值序列
- **AND** 费用/滑点 SHALL 按 vectorbt 参数(fees/slippage/freq)建模

#### Scenario: 标准语义生效

- **WHEN** 对比新旧回测引擎对同一信号序列的输出
- **THEN** 系统 SHALL 以 vectorbt 语义为唯一口径,不再保证与旧引擎一致

### Requirement: 回测输出结构

系统 SHALL 从 vectorbt Portfolio 产出标量指标、逐 bar 权益/回撤序列与逐笔交易记录,并按 vectorbt 口径映射到 `/backtest` 响应。

#### Scenario: 指标与序列输出

- **WHEN** 完成一次回测
- **THEN** 响应 SHALL 包含标量指标(total_return/max_drawdown/win_rate/trades/bars)与 open_time/equity/drawdown 序列
- **AND** 逐笔交易记录 SHALL 采用 vectorbt trades 字段(方向/开平仓时间价格/持仓 bar/盈亏)

#### Scenario: 空交易

- **WHEN** 回测产生零笔交易
- **THEN** 交易记录 SHALL 为空列表而非缺失

### Requirement: 多区间与 walk-forward 切分

系统 SHALL 使用 vectorbt splitter 支持多区间(range_split)与 walk-forward(walk_forward)切分,替代单一 `time_split`。

#### Scenario: 多区间回测

- **WHEN** 用户指定多个时间窗口
- **THEN** 系统 SHALL 一次性对每个窗口执行回测并返回各窗口结果

#### Scenario: walk-forward

- **WHEN** 执行 walk-forward 训练/回测
- **THEN** 每次折叠的测试区间 SHALL 严格晚于其训练区间

### Requirement: 参数扫描

系统 SHALL 利用 vectorbt 矩阵广播对回测参数(threshold/fee/slippage 等)执行网格扫描。

#### Scenario: 参数网格

- **WHEN** 用户提供一组参数取值(如多个 threshold 与 fee)
- **THEN** 系统 SHALL 一次计算全部组合的指标并返回结果矩阵

### Requirement: 绩效指标

系统 SHALL 提供 vectorbt returns 指标与 QuantStats 集成(qs_adapter)生成绩效摘要。

#### Scenario: 指标摘要

- **WHEN** 请求某次回测的绩效摘要
- **THEN** 系统 SHALL 返回含 Sharpe/Sortino/Calmar/profit_factor 等指标值

### Requirement: 回测确定性

vectorbt 回测路径 SHALL 对相同输入序列与相同参数产出相同结果(Numba 确定性)。

#### Scenario: 相同输入相同输出

- **WHEN** 以相同数据与参数运行两次回测
- **THEN** 两次 equity/指标结果 SHALL 完全一致
