# terminal-interactions Specification

## Purpose
TBD - created by archiving change tradingview-ui-shell. Update Purpose after archive.
## Requirements
### Requirement: 右键上下文菜单

系统 SHALL 在图表任意位置右键弹出上下文菜单（在此价格创建警报 / 添加指标 / 复制价格 / 设置 / 重置视图），菜单位置跟随光标，左侧保留 icon 槽、右侧显示快捷键；点击外部 SHALL 关闭。五项均 SHALL 绑定真实行为：创建警报 SHALL 以光标价格预填并打开创建警报弹窗；添加指标 SHALL 打开 klinecharts-pro 原生指标选择弹窗；复制价格 SHALL 将光标价格写入剪贴板并给出反馈；设置 SHALL 打开图表/应用设置入口；重置视图 SHALL 将图表视图复位到最新行情/默认缩放。

#### Scenario: 菜单弹出与动作

- **WHEN** 右键点击图表某价格位置并选择"在此价格创建警报"
- **THEN** SHALL 弹出菜单，并基于该价格预填创建警报；选择其余项 SHALL 执行对应动作

#### Scenario: 添加指标

- **WHEN** 在右键菜单点击"添加指标"
- **THEN** SHALL 打开指标选择弹窗，选择后 SHALL 在图表上即时生效

#### Scenario: 复制价格

- **WHEN** 在右键菜单点击"复制价格"
- **THEN** 光标处价格 SHALL 被写入剪贴板，且 SHALL 关闭菜单

#### Scenario: 设置与重置视图

- **WHEN** 在右键菜单点击"设置"或"重置视图"
- **THEN** "设置" SHALL 打开设置入口；"重置视图" SHALL 将图表视图复位（回到最新 K 线/默认缩放），二者均 SHALL 关闭菜单

#### Scenario: 五项完整

- **WHEN** 打开右键菜单
- **THEN** 菜单 SHALL 呈现创建警报 / 添加指标 / 复制价格 / 设置 / 重置视图五项，MUST NOT 仅呈现其中部分

### Requirement: 键盘快捷键

系统 SHALL 支持快捷键：`,` 打开搜索、`Alt+T` 激活趋势线绘图、`1/5/15` 切换周期、`Ctrl+Z` 撤销绘图操作；菜单项 SHALL 标注对应快捷键。

#### Scenario: 快捷键生效

- **WHEN** 在图表聚焦状态下按下各快捷键
- **THEN** SHALL 触发对应动作（搜索/趋势线/周期/撤销）

#### Scenario: 绘图撤销

- **WHEN** 创建多个绘图后按 `Ctrl+Z`
- **THEN** SHALL 按创建倒序撤销绘图，直至空栈

### Requirement: 回到最新箭头

系统 SHALL 在图表偏离最新行情时淡入右下角"回到最新"箭头，点击 SHALL 平滑滚动回最新 K 线；回到最新后 SHALL 隐藏。

#### Scenario: 偏离与返回

- **WHEN** 向左平移/缩放导致视图偏离最新 K 线
- **THEN** SHALL 淡入"回到最新"箭头；点击后 SHALL 回到最新并隐藏

### Requirement: 缩放与平移

系统 SHALL 支持滚轮缩放（锚定光标位置）、拖拽平移、`Alt+滚轮` 快速缩放、双击价格轴复位视图；指标副图分隔线 SHALL 可拖拽调整高度。

#### Scenario: 快速缩放与复位

- **WHEN** `Alt+滚轮` 或双击价格轴
- **THEN** SHALL 以更高倍率缩放或复位价格范围

### Requirement: 选中绘图浮动工具条

系统 SHALL 在选中绘图元素时于其附近弹出横向浮动工具条（颜色/线宽/线型/删除/设置），圆角 6px 带阴影，跟随图形位置；操作 SHALL 实时作用于该绘图。

#### Scenario: 选中弹出与操作

- **WHEN** 选中某绘图元素
- **THEN** SHALL 在元素附近弹出工具条；调整颜色/线宽或删除 SHALL 即时生效

