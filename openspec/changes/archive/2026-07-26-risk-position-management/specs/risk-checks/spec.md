## ADDED Requirements

### Requirement: 下单前风控校验

系统 SHALL 在下单前对意图单执行校验,顺序覆盖:杠杆上限、单币种加仓次数上限、单币种保证金上限、组合总保证金上限。校验结果 MUST 可解释(通过/缩减/拒绝 + 原因)。

#### Scenario: 通过校验

- **WHEN** 意图单在所有上限之内
- **THEN** 系统 SHALL 返回通过,给出保证金/敞口/杠杆

#### Scenario: 加仓次数超限被拒

- **WHEN** 某币种加仓次数已达上限
- **THEN** 系统 SHALL 拒绝该单
- **AND** 原因指明加仓超限

#### Scenario: 敞口超限被缩减

- **WHEN** 意图保证金使单币种或组合超上限但仍有部分额度
- **THEN** 系统 SHALL 缩减至上限内并标记原因

#### Scenario: 无可用额度被拒

- **WHEN** 组合占用保证金已达上限
- **THEN** 系统 SHALL 拒绝新单并说明原因
