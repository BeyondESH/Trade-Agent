# feature-engineering Specification

## Purpose
特征管线适配 sklearn Pipeline;标签构造保留手写无前视逻辑(下一根方向),行为与迁移前一致。

## MODIFIED Requirements

### Requirement: 特征与标签构造(无前视)

系统 SHALL 从 OHLCV 构造机器学习特征与方向标签,且 MUST 无前视偏差:特征只用当前及过去数据,标签为下一根方向并在构造后丢弃无未来的末行。特征构造 SHALL 适配 sklearn Pipeline(标准化在模型层完成,不改变特征矩阵结构)。

#### Scenario: 构造特征与标签

- **WHEN** 传入足够长度的 OHLCV 帧
- **THEN** 系统 SHALL 返回特征矩阵 X 与标签 y,长度一致且无 NaN

#### Scenario: 无前视

- **WHEN** 检查标签对齐
- **THEN** y 在第 t 行 SHALL 仅由 close[t+1] 与 close[t] 决定
- **AND** 特征不包含任何未来信息

#### Scenario: Pipeline 兼容

- **WHEN** 将特征矩阵输入 sklearn Pipeline(StandardScaler + 模型)
- **THEN** 特征列顺序与命名 SHALL 保持不变
