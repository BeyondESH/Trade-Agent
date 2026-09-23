# alerts-local Specification

## Purpose
TBD - created by archiving change tradingview-ui-shell. Update Purpose after archive.
## Requirements
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

系统 SHALL 基于最新行情判定警报条件：优先复用应用已有的实时行情推送（`useRealSymbols` 的 `priceMap` / 共享 WS `ticker` 通道），并 SHALL 对未被实时行情覆盖的品种以低频轮询（`GET /tickers`）兜底。判定 SHALL 仅作用于 `enabled` 且未触发（`triggered=false`）的警报。满足条件后系统 SHALL 标记警报为"已触发"并记录触发时间、在列表中高亮，SHALL 把触发态同时持久化到本地存储并经 `PUT /alerts/{id}` 镜像到后端，SHALL 弹出应用内 toast 提醒，并仅当用户已显式授权时发送浏览器通知。浏览器通知授权 SHALL 仅在用户显式操作（应用内授权开关/按钮）时申请，MUST NOT 在应用加载时自动申请。已触发警报 SHALL 可重置重新启用。

#### Scenario: 触发与重置

- **WHEN** 最新价满足某启用且未触发的警报条件
- **THEN** SHALL 标记触发并高亮、记录触发时间、本地持久化并镜像到后端 `PUT /alerts/{id}`，弹出应用内 toast；已授权时发浏览器通知

#### Scenario: 重置

- **WHEN** 点击已触发警报的重置
- **THEN** SHALL 恢复为待触发状态并重新参与判定，且触发态变更 SHALL 镜像到后端

#### Scenario: 停用不参与判定

- **WHEN** 某警报 `enabled=false`
- **THEN** SHALL NOT 参与触发判定，且图表价格线 SHALL 以参考线语义绘制

#### Scenario: 未授权时降级

- **WHEN** 用户未授权浏览器通知，或浏览器不支持 `Notification`
- **THEN** 触发时 SHALL 仍弹出应用内 toast，且 MUST NOT 自动申请权限或抛出未捕获异常

### Requirement: 后端接口预留

系统 SHALL 在 API 客户端预留 `/alerts` 接口形状（列表/创建/删除），当前实现 SHALL 使用本地存储；后端就绪后 SHALL 可无缝切换数据源。

#### Scenario: 数据源可替换

- **WHEN** 后端 `/alerts` 就绪并启用服务端数据源
- **THEN** 警报读写 SHALL 走服务端接口，前端结构与本地版一致

### Requirement: 警报图上画线

系统 SHALL 为当前品种的每条价格线（含启用的警报线与参考线）在图表对应价位绘制一条水平线；警报线统一使用黄色，参考线按主题使用灰色；SHALL 可从线上拖动调整阈值（同步更新实体数据并持久化）；切换品种时 SHALL 只显示该品种的价格线。

#### Scenario: 画线与显隐

- **WHEN** 当前品种存在价格线实体（含参考线与启用警报）
- **THEN** 图表 SHALL 在各阈值价位画水平线；切到其他品种时 SHALL 隐藏非本品种的线

#### Scenario: 拖动改阈值

- **WHEN** 拖动某条价格线（参考线或警报线）到新价位
- **THEN** 对应实体阈值 SHALL 更新并持久化

#### Scenario: 参考线不触发

- **WHEN** 最新价越过某条参考线（`enabled:false`）
- **THEN** SHALL 不标记触发、不参与触发判定，仅作视觉参考

### Requirement: 警报启停与重置操作

系统 SHALL 在提醒面板（`AlertsPanel`）为每条警报提供启用/停用切换与"重置"操作。切换 SHALL 立即更新该警报的 `enabled` 并本地持久化、镜像到后端；停用后的警报 SHALL NOT 参与触发判定。重置 SHALL 将 `triggered` 置回 `false` 并清除触发时间，使警报重新参与判定。已触发警报 SHALL 在列表中以可区分样式高亮并展示触发时间。

#### Scenario: 启停切换

- **WHEN** 用户切换某警报的启用/停用开关
- **THEN** SHALL 更新该警报 `enabled` 并本地持久化、镜像到后端；停用后 SHALL NOT 参与触发判定

#### Scenario: 触发态高亮与时间

- **WHEN** 某警报 `triggered=true` 且已记录触发时间
- **THEN** 列表项 SHALL 以高亮样式展示触发状态，并展示其触发时间

### Requirement: 触发通知的显式授权与降级

系统 SHALL 在警报触发时始终显示应用内 toast；仅当用户通过显式操作开启浏览器通知且权限为 `granted` 时，才 SHALL 额外发送浏览器通知。系统 MUST NOT 在应用挂载/加载时自动请求通知权限，且 MUST 在浏览器不支持 `Notification` 时安全降级为仅 toast。

#### Scenario: 显式授权后发送通知

- **WHEN** 用户通过显式操作开启通知开关并授予权限，随后某警报触发
- **THEN** SHALL 显示应用内 toast，并额外发送浏览器通知

#### Scenario: 未授权/不支持时降级

- **WHEN** 通知权限为 `denied`、`default`，或浏览器不支持 `Notification`
- **THEN** 触发时 SHALL 仅显示应用内 toast，且 SHALL NOT 自动弹出权限申请

#### Scenario: 加载时不请求权限

- **WHEN** 应用加载并渲染提醒面板，用户未进行任何显式授权操作
- **THEN** MUST NOT 调用 `Notification.requestPermission()`

