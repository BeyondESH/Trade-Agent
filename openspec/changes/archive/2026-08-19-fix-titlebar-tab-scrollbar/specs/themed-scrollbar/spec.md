## MODIFIED Requirements

### Requirement: 完全隐藏滚动条工具类

系统 SHALL 提供 `no-scrollbar` 工具类用于完全隐藏滚动条（滑块与轨道均不可见，且不占用布局空间），该类 SHALL 在样式入口以 Tailwind v4 `@utility` 机制定义，使项目中所有既有引用生效。该类 SHALL 用于滚动条无信息价值的横向控件条（如分类 chip 条、Tab 条），纵向长列表 SHALL 使用隐式滚动条而非该类。当内容溢出时，该类 SHALL 允许横向滚动，但滚动条槽位 MUST NOT 占用或压缩容器布局空间（含可用高度），MUST NOT 因此触发垂直滚动条或挤压内容。

#### Scenario: 工具类生效

- **WHEN** 某元素同时具有 `overflow-x-auto` 与 `no-scrollbar`
- **THEN** 该元素 SHALL 可横向滚动且 SHALL NOT 显示任何滚动条，包含 hover 状态下亦不显示

#### Scenario: 横向控件条无滚动条

- **WHEN** 渲染底部 Tab 栏、顶部标签栏或新闻分类 chip 条，且其内容横向溢出
- **THEN** 这些窄条 SHALL 可横向滚动且 SHALL NOT 显示任何滚动条（含 hover）
- **AND** 滚动条槽位 SHALL NOT 压缩容器可用高度
- **AND** 容器 SHALL NOT 因此出现垂直滚动条，内容高度 SHALL 保持不变

#### Scenario: 纵向长列表使用隐式滚动条

- **WHEN** 渲染新闻列表、自选列表、持仓表等纵向长列表
- **THEN** 这些区域 SHALL 使用隐式滚动条以保留滚动位置感知，SHALL NOT 使用完全隐藏
