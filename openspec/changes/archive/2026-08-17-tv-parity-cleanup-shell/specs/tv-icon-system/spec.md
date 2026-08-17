## ADDED Requirements

### Requirement: 线性 SVG 图标规格

系统 SHALL 以统一的线性 SVG 图标集（`ui/icons` 模块）呈现所有功能图标：视框 24px（图标按钮 28×28 命中区）、描边 1.2–1.5px、无填充（选中态可换描边色），颜色 SHALL 全部取自主题 token（`currentColor` + 文字色 class），MUST NOT 在组件内硬编码图标色值。

#### Scenario: 双主题下图标着色正确

- **WHEN** 在 dark/light 主题下渲染图标按钮
- **THEN** 图标颜色 SHALL 分别随主题的主/次要文字 token 变化，无硬编码色

### Requirement: 禁用 emoji 与 ASCII 字形图标

系统 SHALL 移除顶栏、右图标条、底部 Tab 中的所有 emoji（如 🔍 👤）与 ASCII 字形（如 ▼ ▃▂ ▦）图标，替换为线性 SVG 图标；新增 UI MUST NOT 引入 emoji/ASCII 字形作为功能图标。

#### Scenario: 界面元素审计

- **WHEN** 审查顶栏、右图标条与底部 Tab 的可点击元素
- **THEN** 每个功能图标 SHALL 为 SVG 组件，不存在 emoji/ASCII 字形图标
