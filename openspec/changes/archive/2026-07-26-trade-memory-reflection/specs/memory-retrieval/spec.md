## ADDED Requirements

### Requirement: 相似历史交易检索

系统 SHALL 依据情境特征对已平仓交易做相似度检索,返回 Top-K 最相似记录,支持按方向过滤。相似度计算 MUST 不依赖外部嵌入模型。

#### Scenario: 检索相似交易

- **WHEN** 给定当前情境特征
- **THEN** 系统 SHALL 返回按相似度降序的 Top-K 已平仓交易

#### Scenario: 按方向过滤

- **WHEN** 指定方向(long/short)
- **THEN** 检索结果 SHALL 只包含该方向的交易

#### Scenario: 空历史

- **WHEN** 无已平仓历史
- **THEN** 系统 SHALL 返回空列表而非报错
