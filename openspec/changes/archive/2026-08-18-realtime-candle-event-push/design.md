## Context

K 线现价不实时跳动,根因在后端 `/ws` 的 candle 转发通道:

- `webapi.py` 的 `candle_loop` 每 5 秒轮询一次 buffer,而非随 Bitget 源(有成交时 1 秒推一次)转发。
- 每次轮询都调用 `_snapshot()`,内部同步执行 `_read()`(parquet 全量读取)、`levels.build_levels(df)`、`indicators.compute(df)`。这些 pandas 重计算阻塞 asyncio 事件循环,当订阅 series 较多或数据量大时,单轮耗时可能远超 5 秒,现价几乎只在新 bar 出现时(时间边界)才有变化。

`BitgetWsStream`(realtime.py)已维护每 series 最新 bar 的 buffer(`_upsert` 按 open_time 覆盖),Bitget 源每秒推送,但没有任何事件通知机制——只有轮询式的 `latest()/recent()` 读取接口。前端链路(pro → `updateData` → klinecharts 覆盖最后一根)已验证无需改动。

## Goals / Non-Goals

**Goals:**
- 现价随 Bitget 源实时刷新:bar 更新事件到达后 ~1 秒内推送到前端。
- 实时路径与重计算解耦:update 帧只含 `last_candle` + `price`,不触发 parquet/指标/S-R 计算。
- 保持订阅时 snapshot(含指标/S-R)与低频周期(约 5 秒)的完整帧刷新能力。
- 保持前端契约不变,前端零改动。

**Non-Goals:**
- 不修改指标/S-R 算法本身。
- 不改动存储层、market hub 其它频道(books/trade/ticker 等)。
- 不做前端侧节流或补帧(带宽已由后端节流控制)。
- 不改变断线重连/重订阅协议。

## Decisions

### D1: `BitgetWsStream` 增加线程安全的监听器机制
在 `_handle_frame` 成功 `_upsert` 后,若某 series 最新 bar 变化,通知该 series 的监听器。监听器以 `dict[(category, symbol, timeframe), set[callback]]` 维护,受现有 `self._lock` 保护;通知时拷贝回调解集,避免回调中增删导致的迭代冲突。`add_listener` / `remove_listener` 提供注册/注销。

- **备选**:轮询 `latest()` 对比前后值判断变化。被否——无法感知"同 OHLCV 未变"外的节流需求,且仍需轮询。
- **备选**:用 asyncio.Event 逐个唤醒。被否——每个 series 需要独立事件集,监听器回调更直接。

### D2: `/ws` 由 `candle_loop` 轮询改为订阅式事件推送
`ws()` 处理函数在 `channel=="candle"` 订阅时,注册该 series 的监听器回调:回调将 `{"channel":"candle","symbol":...,"action":"update","data":{...,"last_candle":bar,"price":...}}` 通过现有 `send()`(带 send_lock)推送给该连接。按 series 维护 `last_push_ts`,两次 update 间隔不足 ~1 秒时合并为"最后一条待发",到点补发(节流)。

- **备选**:保留 `candle_loop` 仅缩短间隔到 1 秒。被否——仍是轮询,且 `_snapshot` 重计算问题未解决。
- **备选**:事件循环 + 队列。被否——`_handle_frame` 与 `ws()` 同在 asyncio 事件循环,直接调度任务即可,无需队列。

### D3: `_snapshot()` 实时路径瘦身,指标/S-R 走独立低频周期
实时 update 帧只取 `stream.latest()` 的 bar 与 close。指标/S-R/组合浮盈由两部分提供:(a) 订阅时的 snapshot 帧;(b) 独立低频循环(约每 5 秒)遍历仍在订阅的 candle series,调用完整 `_snapshot()` 推送。该低频循环仍为轮询,但只跑重计算、不承担实时性,可接受。

- **备选**:全部交给实时事件(含指标)。被否——每次 bar 更新重算指标/S-R 成本过高,正是当前性能问题的根源。
- **备选**:前端主动拉指标。被否——多一次往返且改动前端,违背零前端改动目标。

### D4: 节流采用"合并最后一条"策略
每个 series 记录上次实际发送时间;事件到达且距上次 <1s 时,仅更新 `pending` 占位并启动/复用补发计时;到点发送最新 bar。保证每秒最多一帧且永不丢最新价。

- **备选**:直接丢弃窗口内帧。被否——极端高频下可能长时间不刷新现价。
- **备选**:按帧透传。被否——Bitget 已按秒推,透传即可但多订阅时仍可能放大;合并策略更稳健。

## Risks / Trade-offs

- [监听器回调阻塞事件循环] → 回调只做 `asyncio.create_task(send(...))` 调度,不做同步 IO;`send()` 内部有锁,量级极小。
- [低频指标循环仍可能偶尔变慢] → 它不承担实时性;若单轮超时,下一轮继续,前端只是指标/S-R 刷新略迟,现价不受影响。
- [节流合并窗口内的中间价被跳过] → 1 秒窗口足够密,且合并策略保证最终发最新价;若需要更细粒度,后续可调低节流阈值。
- [监听器注册/注销与断连竞态] → `finally` 块统一注销;`remove_listener` 幂等;通知前拷贝集合避免迭代中修改。
- [多连接共享同一 series 监听] → 每个连接各自注册监听器,退订只移除自己的回调;stream 侧 refcount 已有 `_extra` 机制兜底。

## Migration Plan

1. 在 `realtime.py` 增加监听器 API 与通知逻辑,先不加消费方,跑通现有测试。
2. 改造 `webapi.py` `ws()`:candle 订阅注册监听器、退订/断连注销;新增低频指标循环替代旧 `candle_loop` 的重计算职责。
3. 更新后端测试(test_realtime.py 监听器通知、test_webapi.py update 帧断言),跑通全部单测。
4. 本地起后端 + 前端联调:观察现价是否 ~1 秒刷新、指标/S-R 是否按 5 秒刷新。
5. 回滚:改动局限于 `realtime.py` / `webapi.py` 两个文件,回滚单 commit 即可;前端契约未变,无前端回滚需求。

## Open Questions

- 节流阈值固定 1 秒是否满足产品预期?(Bitget 源已是 1 秒粒度,理论上无更高频数据可用)
- 低频指标周期 5 秒是否合适,还是应随订阅数自适应放大?(默认 5 秒,若订阅 series 过多再评估)
