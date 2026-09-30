---
type: "Fragment"
id: backend/src/realtime
title: "实时行情流与交易所镜像"
description: "K 线实时推送与多品类行情镜像如何订阅、如何引用计数、如何保证时间不回退？"
parent: /backend/src/_overview.md
fragment: realtime
entity_names:
  constants:
    - name: PING_FRAME / PONG_FRAME
      value: "字符串 \"ping\" / \"pong\""
      source: backend/src/market_data/realtime.py（streamhub.py 内各自重复定义）
    - name: MAX_BARS_PER_SERIES
      value: "200"
      source: backend/src/market_data/realtime.py
    - name: MAX_TRADES_PER_SYMBOL
      value: "200"
      source: backend/src/market_data/streamhub.py
    - name: MAX_DEPTH_LEVELS
      value: "400"
      source: backend/src/market_data/streamhub.py
    - name: CHANNEL_ALIASES
      value: "{'mark-price': 'ticker', 'funding-time': 'ticker', 'ticker': 'ticker'}"
      source: backend/src/market_data/streamhub.py
retrieval_hints:
  - "某个新 symbol/周期刚切过来时实时 bar 是怎么开始推送的？"
  - "为什么前端图表偶尔出现比当前 bar 更旧的一根 bar？该在哪里防？"
  - "多个客户端订阅同一 series 时是否会重复向 Bitget 发起订阅？"
  - "订单簿深度档位显示为 0 或顺序错乱怎么查？"
  - "⚠️ 如果你找的是 `market-data` CLI / Bitget MCP 工具（拉历史那条通道），不在这里：历史拉取在 `src_ingestion.md`"
  - "⚠️ 如果你找的是 K 线快照流的**重连与状态显示实现（前端 `connectSnapshot`）**，不在这里，在 `frontend/src`"
  - "本模块也叫『实时流 / WS 管道 / 行情镜像 / market hub』"
  - "架构归属：新的 Bitget 公共频道接入 MUST 加在 `streamhub.py`，不得在 `webapi.py` 里新开一条 WS 连接"
architectural_role: "实时数据通道层（Bitget 公共 WS → 内存镜像 → /ws 分发），不落盘、不做分析"
---

## 业务意图

本层解决的业务问题是：**让「当前价格与最新一根 bar」在任何时刻都是可用且不回退的**，同时不把交易所连接数打爆。图表需要秒级刷新、行情终端需要全量 ticker/深度/成交/标记价/资金费率镜像，而 Bitget 公共 WS 是「按连接共享、按频道订阅、有引用计数语义」的单向管道。本层把连接管理、内存镜像、订阅回收与保序责任收敛在一处，使接口层只做「读镜像 + 转发」，不触碰协议，也使数据层（Parquet）不必为实时性买单。

## 对外接口（对内被 webapi 消费，对外的 WS 协议在 `src_api_stores.md`）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `BitgetWsStream.start/stop` | 生命周期 | `url`、`heartbeat_seconds`、`reconnect_seconds` | 建立单条上游连接、心跳、断线重连后重发全部订阅 | `realtime.py` |
| `stream.subscribe/unsubscribe(category,symbol,timeframe)` | 动态订阅 | 引用计数 | 任意线程可调用：worker 线程会交回本流所属 loop（无可用 loop 时仅记 `_extra`，连接时生效） | `realtime.py` |
| `stream.latest(...)` / `stream.recent(...,limit)` | 读镜像 | 最多 `MAX_BARS_PER_SERIES=200` | `/ws`、`/candles/recent`、播种兜底的唯一实时数据源 | `realtime.py` |
| `stream.add_listener/remove_listener` | 事件 | 按 series 的回调集合 | 事件驱动实时推送的触发源；一个坏 listener 不得弄断流 | `realtime.py:BitgetWsStream._notify` |
| `MarketStream.subscribe(channel,symbol,category)` | 动态订阅 | `CHANNEL_ALIASES` | 镜像按品类隔离维护；ticker 支持全品类拉取 | `streamhub.py:MarketStream.subscribe` |
| `MarketStream.tickers()/ticker()/orderbook()/trades()/mark_prices()/funding()/instruments()` | 读镜像 | 与 REST 快照端点一一对应（`tickers`/`books`/`trades`/`funding`/`mark-price`/`instruments`） | REST 快照接口读的就是这些内存镜像，缺数据返回空集合而非 5xx | `streamhub.py` |
| `OrderBookMerger` | 簿侧合并 | `levels`、`bids/asks`、深度上限 | 订单簿快照 + 增量的归并点；`_trim` 限制档位数 | `streamhub.py:OrderBookMerger` |

