## Context

`BitgetWsStream`（`realtime.py`）为 `/ws` 的 candle 通道提供上游订阅与事件推送。订阅操作经 `_request()` 发送到上游 Bitget WS。问题链条：

1. `/candles/recent`（`webapi.py:462`）为**同步**端点（FastAPI 线程池执行），缓存未命中时调用 `stream.subscribe()` 预热序列。
2. `_request()` 原实现 `asyncio.get_running_loop()` 在无循环线程中抛 `RuntimeError` → `return`，注释假定"下次重连时会生效"——但 refcount `_extra` 已加 1。
3. `/ws` 的真实订阅随后命中 `key in self._extra` 分支，仅 ref++，**不再发送任何上游订阅帧**。
4. 上游从未订阅该 series → `_notify` 永不触发 → 该连接只能收到 ~5s 轮询快照（且水位线可能剔除 `last_candle`）。
5. 自愈路径只剩上游 WS 自身的 30s/60s 心跳重连（`_channels()` 会带上 `_extra`）——期间实时事件完全缺失；若心跳始终有数据则永不自愈。

另发现 `/ws` 处理器对重复 subscribe（React StrictMode 双挂载/重试）不做幂等：`subs[key] = arg` 覆盖但 `stream.subscribe` 每次调用都 ref++，导致 refcount 泄漏、退订后 buffer 不被清理。

## Goals / Non-Goals

**Goals:**
- 订阅操作在任何调用线程都可靠投递到所属事件循环并到达上游（或明确失败并触发重连重订）。
- `/ws` 订阅幂等，无 refcount 泄漏。
- 发送失败可观测（告警 + 强制重连），不再静默。

**Non-Goals:**
- 不改动 `/ws` 对外协议、消息形状与快照语义。
- 不改动上游重连/心跳策略（既有 30s 心跳 + 5s 重连保持不变）。

## Decisions

**决策 1：`start()` 捕获事件循环，`_request` 跨线程用 `run_coroutine_threadsafe`**

- `start()` 由 lifespan（运行中的循环）调用，保存 `self._loop`。
- `_request()`：有运行循环 → `create_task`；无运行循环但 `self._loop` 存活 → `asyncio.run_coroutine_threadsafe`；两者皆无（start 前/测试线程）→ 保留原有"注册进 `_extra`、连接时生效"的语义并记 debug 日志。
- 保留任务/未来对象的强引用（asyncio 只持弱引用，未运行任务可能被回收）。

**决策 2：`_send_op` 有界发送 + 失败强制重连**

- `asyncio.wait_for(ws.send(payload), 5s)`；失败/超时 → warning + `ws.close()`（再有界等待），重连后 `_channels()` 自动重发全部订阅（含 `_extra`），实现自愈。
- 替代"fire-and-forget + 全部异常静默吞掉"的旧实现。

**决策 3：`/ws` 订阅幂等**

- candle 与 market 分支：仅当 `key not in subs` 时才执行 `stream.subscribe` / `market.subscribe` 与监听器注册；重复 subscribe 仍回快照+ack（协议兼容）。
- 退订路径维持"pop 到才退订"（已幂等）。

**决策 4：回归测试**

- `tests/test_realtime.py`：跨线程 subscribe 必达上游（旧代码必失败）；start 前调用延迟到 connect（不崩溃且进入 `_channels()`）；发送失败强制关闭上游套接字。

## Risks / Trade-offs

- [线程安全] `run_coroutine_threadsafe` 是官方跨线程投递方式；`_extra`/`_listeners` 已有 `threading.Lock` 保护，无新增竞态。
- [`_loop` 生命周期] 断言 `is_closed()`，应用关闭后调用退化为"注册待连接"，不抛错。
- [依赖真实网络] e2e 验证依赖 Bitget 公共 WS 可用（本次已用三页序列复现并验证修复）。

## Open Questions

- 是否需要把 `/candles/recent` 的 `stream.subscribe` 预热改为异步端点？本期不做（跨线程投递已根治，且保持 REST 快速返回）。
