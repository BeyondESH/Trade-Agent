# walk-forward-training Specification

## Purpose
时序切分升级为 sklearn `TimeSeriesSplit` 多折 walk-forward,兼容既有单一 `train_ratio` 切分,保持无数据泄漏。

## MODIFIED Requirements

### Requirement: 时序切分训练/预测

系统 SHALL 按时间顺序切分训练/测试(训练全部早于测试),标准化参数仅由训练集估计。系统 SHALL 使用 `TimeSeriesSplit` 支持多折 walk-forward,并兼容单一 `train_ratio` 切分。MUST 无数据泄漏。

#### Scenario: 训练早于测试

- **WHEN** 对长度 n 做切分
- **THEN** 所有训练索引 SHALL 小于所有测试索引

#### Scenario: 标准化不泄漏

- **WHEN** 训练并在测试集预测
- **THEN** 标准化的均值/方差 SHALL 仅来自训练集

#### Scenario: 多折 walk-forward

- **WHEN** 指定 n_splits 折数
- **THEN** 系统 SHALL 产出 n_splits 个时间序折叠,每折训练区间严格早于测试区间

#### Scenario: 兼容单次切分

- **WHEN** 仅提供 train_ratio 未指定折数
- **THEN** 行为 SHALL 与既有单次切分一致
