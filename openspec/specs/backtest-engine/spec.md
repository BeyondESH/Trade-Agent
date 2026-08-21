# backtest-engine Specification

## Purpose
TBD - created by archiving change dl-quant-engine. Update Purpose after archive.
## Requirements
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

### Requirement: 回测输出逐笔交易列表

系统 SHALL 在既有标量与曲线序列之外,返回对齐测试段的逐笔交易列表 `trade_list[]`,每条含 side(方向)、entry_time/entry_price(开仓时间/价格)、exit_time/exit_price(平仓时间/价格)、bars(持仓 bar 数)、gross_return(毛利)、net_return(净利,含双边手续费与滑点)。既有键与值(含标量 `trades` 交易次数)SHALL 保持不变。

#### Scenario: 交易列表可用

- **WHEN** run_pipeline 完成一次回测且测试段存在非零持仓
- **THEN** 返回字典 SHALL 含 `trade_list` 列表
- **AND** 每条交易 SHALL 含 side/entry_time/entry_price/exit_time/exit_price/bars/gross_return/net_return
- **AND** 既有标量键(含 `trades` 计数)与 `series` 键 SHALL 保持不变

#### Scenario: 无前视保持

- **WHEN** 检查逐笔交易的入场价与持仓生效关系
- **THEN** 入场价 SHALL 取持仓生效前一 bar 的 close(沿用 position = signal.shift(1) 语义)

#### Scenario: 权益重构不变量

- **WHEN** 按时间顺序叠加所有交易的 net_return 重构权益曲线
- **THEN** 重构权益 SHALL 与返回的 equity 序列在浮点容差内一致

#### Scenario: 反号翻转双边费用

- **WHEN** 持仓从 +1 直接翻转为 -1(或反向)
- **THEN** 该翻转 SHALL 记为一笔平仓加一笔新开仓,各计一次 fee+slippage 成本

#### Scenario: 空交易段

- **WHEN** 测试段全程无持仓(全 0 信号)
- **THEN** trade_list SHALL 为空列表且总收益/交易次数 SHALL 为 0

