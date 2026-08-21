# quant-model-training Specification

## Purpose
以 scikit-learn 构建量化模型层:LogisticRegression+StandardScaler 替换手写 baseline,HistGradientBoosting 可选,TimeSeriesSplit 交叉验证与模型评估指标,确定性由固定随机种子保证。

## ADDED Requirements

### Requirement: sklearn 模型层

系统 SHALL 以 scikit-learn 估计器(`LogisticRegression`+`StandardScaler` Pipeline)替换手写 `LogisticRegressionNP`,并保留 `Model` Protocol 插拔接口(fit/predict_proba)。

#### Scenario: 可插拔模型

- **WHEN** 训练流程接收任意满足 `fit(X, y)`/`predict_proba(X)` 的 sklearn 估计器
- **THEN** 系统 SHALL 无适配层直接使用

#### Scenario: 标准化不泄漏

- **WHEN** 在训练/测试切分上训练并预测
- **THEN** 标准化的均值/方差 SHALL 仅由训练集估计(Pipeline 内 StandardScaler)

### Requirement: 多模型支持

系统 SHALL 提供至少两个可选模型:`LogisticRegression`(默认 baseline)与 `HistGradientBoostingClassifier`。

#### Scenario: 模型切换

- **WHEN** 用户指定使用 HGBT
- **THEN** 系统 SHALL 以 HGBT 训练并回测,结果口径与 LR 一致

### Requirement: TimeSeriesSplit 交叉验证

系统 SHALL 使用 `TimeSeriesSplit` 支持多折 walk-forward 交叉验证,兼容单次 `train_ratio` 切分。

#### Scenario: 多折验证

- **WHEN** 指定折数 n_splits
- **THEN** 每一折的训练区间 SHALL 全部早于测试区间

#### Scenario: 兼容单次切分

- **WHEN** 未指定折数(仅 train_ratio)
- **THEN** 行为 SHALL 与既有单次切分一致

### Requirement: 模型评估指标

系统 SHALL 在模型层提供 `roc_auc` 与 `log_loss` 评估指标,用于模型选择与报告。

#### Scenario: 输出评估值

- **WHEN** 完成一次训练/预测
- **THEN** 结果 SHALL 包含测试集上的 roc_auc 与 log_loss

### Requirement: 训练确定性

sklearn 模型训练 SHALL 通过固定 `random_state`(或全局 `SKLEARN_SEED`)保证确定性:相同数据与超参 MUST 产出相同结果。

#### Scenario: 确定性

- **WHEN** 以相同数据与超参训练两次
- **THEN** 两次预测结果 SHALL 完全一致