**外部（Bitget）协议要点**：频道名用 `candle{granularity}` + `instType=category` + `instId=symbol`；订阅/退订帧形如 `{"op":"subscribe|unsubscribe","args":[{instType,channel,instId}]}`，退订帧 MUST 带 `instId`；心跳 MUST 是纯文本 `ping`，收到 `pong`。**禁止** `{"event":"ping"}` 这类非官方格式；否则上游回错误帧并静默断流。

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `models.py` | `timeframe_to_granularity` / `granularity_to_timeframe` 保证 series 键与 Bitget 频道 token 一致；仅实时级别 1s 可订阅但无 REST 播种路径 | `timeframe_to_granularity`、`is_realtime_only_timeframe` | extracted |
| `src_analysis.md` | `_snapshot` 在事件推送之外仍要重算指标/S-R | `indicators.compute`、`levels.build_levels` | extracted |
| `bitget-candle-public-ws`（外部，`wss://ws.bitget.com/v2/ws/public`） | 唯一实时源，无需鉴权 | `connect(url=...)` | extracted |
| `src_ingestion.md` / `src_data_store.md` | 首屏播种：buffer 为空时从 REST 拉 + 随后 `stream.subscribe`；buffer 与 store 合并保证图表连续（`/candles` 历史 + 实时增量） | `_seed_candles_from_rest` | extracted（播种）/ inferred（buffer 与 store 的合并保证，未在源码中直接观察到显式合并路径，需复核） |

**反向调用方**

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `webapi`（`src_api_stores.md`） | `/ws` 频道分发、`/tickers`/`/books`/`/trades`/`/funding`/`/mark-price`/`/instruments` 快照读取 | `create_app.ws`、`webapi.tickers`、`webapi.books_categorized` 等 |
| `src_ingestion.md` | buffer 空时播种后 `subscribe` | `_seed_candles_from_rest` |
| `src_news` | 无直接依赖，仅共用同一事件循环约定（工作线程用 `run_coroutine_threadsafe`）**[需人工核对]** | — |

## 典型调用链

```
Bitget candle 帧到达 → _handle_message → 写入 buffer（≤ MAX_BARS_PER_SERIES）
  → _notify(listeners)                       ← 本模块
    → webapi candle_listener 回调             ← 接口层：按 series 水位比对
      → 水位更旧 → 丢弃（图表列不变，不触发回调）
      → open_time 等于已投递值 → 替换最后一根 bar
      → 新 open_time → 追加为新一根 bar（保持升序）
      → /ws send {"channel":"candle","category":…,"symbol":…,"timeframe":…,
                  "action":"update","data":{last_candle, price}}
```
```
/ws 收到 {"op":"subscribe",args:[{channel,symbol,category?}]}, category 缺省用 USDT-FUTURES
  → webapi 解析 4 元组 (channel,category,symbol,timeframe)
    → channel=="candle" → stream.subscribe(...)      ← 本模块
      → 引用 0→1：向上游发官方 subscribe 帧（多连接共用一路上游）
    → 其他 channel → market.subscribe(...)           ← 本模块（镜像按品类）
```

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 |
|-------|----|---------|------|
| `PING_FRAME` / `PONG_FRAME` | `"ping"` / `"pong"` | `realtime.py`（`streamhub.py` 重复定义） | 官方心跳格式 |
| `MAX_BARS_PER_SERIES` | `200` | `realtime.py` | 每 series buffer 上限（播种兜底依赖它） |
| `MAX_TRADES_PER_SYMBOL` / `MAX_DEPTH_LEVELS` | `200` / `400` | `streamhub.py` | 成交环形缓冲 / 深度合并上限 |
| `CHANNEL_ALIASES` | 见 frontmatter | `streamhub.py` | v2 无独立标记价/资金费率频道，二者从 ticker 帧里取（v2 不提供独立渠道）——按此映射路由 |

