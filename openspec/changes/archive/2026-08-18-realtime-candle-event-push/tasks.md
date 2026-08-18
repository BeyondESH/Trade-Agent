## 1. Stream 监听器机制

- [x] 1.1 `realtime.py`:`BitgetWsStream` 增加 `_listeners: dict[tuple[str,str,str], set[Callable]]`,在 `__init__` 初始化
- [x] 1.2 `realtime.py`:实现 `add_listener(category, symbol, timeframe, cb)` 与 `remove_listener(category, symbol, timeframe, cb)`(幂等、受 `self._lock` 保护)
- [x] 1.3 `realtime.py`:`_handle_frame` 在 `_upsert` 后通知该 series 的监听器(拷贝集合避免迭代修改;回调传入最新 bar 的拷贝)
- [x] 1.4 `test_realtime.py`:新增监听器通知用例——帧到达后回调收到最新 bar;`remove_listener` 后不再通知;不同 series 监听互不影响

## 2. /ws 事件驱动推送

- [x] 2.1 `webapi.py`:删除 `candle_loop` 中按 5 秒轮询推 `_snapshot` 的实时职责,保留/重构为低频指标周期循环(约 5 秒推完整帧)
- [x] 2.2 `webapi.py`:`ws()` 在 `channel=="candle"` 订阅时,为该 series 注册监听器;回调通过 `asyncio.create_task(send(...))` 推送 `{"channel":"candle","symbol":...,"action":"update","data":{"price":...,"last_candle":bar}}`
- [x] 2.3 `webapi.py`:实现按 series 的 ~1 秒节流(记录 `last_push_ts`,`pending` 占位 + 补发计时,保证每秒最多一帧且不丢最新价)
- [x] 2.4 `webapi.py`:退订/断连 `finally` 块中注销该 series 监听器;低频指标循环只在仍有订阅时遍历
- [x] 2.5 `webapi.py`:`_snapshot()` 实时路径瘦身——update 帧构建只读 `stream.latest()`,不触发 parquet/指标/S-R;完整快照逻辑保留给订阅 snapshot 与低频循环

## 3. 测试与联调

- [x] 3.1 `test_webapi.py`:更新/新增断言——订阅后收到 snapshot(含 last_candle),随后收到事件驱动的 update 帧(含 last_candle + price,不含 levels/macd_hist)
- [x] 3.2 `test_webapi.py`:新增节流用例——同一 series 短时间内多次 bar 更新,update 帧不超每秒一次且最终值为最新价
- [x] 3.3 `test_webapi.py`:新增断连注销用例——连接断开后监听器被移除,不再推送
- [x] 3.4 运行 `backend` 全部单测(`python -m pytest tests/ -q`)确认通过
- [x] 3.5 运行 `openspec validate --all` 通过;本地起后端 + 前端联调,确认现价 ~1 秒刷新、指标/S-R 约 5 秒刷新
