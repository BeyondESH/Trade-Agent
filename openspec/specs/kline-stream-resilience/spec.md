# kline-stream-resilience Specification

## Purpose
TBD - created by archiving change bitget-connectivity. Update Purpose after archive.
## Requirements
### Requirement: K 线快照流断线自动重连

系统 SHALL 使 K 线实时快照流（`connectSnapshot` / `/ws` snapshot）在网络断开或服务端关闭连接后自动检测并重连，重连成功后 MUST 自动恢复原 symbol/timeframe/category/interval 的订阅，且不得丢失后续增量而使图表永久停更。

#### Scenario: 断线后自动重连

- **WHEN** K 线快照流的 WebSocket 因网络抖动或服务端关闭而断开
- **THEN** 系统 SHALL 检测到断开并按退避策略发起重连
- **AND** 重连成功后 SHALL 用原订阅参数重新订阅，图表恢复接收最新 K 线

#### Scenario: 指数退避重连

- **WHEN** 连续重连失败
- **THEN** 系统 SHALL 采用递增退避间隔（有上限）重试，避免高频重连风暴

#### Scenario: 主动关闭不触发重连

- **WHEN** 前端因切换 symbol/timeframe 或组件卸载而主动关闭连接
- **THEN** 系统 SHALL NOT 再发起重连

### Requirement: 连接状态上报

系统 SHALL 对外暴露 K 线快照流的连接状态（实时 / 重连中 / 断开），供状态栏等 UI 呈现连通性提示。

#### Scenario: 状态可被 UI 消费

- **WHEN** 连接状态在 实时 / 重连中 / 断开 之间变化
- **THEN** 系统 SHALL 将最新状态暴露给订阅方
- **AND** 状态栏 SHALL 据此显示对应的连通性标识

#### Scenario: 恢复实时后清除告警态

- **WHEN** 重连成功并重新收到快照/增量
- **THEN** 状态 SHALL 回到"实时"，UI 告警标识 SHALL 被清除

### Requirement: 订阅操作可靠投递

系统 SHALL 保证 `BitgetWsStream` 的订阅/退订操作在任意调用线程（含无事件循环的 FastAPI 同步端点工作线程）中都被可靠投递到其所属事件循环；同步端点触发的订阅 MUST NOT 被静默丢弃。发送失败或超时 MUST 记录告警并触发上游连接重连重订，`/ws` 处理器对同一连接的重复订阅 MUST 幂等（不重复增加上游引用计数）。

#### Scenario: 同步端点线程发起订阅

- **WHEN** 同步端点（如 `/candles/recent` 缓存未命中预热）在工作线程中调用 `stream.subscribe()`
- **THEN** 订阅操作 SHALL 被投递到流所属事件循环并发送到上游 feed
- **AND** 上游随后推送的该 series 事件帧 SHALL 触发已注册监听器

#### Scenario: 发送失败触发重连重订

- **WHEN** 订阅操作发送失败或超时
- **THEN** 系统 SHALL 记录告警并关闭上游连接
- **AND** 重连成功后 SHALL 通过 `_channels()` 自动重发包含运行时订阅的全部频道

#### Scenario: 重复订阅幂等

- **WHEN** 同一 `/ws` 连接对同一 series 重复发送 subscribe
- **THEN** 上游引用计数 SHALL 只增加一次
- **AND** 连接仍 SHALL 收到快照与 subscribed 确认帧

#### Scenario: start 之前的调用不丢失

- **WHEN** `start()` 之前（无事件循环）调用 `subscribe()`
- **THEN** 操作 SHALL 保留在待订阅集合中并在首次连接时随 `_channels()` 生效
- **AND** 系统 SHALL NOT 抛出异常

