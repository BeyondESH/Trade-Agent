## ADDED Requirements

### Requirement: 向量化回测(计费用/滑点,无前视)

系统 SHALL 对每根 bar 的信号做向量化回测:持仓在下一根生效(无前视),计入手续费与滑点,并产出总收益、胜率、最大回撤、交易次数等指标。

#### Scenario: 信号下一根生效

- **WHEN** 在 t 生成信号
- **THEN** 该信号对应的持仓收益 SHALL 从 t+1 起计,不使用 t 当根未来信息

#### Scenario: 计入费用降低收益

- **WHEN** 提高手续费/滑点
- **THEN** 相同信号的总收益 SHALL 不高于低费用情形

#### Scenario: 输出指标

- **WHEN** 回测完成
- **THEN** 系统 SHALL 返回含总收益、最大回撤、胜率、交易次数的指标字典
