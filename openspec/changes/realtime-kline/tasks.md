## 1. Spike：Bitget WS 协议确认

- [x] 1.1 写临时脚本连接 `wss://ws.bitget.com/v2/ws/public`，订阅 candle5m BTCUSDT，打印原始帧（订阅 ack / ping-pong / candle 数据），确认帧键与数组顺序
- [x] 1.2 确认心跳方向（服务端 ping→客户端 pong 或需客户端主动 ping）、channel 命名反向映射（candle5m↔5m、candle1d↔1d）、args 字段（instType/instId），结论写回设计 D3

## 2. 后端 realtime.py

- [x] 2.1 `pyproject.toml` 新增 `websockets>=12` 依赖并安装
- [x] 2.2 `config.py` 新增 `ws_public_url`（默认 `wss://ws.bitget.com/v2/ws/public`）、`ws_heartbeat_seconds`（默认 30）、`ws_reconnect_seconds`（默认 5）
- [x] 2.3 `realtime.py`：`BitgetWsStream`——由 `settings.symbols × settings.timeframes` 推导频道集合，`start()/stop()` 生命周期，`latest(category, symbol, timeframe)` 同步读取（threading.Lock 保护 buffer）
- [x] 2.4 连接循环：`websockets.asyncio.client.connect` → 订阅全部频道 → 读取循环；异常按退避重连并重订阅
- [x] 2.5 帧解析：订阅 ack/error 日志；candle 帧复用 `KlineIngestor._coerce_row` 得规范 OHLCV，按 series key 更新 buffer（同 open_time 覆盖）；ping 回 pong、超时主动探测

## 3. webapi 集成

- [x] 3.1 `create_app` 增加 lifespan：启动 `stream.start()`、关闭 `stream.stop()`；启动失败非致命，日志告警后继续以存储数据服务
- [x] 3.2 `_snapshot` 注入 `last_candle`：有实时 bar 时价格取实时收盘价并带 `last_candle`，否则回退存储数据、不含该字段

## 4. 后端测试

- [x] 4.1 `tests/test_realtime.py`：candle 帧解析与 buffer 更新（含同 open_time 覆盖、多 series 隔离）、订阅消息构建、`latest()` 空与有数据
- [x] 4.2 重连逻辑测试：伪 WS 服务端（websockets 进程内 server）发帧后断开，断言流重连并重订阅、buffer 持续更新
- [x] 4.3 `tests/test_webapi.py`：注入带数据/无数据 stream 的 `_snapshot` 语义（有 last_candle + 实时价格 / 无 last_candle + 存储价格）

## 5. 前端接线

- [x] 5.1 `api/types.ts`：`Snapshot` 新增 `last_candle?: { open_time; open; high; low; close; volume }`
- [x] 5.2 `lib/transform.ts`：新增 `candleToKLine(c)`（open_time→timestamp 毫秒），`transform.test.ts` 增补断言
- [x] 5.3 `App.vue`：computed `lastCandleKLine`（快照有 last_candle 时转换），传给 ChartTerminal `last-candle`
- [x] 5.4 Chart 链路测试：模拟快照带 last_candle，断言 Chart.vue 收到并经控制器 `updateData`

## 6. 联调验证

- [x] 6.1 启动后端（含流）与前端 dev，确认 `/ws` 快照含 `last_candle`、K 线最后一根随帧跳动、断网/重启后自动恢复
- [x] 6.2 全量回归：`pytest`、`npm test`、`npm run typecheck`、`npm run build`

