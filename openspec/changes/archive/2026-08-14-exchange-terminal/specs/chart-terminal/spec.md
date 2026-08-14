## MODIFIED Requirements

### Requirement: AI 决策联动

系统 SHALL 在终端底部区域提供 AI 分析模块占位，展示 Agent 决策（action/side/confidence/reason）、指标摘要与 S/R 候选的能力由后续 change 实现；本期仅保留占位容器，切币种/周期时保持联动数据链路预留。

#### Scenario: 底部占位渲染

- **WHEN** 终端加载
- **THEN** 底部 SHALL 渲染 AI 分析模块占位区域而不报错

#### Scenario: 联动链路预留

- **WHEN** 切换标的或周期
- **THEN** SHALL 维持 series 上下文以支持后续 AI 面板按新 series 刷新
