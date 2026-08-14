## ADDED Requirements

### Requirement: 可插拔 LLM Provider

系统 SHALL 提供统一的 LLM Provider 抽象,兼容主流供应商(OpenAI 及兼容端点)与本地 Ollama,并提供确定性的规则基线 provider。Provider 配置 MUST 校验取值。切换 provider MUST NOT 改变决策契约。

#### Scenario: 规则基线可离线运行

- **WHEN** 选择规则基线 provider
- **THEN** 系统 SHALL 无需任何外部 LLM 即可产出决策

#### Scenario: LLM provider 注入调用

- **WHEN** 使用文本 LLM provider 并注入 complete 调用
- **THEN** 系统 SHALL 用其返回构造决策
- **AND** 当返回无法解析为决策时降级为 hold

#### Scenario: 非法配置被拒

- **WHEN** provider 配置取值越界(如 near_pct ≤0 或 leverage <1)
- **THEN** 系统 SHALL 拒绝该配置并报错
