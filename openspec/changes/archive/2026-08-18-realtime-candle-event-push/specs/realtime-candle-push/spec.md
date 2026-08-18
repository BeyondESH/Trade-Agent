## ADDED Requirements

### Requirement: 实时 bar 事件驱动推送
系统 SHALL 在 Bitget candle 实时流(buffer)收到更新、某 series 最新 bar 变化时,立即通知该 series 的已订阅连接,替代按固定间隔轮询 buffer 的转发方式。每个 series 的推送 SHALL 按 ~1 秒节流,避免同一 bar 高频重复帧。

#### Scenario: bar 更新即推送
- **WHEN** Bitget WS 收到某 series 的 candle update 且最新 bar 的 OHLCV 发生变化
- **THEN** 系统 SHALL 向订阅该 series 的 `/ws` 连接推送 `action:"update"` 帧且 `data.last_candle` 为该最新 bar
- **AND** 两次推送间隔 SHALL 不低于 ~1 秒(节流)

#### Scenario: 订阅时先快照
- **WHEN** 客户端订阅某 series 的 candle 通道
- **THEN** 系统 SHALL 先推送 `action:"snapshot"` 完整帧(含指标与 Top-N S/R),随后才按事件推送 `action:"update"` 帧

#### Scenario: 退订即停止推送
- **WHEN** 客户端退订某 series 或连接断开
- **THEN** 系统 SHALL 注销该 series 的监听器,不再向该连接推送更新

#### Scenario: 同一 bar 内容未变不重复推送
- **WHEN** 节流窗口内同一 series 的 bar 多次更新但最终 OHLCV 未变
- **THEN** 系统 SHALL 不重复推送内容相同的更新帧

### Requirement: 更新帧内容收敛
系统 SHALL 使 `action:"update"` 的 candle 帧只携带实时所需字段:`last_candle` 与最新价格(`price`),不得包含指标、支撑/阻力等重计算字段;此类增强字段 SHALL 仅在 `snapshot` 帧与低频周期快照(约每 5 秒)中提供。

#### Scenario: update 帧不含指标/S-R
- **WHEN** 后端推送 candle `action:"update"` 帧
- **THEN** `data` SHALL 包含 `last_candle` 与 `price`,且不含 `levels`、`macd_hist` 等重计算字段

#### Scenario: 低频周期仍提供指标/S-R
- **WHEN** 订阅期间到达低频周期快照时间(约每 5 秒)
- **THEN** 系统 SHALL 推送含指标与 Top-N S/R 的完整帧,以刷新增强数据

#### Scenario: 实时路径不触发重计算
- **WHEN** 后端处理实时 bar 更新事件
- **THEN** 后端 SHALL 只从实时流 buffer 读取最新 bar,不读取 parquet、不计算指标/S/R,避免阻塞事件循环
