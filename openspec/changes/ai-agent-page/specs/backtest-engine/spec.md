## ADDED Requirements

### Requirement: 回测输出曲线序列

系统 SHALL 在既有标量指标之外,返回对齐测试段时间戳的权益曲线、回撤曲线、逐 bar 信号与预测概率序列。

#### Scenario: 曲线可用

- **WHEN** run_pipeline 完成一次回测
- **THEN** 返回字典 SHALL 含 open_time/equity/drawdown/signal/proba 序列
- **AND** 既有标量键与值 SHALL 保持不变

#### Scenario: 无前视保持

- **WHEN** 检查返回的信号序列与回测净值
- **THEN** 持仓收益 SHALL 仍从信号下一根生效(沿用既有 backtest 逻辑)

### Requirement: 参数化回测

回测 SHALL 接受可选训练参数(train_ratio/threshold/fee/slippage),缺省时行为与现状完全一致。

#### Scenario: 缺省参数

- **WHEN** 不传参数运行回测
- **THEN** 结果 SHALL 与默认参数下的结果一致

#### Scenario: 调整费用

- **WHEN** 提高 fee/slippage
- **THEN** 相同信号的总收益 SHALL 不高于低费用情形
