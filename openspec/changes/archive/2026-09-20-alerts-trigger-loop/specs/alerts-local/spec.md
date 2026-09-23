## MODIFIED Requirements

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

## ADDED Requirements

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
