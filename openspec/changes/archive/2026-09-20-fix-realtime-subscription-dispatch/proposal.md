# Fix Realtime Subscription Dispatch

## Why

`/candles/recent` 是同步 FastAPI 端点（线程池执行），其中调用的 `BitgetWsStream.subscribe()` 在工作线程内没有运行中的事件循环，原 `_request()` 直接 `return`——订阅帧被静默丢弃，但 refcount 已记为 1。随后 `/ws` 的真实订阅只做 ref++（不再发送），上游 Bitget 永远收不到该 series 的订阅，K 线实时事件彻底停更（前端仅剩 ~5s 轮询快照且 `last_candle` 被水位线剔除）。

e2e 复现：三页序列中第 3 页必然拿不到 candle 事件帧（REST 与 WS 两条订阅路径的先后竞态）。同时发现 `/ws` 处理器对重复 subscribe 不做幂等，造成 refcount 泄漏（1→2→3）。

## What Changes

- `realtime.py`：`start()` 捕获所属事件循环；`subscribe`/`unsubscribe` 在无循环线程中通过 `asyncio.run_coroutine_threadsafe` 把订阅操作投递回主循环（不再静默丢弃）；`_send_op` 带 5s 超时、失败告警并强制关闭上游连接以触发重连重订；保留 op 任务强引用防止任务被回收。
- `webapi.py` `/ws`：candle / market 订阅幂等（同连接重复订阅不再重复 ref++），避免 refcount 泄漏导致 buffer 永不释放。
- 新增回归测试（`tests/test_realtime.py`）覆盖：跨线程 subscribe 必达、start 前延迟到 connect、发送失败强制重连。

## Impact

- Affected specs: `kline-stream-resilience`（新增"订阅操作可靠投递"要求）
- Affected code: `backend/src/market_data/realtime.py`、`backend/src/market_data/webapi.py`
- 修复用户可见问题：页面刷新/重载后 K 线实时更新可能静默停止（需等待 60s+ 心跳重连才自愈，或永不自愈）。
