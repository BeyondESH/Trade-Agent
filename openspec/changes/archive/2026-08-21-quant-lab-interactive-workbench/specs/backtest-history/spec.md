# backtest-history Specification

## Purpose
历史记录持久化扩展:新输出字段(feature_weights/roc_curve/benchmark)与历史记录保持一致,便于回看完整呈现。

## ADDED Requirements

### Requirement: 新字段历史持久化

回测历史记录 SHALL 在存在时持久化 `feature_weights`、`roc_curve` 与 `series.benchmark` 新字段;字段缺失(旧记录)时 SHALL 保持兼容,详情返回 SHALL 省略缺失字段,前端按现有降级规则处理。

#### Scenario: 新记录持久化新字段

- **WHEN** 一次回测结果含 feature_weights/roc_curve/benchmark 且被保存为历史记录
- **THEN** 历史详情 SHALL 返回这些字段,列表元数据 SHALL 不含曲线级字段

#### Scenario: 旧记录兼容

- **WHEN** 历史记录为旧 schema(无新字段)
- **THEN** 详情返回 SHALL 不包含新字段,前端诊断视图 SHALL 显示空态而非报错
