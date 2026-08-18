## Context

前端"实时价格"实为 Parquet 末行收盘价，scheduler 每 300s 才刷新；K 线最后一根 bar 不跳动。Change A（frontend-vue-klinecharts）已交付 Vue 前端与 klinecharts 终端，`Chart.vue` 预留了 `lastCandle → controller.updateData` 的实时消费点。Bitget MCP 为纯 REST 轮询，实时 K 线唯一正路是直连 Bitget 公共 WebSocket（`wss://ws.bitget.com/v2/ws/public`，公共行情免认证），即 system-architecture 预留的"DL 量化直连通道"。

已确认事实（探索期调研）：频道名 `candle{interval}`（如 candle5m、candle1d）；订阅帧 `{"op":"subscribe","args":[{"instType":"USDT-FUTURES","channel":"candle5m","instId":"BTCUSDT"}]}`；单帧多频道、总长 ≤4096 字节；candle 数据为 `[ts, open, high, low, close, volume, ...]` 数组（字符串），与 `ingestion._coerce_row` 形状一致。心跳方向（服务端 ping→客户端 pong，30s 窗口）与部分帧键需实现期 spike 确认。

## Goals / Non-Goals

**Goals:**
- 后端 BitgetWsStream：订阅 `settings.symbols × settings.timeframes`（3 币 × 2 周期 = 6 频道），单连接常驻，心跳保活，断线退避重连 + 重订阅，解析 candle 帧写入内存 buffer。
- `/ws` 快照注入 `last_candle`；价格优先取实时 bar 收盘价，缺失回退存储数据。
- 前端 `snap.last_candle → ChartTerminal.lastCandle → Chart.vue updateData`，K 线最后一根实时跳动。
- 后端/前端测试覆盖解析、重连、快照语义与消费链路。

**Non-Goals:**
- 不做逐 tick 价格流（candle 频道随 bar 成形推送，足够实时；ticker 频道留待后续）。
- 不改 Parquet 存储与历史数据管道（实时 bar 仅内存临时覆盖最后一根）。
- 不做按前端当前 view 的动态订阅（启动即订阅固定集合，简单稳健）。
- 不动风控执行与 AI Agent 层。
- 不处理多 worker 场景（固定单 worker）。

## Decisions

### D1: WS 客户端用 `websockets`（asyncio 原生）

- 新增依赖 `websockets>=12`，使用 `websockets.asyncio.client.connect`。
- 理由：与 FastAPI/uvicorn 同一事件循环，无额外线程开销；比 aiohttp 轻。备选 aiohttp（更重、HTTP 为主）放弃。

### D2: BitgetWsStream 单连接全订阅 + 线程安全 buffer

- `BitgetWsStream` 持有：目标频道集合（由 `settings.symbols × settings.timeframes` 推导）、当前连接、后台任务、buffer `dict[str, CandleDict]`、`threading.Lock`。
- 生命周期：`start()` 创建 asyncio 后台任务进入"连接循环"；`stop()` 取消任务并关闭连接；`latest(category, symbol, timeframe) -> dict | None` 供读取。
- **线程安全**：FastAPI 同步 `def` 端点跑在线程池，读 buffer 可能与 asyncio 写并发 → buffer 读写统一持 `threading.Lock`。
- 连接循环：`connect → subscribe → read loop`；任一步异常即按 `reconnect_seconds` 退避重连并重订阅，循环内持续直到 `stop()`。

### D3: 消息解析与频道映射

**Spike 结论（实测 wss://ws.bitget.com/v2/ws/public）：**
- 订阅帧 `{"op":"subscribe","args":[{"instType":"USDT-FUTURES","channel":"candle5m","instId":"BTCUSDT"}]}` → ack `{"event":"subscribe","arg":{...}}`。
- candle 帧含两种 action：`snapshot`（历史批，多行）与 `update`（成形中实时单行）；数据均为 `[ts_ms, open, high, low, close, volume, turnover, turnover]` 字符串数组，与 `ingestion._coerce_row` 兼容。
- channel↔timeframe 反向映射成立：`candle5m`→`5m`（去 `candle` 前缀）。
- 12s 观察期内无任何服务端 ping/pong → 心跳以**客户端主动保活**为主（见下）。

