# ml-model Specification

## Purpose
模型层能力扩展:模型超参经 webapi 白名单透传至 sklearn,回测结果新增特征权重(coef_/feature_importances_)与 ROC 曲线(fpr/tpr)输出,均为可选字段以兼容旧后端与旧历史。

## ADDED Requirements

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
