# price-lines Specification

## Purpose
TBD - created by archiving change chart-context-menu-price-lines. Update Purpose after archive.
## Requirements
### Requirement: 统一价格线实体

系统 SHALL 使用统一的 Alert 实体表示价格线：`enabled:false` 的实体为纯参考线（只绘制不参与触发判定），`enabled:true` 的实体为警报线（绘制并参与触发判定）；两者的阈值 `threshold` 均为线的价格位置。实体按品种存储，`symbol` 字段标记归属品种。

#### Scenario: 添加参考线

- **WHEN** 通过右键菜单添加价格线
- **THEN** SHALL 创建一条 `enabled:false` 的参考线实体，只绘制不触发

#### Scenario: 添加警报线

- **WHEN** 通过创建警报弹窗提交警报
- **THEN** SHALL 创建一条 `enabled:true` 的警报线实体并参与触发判定

### Requirement: 价格线颜色

系统 SHALL 按实体语义派生线颜色：警报线统一使用黄色 `#ff9800`（不区分高于/低于条件）；参考线使用主题灰（dark 主题 `#787b86`，light 主题 `#5d606b`）；若实体持久化了自定义颜色，SHALL 优先使用自定义颜色。

#### Scenario: 默认颜色

- **WHEN** 绘制一条未自定义颜色的警报线
- **THEN** SHALL 以黄色 `#ff9800` 绘制

#### Scenario: 参考线颜色随主题

- **WHEN** 绘制一条未自定义颜色的参考线
- **THEN** SHALL 以当前主题对应灰色绘制（dark `#787b86`，light `#5d606b`）

#### Scenario: 自定义颜色优先

- **WHEN** 实体已持久化自定义颜色
- **THEN** SHALL 以自定义颜色绘制，忽略默认颜色

### Requirement: 价格线绘制与重绘

系统 SHALL 以 klinecharts `priceLine` overlay 绘制当前品种的所有价格线（含参考线与警报线）；在图表就绪、品种切换、alerts 数据变化时 SHALL 统一重绘；切换品种时 SHALL 只绘制当前品种的线。

#### Scenario: 初始绘制

- **WHEN** 图表就绪且当前品种存在价格线实体
- **THEN** SHALL 在对应阈值价位绘制全部价格线

#### Scenario: 品种切换重绘

- **WHEN** 用户切换到其他品种
- **THEN** SHALL 移除上一品种的线并只绘制新品种的线

#### Scenario: 数据变化重绘

- **WHEN** alerts 数据发生增删改（含参考线）
- **THEN** SHALL 同步重绘受影响的价格线

### Requirement: 价格线设置弹窗

系统 SHALL 在左键点击任一条价格线时打开设置弹窗；弹窗 SHALL 支持编辑价格、选择颜色（预设色板含默认黄/灰与自定义色）、切换类型（参考线/警报线）、切换条件（高于/低于，仅警报线显示）以及删除该线。

#### Scenario: 左键点线打开设置

- **WHEN** 用户左键点击某条价格线
- **THEN** SHALL 打开该线的设置弹窗，并回显当前价格/颜色/类型/条件

#### Scenario: 修改价格与颜色

- **WHEN** 用户在设置弹窗中修改价格或颜色并保存
- **THEN** SHALL 更新实体数据并持久化，图上该线随之更新

#### Scenario: 切换类型

- **WHEN** 用户在设置弹窗中将参考线切换为警报线（或反向）
- **THEN** SHALL 更新实体 `enabled` 并持久化，颜色按新语义刷新

#### Scenario: 删除价格线

- **WHEN** 用户在设置弹窗中点击删除
- **THEN** SHALL 删除该实体并持久化，图上该线移除，弹窗关闭

### Requirement: 拖动调整阈值

系统 SHALL 支持拖动价格线以调整阈值：拖动结束 SHALL 以新价位更新实体 `threshold` 并持久化。

#### Scenario: 拖动改阈值

- **WHEN** 用户将某条价格线拖到新价位
- **THEN** SHALL 更新对应实体阈值并持久化，线上标签同步新价格

### Requirement: 价格线持久化

系统 SHALL 通过 `alertsStore` 持久化价格线实体（含参考线），与既有警报共用同一存储与后端镜像通道；后端不可用时 SHALL 回退到 localStorage。

#### Scenario: 刷新后保留

- **WHEN** 用户添加价格线后刷新页面
- **THEN** SHALL 价格线仍存在并按品种恢复绘制

#### Scenario: 参考线同步后端

- **WHEN** 创建或修改参考线且后端可用
- **THEN** SHALL 通过既有警报镜像通道同步到后端

