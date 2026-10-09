## MODIFIED Requirements

### Requirement: 更新帧内容收敛
系统 SHALL 使 `action:"update"` 的 candle 帧只携带实时所需字段:`last_candle` 与最新价格(`price`),不得包含指标、支撑/阻力等重计算字段;此类增强字段 SHALL 仅在 `snapshot` 帧与低频周期快照(约每 5 秒)中提供。

系统 SHALL 使同一 series 的事件驱动推送与低频周期快照之间保持时间保序：后端 SHALL 按 series 记录已推送的最新 `last_candle.open_time`，低频周期快照在下发前 SHALL 比较该记录，若其 `last_candle.open_time` 早于已推送值，则 SHALL 不下发该更旧的 `last_candle`，以免客户端收到回退帧而破坏时间序列。事件驱动推送 SHALL 作为顺序权威来源。
