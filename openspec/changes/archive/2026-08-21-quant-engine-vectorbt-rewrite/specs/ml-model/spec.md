# ml-model Specification

## Purpose
模型层迁移至 scikit-learn:统一模型接口保留,baseline 由手写 numpy 逻辑回归替换为 `LogisticRegression`+`StandardScaler`,确定性由固定随机种子保证。

## MODIFIED Requirements

### Requirement: 可插拔模型接口与 baseline

系统 SHALL 定义统一模型接口(fit / predict_proba),并提供基于 scikit-learn 的逻辑回归 baseline(`LogisticRegression` + `StandardScaler` Pipeline)。相同数据与超参 MUST 产出相同结果(通过固定 `random_state` 保证)。

#### Scenario: baseline 可学习

- **WHEN** 在线性可分的玩具数据上训练 baseline
- **THEN** 其在训练数据上的预测准确率 SHALL 明显高于随机

#### Scenario: 概率范围

- **WHEN** 调用 predict_proba
- **THEN** 返回值 SHALL 全部落在 [0,1]

#### Scenario: 确定性

- **WHEN** 用相同数据与超参训练两次
- **THEN** 两次预测结果 SHALL 完全一致
