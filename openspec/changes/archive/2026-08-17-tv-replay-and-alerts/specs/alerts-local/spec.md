## MODIFIED Requirements

### Requirement: 警报 CRUD 与持久化

系统 SHALL 提供警报能力：创建警报（品种、条件=高于/低于、阈值、启用开关）、列表展示、删除、启用/停用。数据源 SHALL 默认使用后端 `/alerts`（跨设备持久化），后端不可用时 SHALL 回退到 localStorage；两种数据源结构一致，可无缝切换。

#### Scenario: 创建与持久化

- **WHEN** 创建一条"BTCUSDT 高于 70000"的警报并在另一会话/设备打开
- **THEN** SHALL 通过后端 `/alerts` 看到该警报且状态保持

#### Scenario: 离线回退本地

- **WHEN** 后端 `/alerts` 不可用
- **THEN** 警报读写 SHALL 回退到 localStorage，界面行为不变

#### Scenario: 删除与停用

- **WHEN** 删除或停用某警报
- **THEN** SHALL 从列表移除/标记停用，且后续不参与触发判定

### Requirement: 价格触发

系统 SHALL 基于最新行情轮询判定警报条件，满足条件后 SHALL 标记警报为"已触发"、在列表中高亮，SHALL 弹出应用内 toast 提醒，并在已授权时发送浏览器通知；已触发警报 SHALL 可重置重新启用。

#### Scenario: 触发与重置

- **WHEN** 最新价满足某启用的警报条件
- **THEN** SHALL 标记触发并高亮，弹出应用内 toast；已授权时发浏览器通知

#### Scenario: 重置

- **WHEN** 点击已触发警报的重置
- **THEN** SHALL 恢复为待触发状态并重新参与判定

## ADDED Requirements

### Requirement: 警报图上画线

系统 SHALL 为当前品种的每条启用警报在图表对应价位绘制一条水平警报线；SHALL 可从线上拖动调整阈值（同步更新警报数据）；切换品种时 SHALL 只显示该品种的警报线。

#### Scenario: 画线与显隐

- **WHEN** 当前品种存在启用的警报
- **THEN** 图表 SHALL 在各阈值价位画水平警报线；切到其他品种时 SHALL 隐藏非本品种的线

#### Scenario: 拖动改阈值

- **WHEN** 拖动某条警报线到新价位
- **THEN** 对应警报阈值 SHALL 更新并持久化