### 必须实现的函数 / 不可省略的行为

| 函数 | 所在文件 | 说明 |
|---|---|---|
| `_send_op`（`realtime.py`）与 `_request`/`_safe_send`（`streamhub.py`） | 订阅 op 的两条发送路径 | **两处各自维护「订阅必须真正送达」的契约：`_send_op` 超时/失败 MUST 主动关闭上游 socket 以迫使 `_run_loop` 重连并重发全部 `_channels()`；一旦改成只 `logger.warning`（fire-and-forget），引用计数会谎称已订而上游未订，该 series 一直冻结到下次意外重连** |
| `_run_loop` / `_read_loop` / `_subscribe` | `realtime.py` | 连接异常 MUST NOT 弄死循环（`except Exception` 后 `sleep(reconnect)` 重试）；重连后 MUST 从 `_channels()` 重发「默认集合 + `_extra`」全部订阅；订阅帧 MUST 按 ~3000 字节分块发送（上游单条约 4096 字节上限） |
| `_handle_frame` / `_upsert` | `realtime.py` | 只接受 `action ∈ {snapshot, update}` 且 channel 以 `candle` 开头、granularity 可反解的帧（`event: ping/subscribe/unsubscribe/error` 一律静默）；`_upsert` 同 `open_time` **替换**、更旧 bar 按升序插入、超 `MAX_BARS_PER_SERIES` 从头裁剪 → **buffer 自身永不回退**，「丢弃更旧帧」属接口层投递语义而非本层 |
| `_read_loop` 静默判定 | `realtime.py` / `streamhub.py` | `recv` 超时（`heartbeat_seconds`，默认 30s）先补发一次 `ping`，**连续两次静默**才 `raise ConnectionError` 触发重连（单次即断会在低波动行情反复抖动） |
| `_notify` | `realtime.py` | 单 listener 抛错必须不影响其他 listener 与流（`except` + `logger.exception`） |
| `stream.stop()`（`_stopping=True`，并 cancel `_op_tasks`/`_op_futures`） | `realtime.py` | 主动停止 MUST NOT 再自动重连（`_run_loop` 首行判 `_stopping`），否则测试/关停会泄漏连接 |

### 设计决策（两种方案均可行的地方）

| 决策点 | 选定方案 | 备选方案 | 理由 |
|---|---|---|---|
| 实时推送方式 | 事件驱动（bar 变化即推）+ 独立 ~1s 节流 | 定时轮询 buffer | 轮询既慢又浪费；但事件驱动必须配「send-latest 合并 + 节流」，否则同一 bar 会产生重复帧、高波动行情会打满事件循环 |
| `update` 帧负载 | 只带 `last_candle` + `price` | 带全量 snapshot | 指标/S-R 重算是 CPU 密集的，放进 WS 回调路径会阻塞事件循环；故重算只给 snapshot 和约 5s 低频 snapshot |
| 与 candle 管线的关系 | `streamhub.py` 另开一套 ticker/books/trades 流，`realtime.py` 的 `BitgetWsStream` 只跑 candle，**不改** | 合并成一个 hub，实时层与镜像层分离 | candle 路径有严格保序不变量，被行情终端需求改动牵连风险高；历史决策为「隔离」，扩展时不得为省事而合并两条管线 |
| 上游订阅数 | 按 `(category, channel, symbol)` 引用计数（`RefCountSubscription`），多内部订阅者共用一路 | 每订阅者一条连接 | Bitget 单连接订阅数有限，1:1 放大必然触顶；退订降为 0 才向上游发 `unsubscribe` |

