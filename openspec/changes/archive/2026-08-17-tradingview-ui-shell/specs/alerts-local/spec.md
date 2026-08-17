## ADDED Requirements

### Requirement: 警报 CRUD 与持久化

系统 SHALL 提供本地警报能力：创建警报（品种、条件=高于/低于、阈值、启用开关）、列表展示、删除、启用/停用；数据 SHALL 持久化到 localStorage，刷新后保持。

#### Scenario: 创建与持久化

- **WHEN** 创建一条"BTCUSDT 高于 70000"的警报并刷新页面
- **THEN** SHALL 在警报列表看到该警报且状态保持

#### Scenario: 删除与停用

- **WHEN** 删除或停用某警报
- **THEN** SHALL 从列表移除/标记停用，且后续不参与触发判定

### Requirement: 价格触发

系统 SHALL 基于最新行情轮询判定警报条件，满足条件后 SHALL 标记警报为"已触发"、在列表中高亮，并可发送浏览器通知（授权后）；已触发警报 SHALL 可重置重新启用。

#### Scenario: 触发与重置

- **WHEN** 最新价满足某启用的警报条件
- **THEN** SHALL 标记触发并高亮提醒；点击重置后 SHALL 恢复为待触发状态

### Requirement: 后端接口预留

系统 SHALL 在 API 客户端预留 `/alerts` 接口形状（列表/创建/删除），当前实现 SHALL 使用本地存储；后端就绪后 SHALL 可无缝切换数据源。

#### Scenario: 数据源可替换

- **WHEN** 后端 `/alerts` 就绪并启用服务端数据源
- **THEN** 警报读写 SHALL 走服务端接口，前端结构与本地版一致
