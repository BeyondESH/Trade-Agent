## Why

K 线图的现价不实时跳动:Bitget 源本身每秒推送 candle 更新,但后端 `/ws` 的 `candle_loop` 每 5 秒轮询一次快照,且每次 `_snapshot()` 同步执行 parquet 读取、指标与支撑/阻力重计算,阻塞 asyncio 事件循环,导致现价几乎只在时间边界随新 bar 出现才变化。用户期望蜡烛内的最新价随时间实时刷新。

## What Changes

- `BitgetWsStream` 增加监听器机制:每收到 Bitget candle update 帧、buffer 中某 series 的最新 bar 变化时,同步通知该 series 的订阅者。
- `/ws` candle 订阅改为**事件驱动推送**:订阅时先推一次完整快照(snapshot),随后每收到 stream 的 bar 更新事件立即推送 `last_candle`(按 series 节流到 ~1s),替代原 `candle_loop` 的 5 秒轮询。
- **解耦重计算**:实时 `update` 帧只携带 `last_candle` 与最新价格,不再包含指标/支撑阻力;完整指标与 S/R 计算保留在订阅时的 snapshot 帧及独立低频(如每 5s)周期中。
- `_snapshot()` 瘦身:实时路径只读 `stream.latest()`,不再每次触发 parquet 读取与指标/S/R 计算。
- 前端无需改动:`BitgetDatafeed.subscribe` → pro `updateData` 链路已按时间戳覆盖最后一根蜡烛,事件驱动后每 ~1s 收到更新即可实时刷新。

## Capabilities

### New Capabilities
- `realtime-candle-push`: Bitget candle 实时 bar 事件驱动推送能力——stream 监听器、按 series 节流、`last_candle` 更新帧。

### Modified Capabilities
- `realtime-ws`: 快照 WebSocket 的 candle 更新从定时轮询改为事件驱动;`update` 帧内容收敛为 `last_candle` + 价格;指标/S/R 仅由 snapshot 与低频周期提供。

## Impact

- `backend/src/market_data/realtime.py`:`BitgetWsStream` 增加 `add_listener` / `remove_listener` / 通知逻辑(线程安全,复用现有锁)。
- `backend/src/market_data/webapi.py`:`ws()` 处理函数移除 `candle_loop` 轮询,改为注册/注销 stream 监听器;`_snapshot()` 实时路径瘦身;保留指标/S/R 低频计算。
- 测试:`backend/tests/test_realtime.py` 增加监听器通知用例;`backend/tests/test_webapi.py` 更新 candle 更新帧断言。
- 前端:`frontend/src/api/bitgetWs.ts`、`datafeed.ts` 无需改动,契约不变。
- 不涉及存储层、指标算法、市场 hub 其它频道。
