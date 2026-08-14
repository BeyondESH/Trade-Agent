# risk-config Specification

## Purpose
TBD - created by archiving change risk-position-management. Update Purpose after archive.
## Requirements
### Requirement: 可配置风控参数

系统 SHALL 提供风控配置,含保证金比例、最大回撤、杠杆上限、加仓次数上限、单币种保证金上限,均有安全默认且 MUST 可由用户调整。配置 MUST 校验取值范围。

#### Scenario: 使用默认配置

- **WHEN** 未提供任何覆盖
- **THEN** 系统 SHALL 采用默认:保证金 5%、回撤 15%、杠杆上限 100、加仓上限 3、单币种保证金 5%

#### Scenario: 覆盖并生效

- **WHEN** 用户修改任一参数
- **THEN** 后续测算与校验 SHALL 按新值执行

#### Scenario: 非法参数被拒

- **WHEN** 传入越界参数(如保证金比例 >1 或杠杆 <1)
- **THEN** 系统 SHALL 拒绝该配置并报错

