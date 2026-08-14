# walk-forward-training Specification

## Purpose
TBD - created by archiving change dl-quant-engine. Update Purpose after archive.
## Requirements
### Requirement: 时序切分训练/预测

系统 SHALL 按时间顺序切分训练/测试(训练全部早于测试),标准化参数仅由训练集估计。MUST 无数据泄漏。

#### Scenario: 训练早于测试

- **WHEN** 对长度 n 做切分
- **THEN** 所有训练索引 SHALL 小于所有测试索引

#### Scenario: 标准化不泄漏

- **WHEN** 训练并在测试集预测
- **THEN** 标准化的均值/方差 SHALL 仅来自训练集

