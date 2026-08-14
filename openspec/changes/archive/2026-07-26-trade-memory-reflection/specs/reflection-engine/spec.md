## ADDED Requirements

### Requirement: 反思生成

系统 SHALL 为一笔交易生成反思文本(启发式基线),并 MAY 使用注入的 LLM 生成;LLM 失败时 MUST 回退启发式。

#### Scenario: 启发式反思

- **WHEN** 对一笔已平仓交易生成反思且未注入 LLM
- **THEN** 系统 SHALL 返回含盈亏与情境要点的反思文本

#### Scenario: LLM 失败回退

- **WHEN** 注入的 LLM 调用抛错
- **THEN** 系统 SHALL 回退到启发式反思

### Requirement: 参数自调建议

系统 SHALL 依据近期已平仓样本产出风控/策略参数调整建议;样本不足时返回空建议。建议 MUST NOT 被自动应用。

#### Scenario: 表现不佳给出建议

- **WHEN** 近期同类交易胜率过低且样本足够
- **THEN** 系统 SHALL 返回参数调整建议(如提高强度阈值)

#### Scenario: 样本不足不建议

- **WHEN** 样本量低于门槛
- **THEN** 系统 SHALL 返回空建议

### Requirement: 经验规则提炼

系统 SHALL 从亏损模式提炼可读的经验规则文本集合。

#### Scenario: 提炼规则

- **WHEN** 存在可识别的亏损模式
- **THEN** 系统 SHALL 返回相应的经验规则文本
