# bitget-realtime-stream Specification

## Purpose
TBD - created by archiving change fix-symbol-switching. Update Purpose after archive.
## Requirements
### Requirement: 最新与最近批次 bar 读取

系统 SHALL 为每个 series 缓存最近 N 根 bar（订阅快照批次逐行 upsert、实时更新同 open_time 覆盖，超出容量裁剪），并提供同步读取接口返回最新单根或最近批次。

#### Scenario: 读取最新 bar

- **WHEN** 查询某 series 的最新 bar
- **THEN** SHALL 返回该 series 内存中的最新 OHLCV（无数据返回 None）

#### Scenario: 读取最近批次

- **WHEN** 查询某 series 的最近 N 根 bar
- **THEN** SHALL 返回按时间升序的最近批次 OHLCV（无数据返回空列表）

### Requirement: Bitget 公共 WS K 线订阅

系统 SHALL 通过 Bitget 公共 WebSocket（`wss://ws.bitget.com/v2/ws/public`，免认证）订阅 K 线频道，频道名为 `candle{interval}`（如 candle5m、candle1d），并解析 candle 帧存入内存 buffer。

#### Scenario: 订阅多频道

- **WHEN** 流启动
- **THEN** SHALL 对配置的 symbols × timeframes 全部订阅并建立 series 映射

#### Scenario: 解析 candle 帧

- **WHEN** 收到 `candle{interval}` 数据帧
- **THEN** SHALL 解析为规范 OHLCV（open_time 毫秒 + OHLC + volume）并更新对应 series 的最新 bar

#### Scenario: 同周期 bar 覆盖

- **WHEN** 收到与已有 bar 相同 open_time 的帧
- **THEN** SHALL 覆盖该 bar 而不产生重复条目

### Requirement: 心跳保活与断线重连

系统 SHALL 维持连接存活：响应服务端 ping/pong，超时无活动主动探测，断线后按退避间隔自动重连并重订阅。

#### Scenario: 心跳维持

- **WHEN** 收到服务端 ping 或超过心跳间隔无消息
- **THEN** SHALL 回应 pong / 主动发送 ping 保持连接

#### Scenario: 断线自动重连

- **WHEN** 连接断开或长时间无响应
- **THEN** SHALL 按重连间隔重连并重新订阅全部频道

### Requirement: 最新 bar 读取

系统 SHALL 提供同步读取接口返回指定 series 的最新 bar，无数据时返回空。

#### Scenario: 读取最新 bar

- **WHEN** 查询某 series 的最新 bar
- **THEN** SHALL 返回该 series 内存中的最新 OHLCV（无数据返回 None）

