## MODIFIED Requirements

### Requirement: 推送帧携带完整 series 标识
系统 SHALL 使所有 `/ws` 数据帧(`snapshot`/`update`)携带完整 series 标识:`channel`、`category`、`symbol`、`timeframe`、`action`、`data`。前端据此 SHALL 精确路由到订阅者,不依赖缺省值推断。

前端在按 4 元组精确路由之后、投递给订阅者之前，SHALL 再做一次时间单调性校验：若该帧 `last_candle.open_time` 早于本 series 已投递的最新 `open_time`，SHALL 丢弃该帧而不投递。该校验 SHALL 按 series 独立持有状态，切换 symbol/timeframe 后 SHALL 不复用旧 series 的时间水位。

#### Scenario: snapshot 帧带完整标识
- **WHEN** 客户端订阅某 series 的 candle 通道并收到首帧
- **THEN** 帧 SHALL 含 `channel/category/symbol/timeframe` 且 `action:"snapshot"`

#### Scenario: update 帧带完整标识
- **WHEN** 实时 bar 更新触发推送
- **THEN** 帧 SHALL 含 `channel/category/symbol/timeframe` 且 `action:"update"`

#### Scenario: 前端按 4 元组路由
- **WHEN** 前端收到数据帧
- **THEN** 前端 SHALL 用 `category:symbol:timeframe` 匹配订阅者,精确投递,不串流到其他周期

#### Scenario: 路由后拒绝时间回退帧
- **WHEN** 帧的 4 元组匹配到订阅者，但其 `last_candle.open_time` 早于该 series 已投递的最新 `open_time`
- **THEN** 前端 SHALL 丢弃该帧，不调用订阅者回调

#### Scenario: 重连或中继乱序仍受保护
- **WHEN** 连接重连或中继缓冲导致帧到达顺序被重排，出现更旧的 candle 帧
- **THEN** 前端 SHALL 依据单调性校验丢弃该帧，图表数据列 SHALL 保持严格升序

#### Scenario: 切换 series 后重置时间水位
- **WHEN** 订阅从一个 series 切换到另一个 series
- **THEN** 新 series 的时间水位 SHALL 独立起算，不得因旧 series 的 `open_time` 而误丢新 series 的合法帧
