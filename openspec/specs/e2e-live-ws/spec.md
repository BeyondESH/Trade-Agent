# e2e-live-ws Specification

## Purpose
Real WebSocket protocol tests (L2): a spawned uvicorn `/ws` endpoint is
exercised over a real socket for connection, ping/pong, subscription channels,
dynamic subscribe/unsubscribe and malformed-frame resilience.

## Requirements

### Requirement: 真实 WS 连接与协议验证
测试 SHALL 通过真实 WebSocket 连接（`ws://127.0.0.1:{port}/ws`）验证连接建立、握手与 ping/pong 语义，而非仅依赖 TestClient。
#### Scenario: 连接建立
- **WHEN** 客户端连接 `/ws`
- **THEN** 连接 SHALL 成功建立，且服务端行为符合既有握手协议（greeting/ack 语义按 webapi 实现）

### Requirement: candle 通道订阅
测试 SHALL 订阅 `channel:"candle"`（指定 symbol/timeframe/category）并验证快照帧与事件帧结构。
#### Scenario: 快照帧
- **WHEN** 订阅 candle 通道
- **THEN** 首帧 SHALL 为快照，含 `last_candle`（或按既有协议字段），且 `last_candle.open_time` 存在

#### Scenario: 事件帧单调
- **WHEN** 收到后续 event 帧
- **THEN** 各帧 `last_candle.open_time` SHALL 单调不倒退（协议层校验；无真实推送时该用例跳过实时性断言）

### Requirement: 全通道订阅矩阵
测试 SHALL 覆盖 `/ws` 全部业务通道：ticker、books、trade、mark-price、funding-rate，验证各通道订阅后收到对应类型的帧（快照或镜像）。
#### Scenario: 各通道收到帧
- **WHEN** 分别订阅 ticker/books/trade/mark-price/funding-rate
- **THEN** 各通道 SHALL 收到与既有 `streamhub` / `realtime` 协议一致的帧结构

### Requirement: 动态订阅与退订
测试 SHALL 验证运行期订阅新 symbol 会开始收到其帧，退订后不再收到该 symbol 帧。
#### Scenario: 动态订阅生效
- **WHEN** 运行期追加订阅某 symbol
- **THEN** 后续 SHALL 收到该 symbol 的帧

#### Scenario: 退订生效
- **WHEN** 退订某 symbol
- **THEN** 之后 SHALL 不再收到该 symbol 的业务帧

### Requirement: 非法订阅错误语义
测试 SHALL 验证非法 channel / timeframe / symbol 订阅得到明确的错误响应或连接级错误，而非静默接受。
#### Scenario: 非法参数拒绝
- **WHEN** 发送非法 channel 或不支持的 timeframe 订阅
- **THEN** 服务端 SHALL 返回可识别的错误帧（或拒绝订阅），并说明原因

### Requirement: 在线实时冒烟（可选）
标记为 `--live` 的用例 SHALL 在真实行情可达时验证真实推送存在（candle/ticker 帧数 > 0）；网络不可达时 SHALL skip 而非失败。
#### Scenario: 真实推送存在
- **WHEN** `--live` 模式且 Bitget WS 可达
- **THEN** 观测窗口内 SHALL 收到至少一条 candle 或 ticker 帧