- 订阅 ack：`{"event":"subscribe",...}`；错误：`{"event":"error",...}`（记日志）。
- 心跳：收到入站 `ping` 事件回 `{"event":"pong"}`；看门狗在超过 `heartbeat_seconds`（默认 30s）无任何入站消息时主动发送 `{"event":"ping"}`，若 2×间隔仍无响应则强制重连。
- candle 帧：`snapshot`/`update` 均取 `data` 行 → 复用 `KlineIngestor._coerce_row` 得规范 OHLCV；series key 由 `instType/instId/{timeframe}` 构成，`timeframe` 由 `channel` 去 `candle` 前缀得到。
- 只保留最后一根 bar：相同 `open_time` 覆盖，新 `open_time` 替换（`snapshot` 多行迭代写入，末行即最新）——buffer 恒为每 series 一根最新 bar。

### D4: webapi 集成（lifespan + 快照注入）

- `create_app` 增加 lifespan：启动时 `stream.start()`，关闭时 `stream.stop()`；流启动失败非致命，日志告警后 API 继续以存储数据服务。
- `_snapshot`：
  ```
  bar = stream.latest(category, symbol, timeframe)
  price = bar["close"] if bar else stored_close
  if bar: snap["last_candle"] = bar
  ```
- WS 端点本身是 async，读取天然同一循环；同步 REST 端点走锁。

### D5: 前端消费链路

- `api/types.ts`：`Snapshot` 增 `last_candle?: { open_time; open; high; low; close; volume }`。
- `lib/transform.ts`：`candleToKLine(c)` → `{timestamp: open_time, open, high, low, close, volume}`（毫秒对齐 klinecharts）。
- `App.vue`：`const lastCandleKLine = computed(() => snap.value?.last_candle ? candleToKLine(snap.value.last_candle) : null)`，传给 ChartTerminal `last-candle`。
- Chart.vue 已有 `watch(lastCandle) → controller.updateData`，无需改动图表层。

## Risks / Trade-offs

- **[Bitget 心跳方向与帧键未完全确认]** → D3 防御性兼容 + 任务列表前置 spike（连一次真实 WS 打印原始帧）。
- **[同步端点线程池并发读 buffer]** → D2 threading.Lock 兜底。
- **[多 worker 会开多条 Bitget WS]** → 文档注明固定 1 worker 运行；本地自用默认即单进程。
- **[流挂掉后界面静默回到旧数据]** → 快照始终带 `last_candle` 缺失时的回退路径；日志可观测；后续可在快照中加 stale 标记（本期不做）。
- **[websockets 版本 API 差异]** → 锁定 `>=12` 并只用 `websockets.asyncio` 稳定 API。
- **[订阅集合写死，新增币种需重启]** → 接受；动态订阅属过度设计，配置在 settings 已可改。

## Migration Plan

1. 后端 `realtime.py` + `config.py` 配置 + `pyproject.toml` 依赖，单测先行（解析/重连用伪 WS）。
2. webapi lifespan + `_snapshot` 注入，`test_webapi` 增补。
3. 前端类型/转换/接线 + 测试。
4. 联调：真实 Bitget WS 订阅（spike 帧格式），`/ws` 快照含 `last_candle`，前端 K 线跳动。
5. 回归：`pytest`、`npm test`、`typecheck`、`build`。

回滚：后端为增量模块+端点，可整体移除；前端改动为类型/计算属性增量。流故障不影响既有 REST/存储路径。

## Open Questions

- 心跳协议确切形态（服务端主动 ping vs 需客户端主动 ping）→ 实现前 spike。
- `channel` 命名反向映射表（candle5m↔5m、candle1d↔1d）在 spike 确认。
- 是否需要在快照里附带"数据新鲜度"标记（本期否，留作后续）。
