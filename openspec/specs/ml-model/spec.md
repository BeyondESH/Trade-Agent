# ml-model Specification

## Purpose
TBD - created by archiving change dl-quant-engine. Update Purpose after archive.
## Requirements
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

### Requirement: 模型超参透传

`/backtest` 请求的 `params` SHALL 支持模型超参白名单:`C`/`max_iter`/`solver`(lr)与 `max_depth`/`learning_rate`/`min_samples_leaf`(hgb),后端 SHALL 将其透传给 `SklearnModel`;白名单外的参数 SHALL 被忽略或拒绝,非法值 SHALL 返回 422。

#### Scenario: lr 超参生效

- **WHEN** 请求 `/backtest` 携带 `params.model="lr", C=0.1, max_iter=500`
- **THEN** 后端 SHALL 以 LogisticRegression(C=0.1, max_iter=500) 训练并回测

#### Scenario: hgb 超参生效

- **WHEN** 请求携带 `params.model="hgb", max_depth=4, learning_rate=0.05`
- **THEN** 后端 SHALL 以 HistGradientBoostingClassifier(max_depth=4, learning_rate=0.05) 训练并回测

#### Scenario: 非法超参拒绝

- **WHEN** 请求携带超参白名单外的键或非法取值
- **THEN** 后端 SHALL 返回 422 而非静默忽略

### Requirement: 特征权重输出

`/backtest` 成功结果 SHALL 在存在时返回 `feature_weights` 字段:lr 为 `kind="coef"` + 各特征 |系数| 与符号,hgb 为 `kind="importance"` + 各特征重要性;特征名 SHALL 与请求所用因子集一致;结果不含时 SHALL 省略该字段。

#### Scenario: lr 返回系数权重

- **WHEN** 回测模型为 lr 且训练成功
- **THEN** 结果 SHALL 含 `feature_weights={kind:"coef", features:[...], values:[...]}`

#### Scenario: hgb 返回重要性

- **WHEN** 回测模型为 hgb 且训练成功
- **THEN** 结果 SHALL 含 `feature_weights={kind:"importance", features:[...], values:[...]}`

### Requirement: ROC 曲线输出

`/backtest` 成功结果 SHALL 在测试集可计算时返回 `roc_curve` 字段(`{fpr:[], tpr:[]}`);测试集退化(单类)时 SHALL 省略该字段并保持 `model_metrics.roc_auc=null`。

#### Scenario: 返回 ROC 序列

- **WHEN** 测试集含两个类别且可计算 ROC
- **THEN** 结果 SHALL 含 `roc_curve` 的 fpr/tpr 序列,长度一致且为递增 FPR

#### Scenario: 退化测试集省略

- **WHEN** 测试集仅含单一类别
- **THEN** 结果 SHALL 省略 `roc_curve` 字段,`model_metrics.roc_auc` SHALL 为 null

