## ADDED Requirements

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
