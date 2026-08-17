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

