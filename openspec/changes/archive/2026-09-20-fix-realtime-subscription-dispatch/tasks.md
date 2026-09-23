## 1. 修复实现

- [x] 1.1 `realtime.py`：`start()` 捕获所属事件循环至 `self._loop`
- [x] 1.2 `realtime.py`：`_request()` 无运行循环时经 `asyncio.run_coroutine_threadsafe` 投递（保留任务/未来强引用）
- [x] 1.3 `realtime.py`：`_send_op()` 有界发送（5s 超时）、失败告警并关闭上游以触发重连重订；`stop()` 取消挂起操作
- [x] 1.4 `webapi.py` `/ws`：candle / market 订阅幂等（`key not in subs` 才 ref++ 与注册）
- [x] 1.5 `realtime.py`：`concurrent.futures` 导入与类型标注，ruff check/format 通过

## 2. 回归测试（`backend/tests/test_realtime.py`）

- [x] 2.1 跨线程 `subscribe` 必达上游（无循环线程 + `run_coroutine_threadsafe`）
- [x] 2.2 `start()` 之前调用延迟到 connect 生效且不抛错
- [x] 2.3 发送失败强制关闭上游套接字（触发重连）
- [x] 2.4 `pytest tests/test_realtime.py -q` 全绿

## 3. 验证

- [x] 3.1 复现场景（三页序列 e2e，默认调度器开启）修复前必失败、修复后 `kline-realtime.spec.ts` 连续两次 3 passed
- [x] 3.2 `pytest -q -m "not integrity and not live and not online"` 全绿（380 passed / 0 errors）
- [x] 3.3 `ruff check .` 与 `ruff format --check .` 通过
- [x] 3.4 全量 e2e（4 个 spec）通过
