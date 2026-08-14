## ADDED Requirements

### Requirement: 可插拔模型接口与 baseline

系统 SHALL 定义统一模型接口(fit / predict_proba),并提供确定性的 numpy 逻辑回归 baseline(训练集标准化 + 梯度下降)。相同数据与超参 MUST 产出相同结果。

#### Scenario: baseline 可学习

- **WHEN** 在线性可分的玩具数据上训练 baseline
- **THEN** 其在训练数据上的预测准确率 SHALL 明显高于随机

#### Scenario: 概率范围

- **WHEN** 调用 predict_proba
- **THEN** 返回值 SHALL 全部落在 [0,1]

#### Scenario: 确定性

- **WHEN** 用相同数据与超参训练两次
- **THEN** 两次预测结果 SHALL 完全一致
