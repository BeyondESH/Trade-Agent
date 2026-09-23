# fix-realtime-subscription-dispatch Specification

## ADDED Requirements

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
