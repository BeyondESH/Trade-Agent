## ADDED Requirements

### Requirement: 文本补全调用可独立获取

系统 SHALL 提供独立于决策 provider 的文本补全工厂：对支持文本补全的 provider 配置返回 `complete(system, user) -> str` 可调用，对规则基线 provider 返回 `None`。该补全 SHALL 可被反思等非决策用途复用，且获取补全 MUST NOT 改变决策契约。

#### Scenario: 非规则 provider 返回补全

- **WHEN** 以 `openai`/`ollama`/`llm` 配置获取文本补全
- **THEN** 系统 SHALL 返回可调用的补全函数

#### Scenario: 规则基线返回空

- **WHEN** 以 `rule` 配置获取文本补全
- **THEN** 系统 SHALL 返回 `None`，调用方据此回退启发式
