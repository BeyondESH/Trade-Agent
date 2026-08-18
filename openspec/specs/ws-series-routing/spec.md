# ws-series-routing Specification

## Purpose
TBD - created by archiving change rewrite-ws-subscription-routing. Update Purpose after archive.
## Requirements
### Requirement: 完整 series 订阅路由
系统 SHALL 按完整 4 元组 `(channel, category, symbol, timeframe)` 维护 `/ws` 订阅:`subscribe` 帧中的 `category` 与 `timeframe` SHALL 参与订阅键,同 symbol 不同 category/timeframe 的订阅 SHALL 独立共存互不覆盖。`unsubscribe` 与断连清理 SHALL 按相同 4 元组注销。

#### Scenario: 同 symbol 多周期并存
- **WHEN** 同一连接先后订阅 `BTCUSDT` 的 `5m` 与 `1h` candle 通道
- **THEN** 两个订阅 SHALL 并存,各自收到对应周期的推送,互不覆盖

#### Scenario: 退订按完整键
- **WHEN** 客户端退订 `BTCUSDT/1h` 的 candle 通道
- **THEN** 系统 SHALL 仅注销该 4 元组订阅,`BTCUSDT/5m` 的订阅保持生效

#### Scenario: 断连清理完整注销
- **WHEN** 连接断开且该连接持有多 series 订阅
- **THEN** 系统 SHALL 按各自 4 元组逐一注销监听器与订阅,不遗留

### Requirement: 推送帧携带完整 series 标识
系统 SHALL 使所有 `/ws` 数据帧(`snapshot`/`update`)携带完整 series 标识:`channel`、`category`、`symbol`、`timeframe`、`action`、`data`。前端据此 SHALL 精确路由到订阅者,不依赖缺省值推断。

#### Scenario: snapshot 帧带完整标识
- **WHEN** 客户端订阅某 series 的 candle 通道并收到首帧
- **THEN** 帧 SHALL 含 `channel/category/symbol/timeframe` 且 `action:"snapshot"`

#### Scenario: update 帧带完整标识
- **WHEN** 实时 bar 更新触发推送
- **THEN** 帧 SHALL 含 `channel/category/symbol/timeframe` 且 `action:"update"`

#### Scenario: 前端按 4 元组路由
- **WHEN** 前端收到数据帧
- **THEN** 前端 SHALL 用 `category:symbol:timeframe` 匹配订阅者,精确投递,不串流到其他周期

### Requirement: 心跳采用 Bitget 官方格式
系统 SHALL 使用 Bitget 官方心跳格式维持连接:客户端发送纯字符串 `ping`,服务端回复纯字符串 `pong`。不得发送 `{"event":"ping"}` 等非官方格式帧。

#### Scenario: 发送官方 ping
- **WHEN** 连接空闲超过心跳间隔
- **THEN** 客户端 SHALL 发送字符串 `ping` 而非 JSON 帧

#### Scenario: 响应官方 pong
- **WHEN** 收到服务端 `pong`
- **THEN** 客户端 SHALL 重置静默计数,连接保持

