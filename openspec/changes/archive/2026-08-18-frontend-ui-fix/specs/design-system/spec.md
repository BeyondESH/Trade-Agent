## ADDED Requirements

### Requirement: Tailwind 扫描覆盖 Vue SFC

系统 SHALL 使 Tailwind content 扫描覆盖 Vue SFC 组件（`.vue` 文件），确保组件内使用的工具类进入构建产物 CSS。

#### Scenario: 产物包含工具类

- **WHEN** 执行生产构建
- **THEN** 产物 CSS SHALL 包含组件使用的关键工具类（如 `.bg-panel`、`.flex`、`.h-screen`）

#### Scenario: Vue SFC 样式生效

- **WHEN** 在浏览器中打开应用
- **THEN** 组件 SHALL 呈现预期的布局、高度与配色（非无样式裸布局）
