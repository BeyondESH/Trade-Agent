# feature-engineering Specification

## Purpose
TBD - created by archiving change dl-quant-engine. Update Purpose after archive.
## Requirements
### Requirement: 特征与标签构造(无前视)

系统 SHALL 从 OHLCV 构造机器学习特征与方向标签,且 MUST 无前视偏差:特征只用当前及过去数据,标签为下一根方向并在构造后丢弃无未来的末行。

#### Scenario: 构造特征与标签

- **WHEN** 传入足够长度的 OHLCV 帧
- **THEN** 系统 SHALL 返回特征矩阵 X 与标签 y,长度一致且无 NaN

#### Scenario: 无前视

- **WHEN** 检查标签对齐
- **THEN** y 在第 t 行 SHALL 仅由 close[t+1] 与 close[t] 决定
- **AND** 特征不包含任何未来信息

