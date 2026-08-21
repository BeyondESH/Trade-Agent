# backtest-engine Specification

## Purpose
回测引擎迁移至 vectorbt 标准语义:`/backtest` 与 `run_pipeline` 输出的曲线序列、指标与逐笔交易记录按 vectorbt Portfolio 口径提供。

## MODIFIED Requirements

### Requirement: 回测输出曲线序列

系统 SHALL 在既有标量指标之外,返回对齐测试段时间戳的权益曲线、回撤曲线、逐 bar 信号与预测概率序列,序列由 vectorbt Portfolio 产出。

#### Scenario: 曲线可用

- **WHEN** run_pipeline 完成一次回测
- **THEN** 返回字典 SHALL 含 open_time/equity/drawdown/signal/proba 序列
- **AND** 序列 SHALL 由 vectorbt Portfolio 的状态与返回结果映射得到

#### Scenario: 无前视保持

- **WHEN** 检查返回的信号序列与回测净值
- **THEN** 持仓收益 SHALL 仍从信号下一根生效(沿用既有 backtest 逻辑)

#### Scenario: 标准语义口径

- **WHEN** 检查回测净值与交易记录
- **THEN** 口径 SHALL 为 vectorbt 标准成交/费用语义,不再沿用旧引擎的"下一根生效/翻仓双边成本"自定义语义

### Requirement: 参数化回测

回测 SHALL 接受可选训练与交易参数(train_ratio/threshold/fee/slippage),缺省时按默认参数运行;费用/滑点 SHALL 映射到 vectorbt Portfolio 的 fees/slippage。

#### Scenario: 缺省参数

- **WHEN** 不传参数运行回测
- **THEN** 结果 SHALL 与默认参数下的结果一致

#### Scenario: 调整费用

- **WHEN** 提高 fee/slippage
- **THEN** 相同信号的总收益 SHALL 不高于低费用情形
