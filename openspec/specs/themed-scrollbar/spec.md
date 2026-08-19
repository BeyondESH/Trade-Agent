# themed-scrollbar Specification

## Purpose
TBD - created by archiving change right-dock-ui-polish. Update Purpose after archive.
## Requirements
### Requirement: 主题化隐式滚动条

系统 SHALL 为所有可滚动区域提供主题化的隐式滚动条：静置时滑块不可见，鼠标悬停于滚动容器或容器正在滚动时滑块渐显。滚动条着色 SHALL 全部引用 `--tv-*` 主题变量（滑块常态取 `--tv-border`、hover 取 `--tv-muted`、轨道透明），MUST NOT 硬编码颜色值，从而 dark/light 双主题自动适配。滚动条 SHALL 同时以 `::-webkit-scrollbar` 伪元素与标准 `scrollbar-width`/`scrollbar-color` 属性双写实现，MUST NOT 引入第三方滚动条库。滚动条轨道宽度 SHALL 恒定（8px），显隐 SHALL 仅通过滑块颜色透明度变化实现，MUST NOT 通过改变滚动条宽度实现，以保证内容区不发生重排抖动。

#### Scenario: 静置时滑块隐藏

- **WHEN** 鼠标不在某个可滚动容器上且该容器未在滚动
- **THEN** 该容器的滚动条滑块 SHALL 不可见，且 SHALL NOT 显示不透明的轨道背景

#### Scenario: hover 渐显

- **WHEN** 鼠标悬停于可滚动容器
- **THEN** 滚动条滑块 SHALL 以过渡动画渐显为主题 token 色；移出后 SHALL 渐隐

#### Scenario: 显隐不引起布局抖动

- **WHEN** 滚动条滑块由隐藏变为显示
- **THEN** 容器内容区宽度 SHALL 保持不变，内容 SHALL NOT 发生横向位移

#### Scenario: 双主题着色

- **WHEN** 在 dark 与 light 主题间切换
- **THEN** 滚动条滑块颜色 SHALL 随主题变量变化，MUST NOT 出现与主题不符的原生系统滚动条配色

#### Scenario: 降低动效偏好

- **WHEN** 系统设置为 `prefers-reduced-motion: reduce`
- **THEN** 滚动条 SHALL 取消渐显过渡动画并直接呈现可见状态

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

