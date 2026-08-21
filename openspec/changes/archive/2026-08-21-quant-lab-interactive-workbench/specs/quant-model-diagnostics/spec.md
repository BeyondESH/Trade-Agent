# quant-model-diagnostics Specification

## Purpose
模型诊断可视化:ROC 曲线(AUC)与特征权重条形图(lr 系数 / hgb 特征重要性),让用户直观评估模型区分度与各因子贡献。

## ADDED Requirements

### Requirement: ROC 曲线可视化

QUANT LAB SHALL 在模型诊断视图中渲染 ROC 曲线:曲线数据来自后端 `result.roc_curve`(fpr/tpr 序列),并 SHALL 标注 AUC(复用现有 `model_metrics.roc_auc`);数据缺失时 SHALL 显示空态而非报错。

#### Scenario: 渲染 ROC 曲线

- **WHEN** 回测结果含 `roc_curve` 且含 `model_metrics.roc_auc`
- **THEN** SHALL 以 FPR 为横轴、TPR 为纵轴绘制 ROC 曲线并展示 AUC 数值

#### Scenario: ROC 数据缺失

- **WHEN** 回测结果不含 `roc_curve`(如旧引擎或旧历史记录)
- **THEN** 诊断视图 SHALL 显示"无 ROC 数据"空态,不影响其他诊断组件渲染

### Requirement: 特征权重条形图

QUANT LAB SHALL 渲染特征权重条形图:lr 模型显示各特征 `|coef_|`,hgb 模型显示各特征 `feature_importances_`;特征名 SHALL 对齐实际使用的因子集。权重数据缺失时 SHALL 显示空态。

#### Scenario: lr 系数条形图

- **WHEN** 回测模型为 lr 且结果含 `feature_weights`(kind=coef)
- **THEN** SHALL 按 |系数| 渲染各因子横向条形图,系数方向(正/负)以颜色区分

#### Scenario: hgb 重要性条形图

- **WHEN** 回测模型为 hgb 且结果含 `feature_weights`(kind=importance)
- **THEN** SHALL 按特征重要性渲染各因子条形图

#### Scenario: 权重数据缺失

- **WHEN** 回测结果不含 `feature_weights`
- **THEN** 权重图 SHALL 显示空态,不影响 ROC 等其余诊断组件
