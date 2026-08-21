# ml-model Specification

## Purpose
模型层允许通过 `BacktestParams.model` 选择逻辑回归或梯度提升分类器,前端提供模型下拉;确定性由固定随机种子保证。

## MODIFIED Requirements

### Requirement: 可插拔模型接口与 baseline

系统 SHALL 定义统一模型接口(fit / predict_proba),并提供基于 scikit-learn 的模型实现:默认逻辑回归 baseline(`LogisticRegression` + `StandardScaler` Pipeline)与可选梯度提升分类器(`HistGradientBoostingClassifier`)。模型选择 SHALL 由 `BacktestParams.model`(`"lr" | "hgb"`)控制,默认 `"lr"`。相同数据与超参 MUST 产出相同结果(通过固定 `random_state` 保证)。

#### Scenario: baseline 可学习

- **WHEN** 在线性可分的玩具数据上训练 baseline
- **THEN** 其在训练数据上的预测准确率 SHALL 明显高于随机

#### Scenario: 概率范围

- **WHEN** 调用 predict_proba
- **THEN** 返回值 SHALL 全部落在 [0,1]

#### Scenario: 确定性

- **WHEN** 用相同数据与超参训练两次
- **THEN** 两次预测结果 SHALL 完全一致

#### Scenario: 模型选择生效

- **WHEN** 前端提交 `model: "hgb"` 执行回测
- **THEN** 后端 SHALL 以 HistGradientBoostingClassifier 训练并评估,`model: "lr"` 或缺失 SHALL 使用逻辑回归 baseline

#### Scenario: 非法模型值拒绝

- **WHEN** 提交非 "lr"/"hgb" 的模型取值
- **THEN** 接口 SHALL 返回 422 校验错误
