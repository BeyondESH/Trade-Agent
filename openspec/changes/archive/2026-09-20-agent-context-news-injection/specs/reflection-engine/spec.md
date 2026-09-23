## ADDED Requirements

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