## 边界（能做什么 / 禁止什么）

- ✅ 可在本层新增 Bitget 公共频道（保持按品类隔离，`SPOT` / `USDT-FUTURES` 两品类）。
- ❌ 禁止在本层做落盘、写 JSON、算指标——这会把阻塞式计算拖进事件循环。
- ❌ 禁止在 `webapi.py`（或其他处）另开直连 WS：**所有 Bitget 订阅都必须经这两个流的引用计数路径**，否则订阅无法回收、频控与连接数失控。
- ❌ 禁止只按 `symbol` 唯一化订阅（前端侧同名不同周期会串流）。
- ❌ 禁止把保序检查搬到 `webapi` 之外的「更上游」位置去丢帧：它属接口层投递语义，丢帧影响只在图表列。
- ⚠️ 品类范围只允许 `SPOT` 与 `USDT-FUTURES`，其它产品线**明确排除**；镜像与订阅必须按 `category` 维度独立。 （来源: `openspec/specs/multi-market-hub/spec.md` + `models.py:MARKET_CATEGORIES`）
- ⚠️ 保序状态 MUST 按 series 独立保存水位，切 symbol/周期时不复用旧水位；且**只作用于实时 candle 投递路径**，不得影响历史加载与向左 prepend。

## 变更风险

| 改动 | 破坏什么 | 后果 |
|---|---|---|
| 把水位检查前移或在历史/回灌路径复用 | store 历史与 buffer 合并后的左侧更早数据（历史加载与向左回填 MUST 不受实时保序影响） | 回填失效 / store 历史无法拼上 |
| 让 `update` 帧携带指标/S-R（为省事复用 snapshot 构造函数） | `/ws` 事件路径不再只做 buffer 读 + 字段过滤 | 事件循环被阻塞，全站 WS 变卡 |
| 去掉 `/ws` 层「重复订阅幂等（不重复加引用计数）」 | 断线重连后重新订阅同 series 时计数 +2，退订减不回 0 | 永不释放订阅，内存镜像与上游订单一同泄漏 |
| `models.py` 的 granularity 映射变更 → candle 频道名随之变，但 `_normalize_timeframe` 与 buffer key 仍按**内部 timeframe** 键（`Stream.buffer` 用 `category/symbol/timeframe`），只有 `channel` 参数按**上游 token** 构造 | 上游频道 token 与 buffer key 两套语义不能混用 | 路由错 series、镜像与回调对不上号 |
| 未与前端同步修改即变更 `stream.recent/`candles` 合并语义（buffer + store 拼接）的返回结构 | 图表历史的连续性（无重复/严格升序） | L1 前端历史连续性回归（来源: `kline-history-gap-fill`） |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **上游通道与心跳格式固定**：K 线与行情镜像走 Bitget 公共 WS `wss://ws.bitget.com/v2/ws/public`（免认证），candle 频道名为 `candle{interval}`（`candle5m`/`candle1d`/`candle1s`…）；心跳 MUST 用官方格式——客户端发纯字符串 `ping`、服务端回 `pong`，MUST NOT 发 JSON 帧。断线 MUST 退避重连并重订阅全部频道（⚠️ 已知偏差：`reconnect_seconds` 目前为固定 5s 且 `_channels()` 全量重订已实现，但规格要求的「递增退避（有上限）」未实现——修重连风暴时顺手补齐，勿只改延迟不改序列）。（来源: `openspec/specs/bitget-realtime-stream/spec.md`、`openspec/specs/ws-series-routing/spec.md`）
- **buffer 语义**：每 series 缓存最近 N 根——订阅快照批次逐行 upsert、实时更新按同 `open_time` 覆盖、超出容量裁剪；并 MUST 提供同步读取接口（最新单根 / 最近批次，无数据分别返回 `None` / 空列表）。裁剪窗口是图表「刚打开就有近期历史」承诺的实现点。（来源: `openspec/specs/bitget-realtime-stream/spec.md`）
- **引用计数是唯一的上游订阅开关**：按品类 + symbol + 频道维护计数，0→1 才向 Bitget 发起，降 0 才退订释放；多个前端订阅方 MUST 共一路上游订阅，同连接重复 subscribe MUST 幂等（不得重复增加引用计数）；客户端断连 MUST 释放其全部订阅并停止推送。（来源: `openspec/specs/exchange-data-hub/spec.md`、`openspec/specs/realtime-ws/spec.md`、`openspec/specs/kline-stream-resilience/spec.md`）
- **保序只保护实时路径**：早于本 series 已投递最新 `open_time` 的实时帧 MUST 判 stale 丢弃；水位 MUST 按 `category:symbol:timeframe` 独立持有，切换 series 不得沿用旧水位；该防护 MUST NOT 影响历史加载与向左回填（更早历史 prepend 合法）。（来源: `openspec/specs/kline-realtime-order-guard/spec.md`、`openspec/specs/ws-series-routing/spec.md`）
- **帧形状是前后端契约**：所有帧 MUST 携带 `channel/category/symbol/timeframe/action/data`（category 缺省 `USDT-FUTURES`），前端据此精确路由，MUST NOT 依赖缺省值推断；`update` 帧只带 `last_candle` 与 `price`，指标与 Top-N S/R 只出现在 `snapshot` 帧与约每 5 秒的低频周期帧，且事件帧与低频帧 MUST 按 series 保持时间保序。（来源: `openspec/specs/ws-series-routing/spec.md`、`openspec/specs/realtime-candle-push/spec.md`）
- **实时路径 MUST NOT 读盘或重算**：收到 bar 事件 SHALL 仅从 buffer 取最新 bar 推送，不读 parquet、不算指标/S-R（性能红线；重算归低频周期与 `/analyze`）。（来源: `openspec/specs/realtime-ws/spec.md`）
- **跨线程投递 MUST 可靠**：`BitgetWsStream` 的订阅/退订在任意调用线程（含无事件循环的 FastAPI 同步端点工作线程）MUST 被投递到流所属事件循环，同步端点触发的订阅 MUST NOT 被静默丢弃；`start()` 之前（尚无事件循环）的订阅 SHALL 保留在待订阅集合中、首次连接时随 `_channels()` 生效；发送失败或超时 MUST 告警并关闭上游连接以触发重连重订；`/ws` 对同一连接的重复 subscribe MUST 幂等（引用计数只加一次）。（来源: `openspec/specs/kline-stream-resilience/spec.md`「订阅操作可靠投递」）
- **监听器为同步扇出，坏监听不得弄挂流**：`_notify` 先复制该 series 的回调集合再逐个同步调用，单个回调抛异常 MUST 被捕获并记错（不得中断其余监听与 WS 读循环）——因此监听器内 MUST NOT 做重计算或同步 IO（指标/S-R 归低频周期与 `/analyze`）。（来源: `backend/src/market_data/realtime.py`（`_notify` 逐回调 try/except）、`openspec/specs/realtime-ws/spec.md`）
- **频道范围与品类隔离**：镜像频道为 `ticker`/`books`/`trade`/`mark-price`/`funding-time`，按 category 分别维护且互不干扰；通配订阅（`default`/`*`）SHALL 先 `snapshot` 后周期 `update`，并与精确订阅在同一频道内共存不串流。（来源: `openspec/specs/exchange-data-hub/spec.md`、`openspec/specs/multi-market-hub/spec.md`、`openspec/specs/realtime-ws/spec.md`）
- **职责边界**：实时层 SHALL 只维护内存镜像，落盘 MUST 由 `ingestion.py` 的增量拉取独立驱动（避免每 tick 写盘）。（来源: `openspec/specs/scheduled-ingestion/spec.md`）
