# reflection-engine Specification

## Purpose
TBD - created by archiving change trade-memory-reflection. Update Purpose after archive.
## Requirements
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

### Requirement: 运行时可注入的 LLM 反思

在常驻运行（webapi）中，当配置的 provider 支持文本补全（如 `openai`/`ollama`）时，系统 SHALL 将该文本补全调用注入交易循环的反思生成；当 provider 为规则基线（`rule`）或未配置补全时，系统 SHALL 使用启发式反思，且 MUST NOT 因缺少补全而报错。补全调用抛错时 SHALL 回退启发式。

#### Scenario: 支持补全时使用 LLM 反思

- **WHEN** provider 配置支持文本补全且发生平仓
- **THEN** 反思文本 SHALL 由注入的补全调用生成

#### Scenario: 规则基线回退启发式

- **WHEN** provider 为规则基线（无文本补全）
- **THEN** 反思文本 SHALL 为启发式且系统不报错

#### Scenario: 补全失败回退启发式

- **WHEN** 注入的补全调用抛错
- **THEN** 系统 SHALL 回退到启发式反思

