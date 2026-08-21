# feature-engineering Specification

## Purpose
TBD - created by archiving change dl-quant-engine. Update Purpose after archive.
## Requirements
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

### Requirement: 可配置因子集

特征构造 SHALL 支持用户配置的因子集(目录实例 + 白名单表达式);未配置时 MUST 保持默认 7 因子的既有行为。

#### Scenario: 缺省兼容

- **WHEN** 不传因子配置调用 build_features
- **THEN** 输出特征列与标签 SHALL 与当前默认 7 因子完全一致

#### Scenario: 配置驱动构造

- **WHEN** 传入启用因子列表(preset/expr)
- **THEN** 特征矩阵 SHALL 仅含所列因子列
- **AND** 丢弃含 NaN 的行行为与既有逻辑一致

#### Scenario: 无前视保持

- **WHEN** 使用自定义因子集构造特征
- **THEN** 每个因子列 SHALL 仍只用当前及过去 bar 的数据计算

