# design-system Specification

## Purpose
shadcn/ui 组件库接入后,新组件 SHALL 使用 `--tv-*` 设计 token、支持双主题,并保持高密度与无卡片阴影约束。

## ADDED Requirements

### Requirement: shadcn/ui 组件 token 接入

引入 shadcn/ui(及 Radix 原语)构建的组件 SHALL 以 CSS 变量继承现有 `--tv-*` 色表,支持 dark/light 双主题一键切换,布局尺寸与涨跌色不变。组件实现 SHALL 在 `components.json` 中声明 token 映射(primary=--tv-accent、up/down=涨跌色、panel/background=面板/背景),新增组件 MUST NOT 硬编码颜色值。

#### Scenario: shadcn 组件双主题

- **WHEN** 切换 dark/light 主题
- **THEN** 所有 shadcn 组件(Tabs/Table/Tooltip/Slider/Popover/Button/Card)SHALL 随 `--tv-*` token 同步变色,尺寸不变

#### Scenario: 无硬编码色

- **WHEN** 渲染任一 shadcn 新增组件
- **THEN** 其颜色 SHALL 引用 token 类,CSS 中 MUST NOT 出现独立硬编码色值

#### Scenario: 组件原语兼容

- **WHEN** 未迁移至 shadcn 的既有组件调用 `ui.tsx` 原语
- **THEN** 原语 SHALL 继续可用(迁移或兼容层),行为与视觉不变

### Requirement: 高密度与浮层约束延续

shadcn 组件 SHALL 遵循高密度 UI 与渐进式披露约束:icon-only 按钮为主、行操作 hover 渐显、仅浮层(Tooltip/Popover/Dialog)允许唯一阴影 `0 2px 8px rgba(0,0,0,.4)`;新增组件 SHALL 不使用 emoji 或 ASCII 字形作为图标(使用 lucide 线性 SVG)。

#### Scenario: 浮层阴影唯一

- **WHEN** 渲染 shadcn Tooltip/Popover/Dialog
- **THEN** 仅这些浮层 SHALL 带 `0 2px 8px rgba(0,0,0,.4)` 阴影,其余组件无阴影

#### Scenario: 图标约束

- **WHEN** 渲染 QUANT LAB 中的功能图标
- **THEN** 每个图标 SHALL 为 lucide 线性 SVG 且着色取自 token,SHALL NOT 为 emoji/ASCII 字形
