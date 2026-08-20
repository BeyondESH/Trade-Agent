## MODIFIED Requirements

### Requirement: 更新帧内容收敛
系统 SHALL 使 `action:"update"` 的 candle 帧只携带实时所需字段:`last_candle` 与最新价格(`price`),不得包含指标、支撑/阻力等重计算字段;此类增强字段 SHALL 仅在 `snapshot` 帧与低频周期快照(约每 5 秒)中提供。

系统 SHALL 使同一 series 的事件驱动推送与低频周期快照之间保持时间保序：后端 SHALL 按 series 记录已推送的最新 `last_candle.open_time`，低频周期快照在下发前 SHALL 比较该记录，若其 `last_candle.open_time` 早于已推送值，则 SHALL 不下发该更旧的 `last_candle`，以免客户端收到回退帧而破坏时间序列。事件驱动推送 SHALL 作为顺序权威来源。

#### Scenario: update 帧不含指标/S-R
- **WHEN** 后端推送 candle `action:"update"` 帧
- **THEN** `data` SHALL 包含 `last_candle` 与 `price`,且不含 `levels`、`macd_hist` 等重计算字段

#### Scenario: 低频周期仍提供指标/S-R
- **WHEN** 订阅期间到达低频周期快照时间(约每 5 秒)
- **THEN** 系统 SHALL 推送含指标与 Top-N S/R 的完整帧,以刷新增强数据

#### Scenario: 实时路径不触发重计算
- **WHEN** 后端处理实时 bar 更新事件
- **THEN** 后端 SHALL 只从实时流 buffer 读取最新 bar,不读取 parquet、不计算指标/S/R,避免阻塞事件循环

#### Scenario: 周期快照不下发更旧的 bar
- **WHEN** 低频周期快照取到的 `last_candle.open_time` 早于该 series 已通过事件推送下发的最新 `open_time`
- **THEN** 系统 SHALL 不下发该更旧的 `last_candle`，客户端 SHALL 不收到时间回退的 candle bar

#### Scenario: 周期快照的增强字段仍保留
- **WHEN** 因保序而跳过周期快照中更旧的 `last_candle`
- **THEN** 该周期快照的指标与 Top-N S/R 等增强字段 SHALL 仍按既有规格提供，低频刷新周期 SHALL 不变

#### Scenario: 事件推送更新已发送水位
- **WHEN** 事件驱动推送成功下发某 series 的 `last_candle`
- **THEN** 系统 SHALL 将该 series 已推送的最新 `open_time` 更新为该帧的 `open_time`
