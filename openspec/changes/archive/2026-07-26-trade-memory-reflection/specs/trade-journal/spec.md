## ADDED Requirements

### Requirement: 交易记录持久化

系统 SHALL 持久化每笔交易记录(开/平仓价、名义/保证金、杠杆、PnL、策略、理由、反思、情境特征),并支持加载与筛选已平仓记录。

#### Scenario: 追加并加载

- **WHEN** 追加若干交易记录后重新加载
- **THEN** 系统 SHALL 返回与写入一致的记录集合

#### Scenario: 筛选已平仓

- **WHEN** 请求已平仓记录
- **THEN** 系统 SHALL 只返回含平仓价与 PnL 的记录
