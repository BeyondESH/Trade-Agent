---
type: "Fragment"
id: frontend/src/data_access
title: "行情数据接入与实时通道"
description: "K 线历史怎么按 series 取回并向更早回填？ticker/盘口/成交走哪条 WS？重连后为什么必须整体重订阅、更旧的桶为什么必须丢掉？"
parent: /frontend/src/_overview.md
fragment: data_access
entity_names:
  constants:
    - name: BASE
      source: frontend/src/api/client.ts:26
      value: "\"/api\"（dev/prod 由 vite proxy `rewrite: p.replace(/^\\/api/,\"\")` 转发到 127.0.0.1:8000）"
    - name: DEFAULT_CATEGORY
      source: frontend/src/api/datafeed.ts:10
      value: "\"USDT-FUTURES\"（symbol.market / category 缺省时的产品品类）"
    - name: INSTRUMENT_TTL_MS
      source: frontend/src/api/datafeed.ts:15
      value: "60000（品种目录缓存有效期；超时或 force 才重取）"
    - name: NATIVE_TIMEFRAMES
      source: frontend/src/api/datafeed.ts:66
      value: "15 项白名单：1s,1m,3m,5m,15m,30m,1h,2h,4h,6h,12h,1d,3d,1w,1mo（集合外一律 throw）"
    - name: isRealtimeOnlyTimeframe
      source: frontend/src/api/datafeed.ts:128
      value: "normalizeTimeframe(t)===\"1s\" 为真：只推不留，不发历史请求、不参与回填/预取"
    - name: MARKET_CATEGORIES
      source: frontend/src/api/types.ts:285
      value: "[\"SPOT\", \"USDT-FUTURES\"]"
    - name: CATEGORY_LABELS
      source: frontend/src/api/types.ts:288
      value: "SPOT→现货 / MARGIN→现货杠杆 / USDT-FUTURES→U本位合约 / USDC-FUTURES→USDC本位合约 / COIN-FUTURES→币本位合约 / S*→模拟合约（仅展示用）"
    - name: 重连退避（三处同规则）
      source: frontend/src/api/bitgetWs.ts / api/ws.ts:50 / hooks/useExchangeSocket.ts
      value: "min(500 * retry, 5000) ms；onopen 后 retry 归零；仅非手动 close 才重连"
    - name: 预取节流
      source: frontend/src/api/datafeed.ts:278
      value: "5000 ms（同一 seriesKey 深历史预取的最小间隔）"
    - name: MAX_TRADES
      source: frontend/src/hooks/useTrades.ts:12
      value: "50（成交流水环形上限）"
    - name: CATEGORY_PRIORITY
      source: frontend/src/hooks/useRealSymbols.ts:9
      value: "{ \"USDT-FUTURES\": 0, SPOT: 1 }（同一 instId 多品类收敛优先级；未知品类 → Infinity 排最后）"
    - name: symbolKey / instrumentKey
      source: frontend/src/hooks/useTickerList.ts:9 与 hooks/useInstruments.ts:15
      value: "复合键 `category:instId`（category 缺省 USDT-FUTURES），形如 \"USDT-FUTURES:BTCUSDT\"；跨品类唯一性的承载体"
    - name: 警报兜底轮询
      source: frontend/src/App.tsx:315
      value: "20000 ms（全模块唯一的 REST 轮询点，只用于补 WS 未覆盖品种的触发价）"
    - name: BitgetWsStatus
      source: frontend/src/api/bitgetWs.ts:3
      value: '`"live" | "reconnecting" | "closed"` 三态；由 `onStatus()` 订阅，是状态栏连通性标识的唯一来源；退避 retry 只在 onopen 归零'
    - name: ExchangeSocket 订阅键
      source: frontend/src/hooks/useExchangeSocket.ts:26
      value: '`channel/symbol??"default"/category??"USDT-FUTURES"`（三段键，**不含 timeframe**——非图表频道不按周期分序列）；与 bitgetWs 的 4 元组 `category:symbol:timeframe` 故意不同，不可互换'
    - name: 通配订阅判定
      source: frontend/src/hooks/useExchangeSocket.ts:96-101
      value: '`symbol ∈ {default, *, ""} 即通配（同 channel+category 就投递，不要求 symbol 相等）；`category === "*"` 匹配所有品类（全市场 ticker）；精确订阅不受通配影响'
    - name: WsFrame.event
      source: frontend/src/hooks/useExchangeSocket.ts:8
      value: '`"subscribed" | "unsubscribed" | "pong"`——控制帧，不是数据帧。前端应用层不发 ping（纯字符串 `ping`/`pong` 心跳是后端→Bitget 的官方格式），该字段仅为类型兼容保留'
retrieval_hints:
  - "K 线历史数据从哪个接口进来？为什么首次进入图表就能画出很多根？"
  - "向左拖到没有数据的地方会发生什么？回填失败该查哪里？"
  - "某个周期在 /candles 返回空，是数据丢了还是它本来就没有历史？"
  - "重连之后订阅丢了 / 切到 1h 却看到 4h 的 K 线 / 图表多出一根怪 K 线，要查哪里？"
  - "为什么 WS 收到帧了但界面不动？盘口切换 symbol 后残留旧档位是什么原因？"
  - "断线重连后状态栏的「实时 / 重连中 / 断开」是谁报的？重连为什么必须整体重订阅一次？"
  - "自选列表为什么不能只拿一次性 REST 快照？通配订阅 `ticker/default` 是怎么匹配帧的？"
  - "前端在什么条件下才能认定「这个系列真的没有更早历史」？"
  - "⚠️ 你要找的『周期栏渲染、价格线、信号标记』不在这里——在 `frontend/src/chart`；这里只管数据进入图表实例之前。"
  - "⚠️ 警报触发判定与提醒面板在 `frontend/src/terminal_panels`；这里只提供共用的 `priceMap`。"
  - "⚠️ BlockBeats 快讯与全域新闻 SSE 流不在本子文档——在 `frontend/src/market_views`。"
  - "本模块也叫『数据层』『datafeed』『传输层』，对应需求里的『实时行情』『K 线历史』『盘口订阅』『断线重连』。"
  - "架构归属：新增实时频道必须复用 `hooks/useExchangeSocket.ts` 的 `exchangeSocket` 单例（禁止再 new WebSocket）；新增 REST 调用必须加在 `api/client.ts` 的 `api` 对象上；周期标识符必须经 `api/datafeed.ts` 的解析函数。"
architectural_role: "数据接入层：向上只暴露 hooks 与纯函数，向下独占与 backend/交易所的所有连接"
---

## 业务意图：这一层到底在决策什么

本层保证的**不是"有数据"，而是"图上/表里的每个数字都属于用户当前选择的品类·symbol·周期，且时间上不倒退"**。交易终端最危险的失败不是白屏，而是"看起来正常、但价格是另一个合约/另一个周期的"。因此本层的全部规则围绕三件事：

1. **series 身份不可歧义**：一条序列由 `category:symbol:timeframe` 唯一确定（订阅键、回填去重键、时间水位状态键都用它）；同 symbol 跨周期、同 symbol 跨品类必须互不覆盖。
2. **历史与实时之间的接缝必须缝合**：后端持久化是定时的（不逐 bar），历史接口与实时缓冲之间必然有缺口；本层负责合并、升序、按 timestamp 去重，且绝不把更旧的桶追加成新 K 线。
3. **拿不到就明确说没有**：解析不了的周期抛错、目录里没有的品种用显式兜底精度、区间无数据返回空数组——**都不许猜一个近似值**，因为猜错会表现成"正常的错误图表"。

## 对外接口（本层向上暴露的契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `GET /candles?{series}&start&end&limit` | 前端→后端 | `{candles[], count}` | 区间历史（limit 500）；`count===0` 表示**仓库确实没有该区间数据**，不是失败 | `api.candles`（`BitgetDatafeed.fetchStored`） |
| `GET /candles/recent?{series}&limit` | 前端→后端 | `{candles[], count}` | 近端窗口：首帧播种（200）+ 实时缓冲合并（500） | `api.candlesRecent` |
| `POST /candles/backfill {…series, before}` | 前端→后端 | `{series, appended, earliest_reached}` | 请求服务端向更早回灌；`earliest_reached` 永久关闭该 series 的回填 | `api.backfill` → `BitgetDatafeed.backfill` |
| `GET /instruments?category` | 前端→后端 | `Instrument{symbol, pricePrecision\|pricePlace, quantityPrecision\|volumePlace, symbolStatus, category}` | 品种目录：符号搜索与价格/数量精度的唯一来源（60s TTL 缓存） | `api.instruments` / `resolveSymbolInfo` / `searchSymbols` |
| `GET /tickers?category` | 前端→后端 | `Ticker[]` | 全市场快照（一次性播种，之后靠 WS 增量）；警报兜底另有一处 20s 轮询 | `api.tickers`（`useTickerList` / `useRealSymbols`） |
| `WS /ws` 订阅帧 | 前端→后端 | `{op:"subscribe"\|"unsubscribe", args:[{channel,symbol,timeframe?,category}]}` | 非图表频道：`ticker` / `books` / `trade` / `mark-price` / `funding-time` | `exchangeSocket.subscribe`（`hooks/useExchangeSocket.ts`） |
| `WS /ws` 回帧 | 后端→前端 | `{channel,symbol,category,timeframe?,action:"snapshot"\|"update",data}` | `action` 决定整盘替换还是增量合并；缺 `symbol`/`category` 的帧直接丢弃 | `BitgetWsClient.deliver`（`api/bitgetWs.ts:161`）、`useOrderBook` |
| `Datafeed` 实现 | vendor 图表→本层 | `searchSymbols` / `getHistoryKLineData` / `subscribe` / `unsubscribe` | klinecharts-pro 的取数契约 | `BitgetDatafeed`（`api/datafeed.ts:165`） |
| `GET /ws?symbol&timeframe&category&interval` | 前端→后端 | `Snapshot` | 旧的整串快照通道（URL 参数式，默认 `interval=5` 秒） | `connectSnapshot`（`api/ws.ts:15`） |

## 跨模块依赖

> 本层向下独占连接，因此"依赖"几乎都是**外部系统/契约**而非兄弟模块；反向依赖则解释了为什么改本层的帧形状会同时波及多个 UI。

| 依赖对象 | 引用原因 | 关键符号 / 契约 | confidence |
|---|---|---|---|
| `backend/src`（webapi） | 全部 REST 与 `/ws` 帧的提供方；series 标识必须完整回传 | `api.*`、`/candles`、`/candles/recent`、`POST /candles/backfill`、`/instruments`、`/tickers` | extracted |
| `frontend/vendor`（`@klinecharts/pro`） | 本层实现的 `Datafeed` 接口由 vendor 图表回调驱动（取历史 / 订阅 / 搜索） | `BitgetDatafeed.getHistoryKLineData` / `subscribe` / `searchSymbols` | extracted |
| 交易所镜像（Bitget，经后端转接） | 品类枚举、精度字段两套命名（`pricePrecision`/`pricePlace`）、`symbolStatus` | `instrumentToSymbolInfo`、`CATEGORY_LABELS` | extracted |
| `lib/transform.ts` | OHLCV→KLineData 的换算（毫秒 `timestamp`） | `candleToKLine` / `candlesToKLine` | extracted |
| React 运行时（`requestAnimationFrame`） | 高频帧合批；jsdom/测试环境下必须可退化为直接 flush | `useRealSymbols` pending 缓冲 | extracted |

> 反向：谁消费本层（改动帧形状/键时会被这些点同时打回）

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `frontend/src/chart` | 图表取历史、订阅实时 bar、品种搜索 | `bitgetDatafeed`、`BitgetWsClient.subscribe` |
| `frontend/src/app_shell` | 品种目录 / 价格图 / 警报兜底轮询 | `useRealSymbols`、`useTickerList.priceMap`、`api.tickers` |
| `frontend/src/terminal_panels` | 盘口、成交流水、资金费率·标记价、下单与警报的后端写路径 | `useOrderBook`、`useTrades`、`useDerivative`、`api.*` |
| `frontend/src/market_views` | BlockBeats / 新闻代理端点与品类标签 | `lib/marketPulse`、`lib/globalNews`、`categoryLabel` |
| `frontend/src/quant_lab` | 回测/训练/因子端点与私有 datafeed 实例 | `api.backtest`、`new BitgetDatafeed()` |
| `frontend/tests` + `backend/tests/test_live_api.py` / `test_live_ws.py` | L2/L3 直接断言帧与端点行为 | `*.test.ts(x)`、Playwright journeys |
| `frontend/scripts/diagnose-kline-realtime.mjs` | 离线复现同一条 `/ws` 协议做实时性排查 | `/ws` 帧格式（须与本层保持同步，属人工同步点） |

## 典型调用链

### 1. 切周期时的历史缝合（最容易出错的一条）

```
用户点周期栏（vendor）→ BitgetDatafeed.getHistoryKLineData(symbol, period, from, to)   ← 本层入口
  ├─ isRealtimeOnlyTimeframe → 返回 []（秒级不发任何历史请求）
  ├─ periodFromTimeframe(period.text)  ← 不可解析即 throw，绝不回退
  ├─ fetchStored: GET /candles（limit 500）→ 有数据 → mergeLiveTail(stored)
  │     └─ GET /candles/recent(500) 与 stored 归一化合并 ← normalizeBackwardList 升序 + 去 timestamp 重
  ├─ stored 空且 prevEarliest == null（首次进入）→ GET /candles/recent(200) 播种
  ├─ stored 空且是更早方向 → POST /candles/backfill → 再 fetchStored
  └─ earliest_reached → exhausted.add(seriesKey) → 该序列之后不再回填
  实时侧并行：bitgetWs.subscribe → deliver → candleToKLine → callback   ← 跨模块：chart
```

### 2. 全市场 ticker（REST 播种 + 通配增量 + rAF 合并 + 品类收敛）

```
App 挂载 → useRealSymbols()
  → GET /tickers 播种，key = `${category ?? "USDT-FUTURES"}:${instId}`
  → useExchangeSocket("ticker", "default", cb, { category: "*" })   ← 通配品类
      → 帧到达：先写入 pending 缓冲（不 setState）
        → 未排程则 requestAnimationFrame 排一次 flush
          → flush：逐条 tickerToSymbolInfo；price/change24hPercent/volume24h 全等 → 跳过不写入
            → 整批无变化 → setByKey(prev) ← 引用不变，App 不重渲染
  → dedupeSymbols(byKey)：同 instId 多品类按 CATEGORY_PRIORITY 收敛为 1 条，按 id 字典序输出
  → priceMap（instId → 数字价）← 下游：警报 evaluateAlerts 只读这份
```

### 3. 断线重连

```
sock.onclose（有活跃订阅且非手动 close）
  → status("reconnecting") → setTimeout(open, min(500*retry, 5000))
  → onopen：for (entry of this.series.values()) sendOp("subscribe", …)   ← 整体重订阅一次
  → replay 期间更旧的桶被单调守卫丢弃，且不推进 last 水位
  → status("live")；手动 close 路径必须显式 close()，否则测试/卸载残留重连中的 socket
```

> 图表实例生命周期与叠加层绘制不在本层（见 `frontend_src_chart.md` §实例与生命周期）；本层只保证"进入图表实例之前"的数据是对的。

## 实现约束清单（逐条核对）

### A. 周期标识符（时间级别体系）

- **[未知周期必须抛错] `periodFromTimeframe` 先查 `NATIVE_TIMEFRAMES`，未命中 → `throw`；再走正则 `^(\d+)([smhdw]|mo)$`，不匹配 → throw；unit switch 的 default 也 throw。`periodToTimeframe` 对未知 `timespan` 同样 throw。禁止任何"回退成默认级别"。由来：一个回退就把另一个周期的 OHLC 画成"看起来正常"的图。**（来源: frontend/src/api/datafeed.ts:63-125 注释「rather than silently falling back … surfaced instead of showing wrong-series data」+ openspec/timeframe-identifier-scheme）
- **[月级用 `mo`] `Period{timespan:"month"}` 必须映射为 `${multiplier}mo`；解析时先 `trim().toLowerCase()`（`normalizeTimeframe`），不折叠其它字符。由来：大小写无关比较下 `1M`（月）与 `1m`（分钟）必然冲突。**（来源: `api/datafeed.ts:57-59` 注释 + openspec/timeframe-identifier-scheme）
- **[秒级 realtime-only] `isRealtimeOnlyTimeframe("1s")===true`：`getHistoryKLineData` 与 `prefetchDeeper` 都必须直接返回空/不预取，秒级图面只能由 WS 缓冲喂。**（来源: openspec/timeframe-identifier-scheme + `api/datafeed.ts:206-210,270-272`）
- **[白名单必须同步后端] 前后端两份白名单：`NATIVE_TIMEFRAMES` 与 `DL_TIMEFRAMES`（`components/views/agent/BacktestControls.tsx` 注释显式声明「mirrors backend models.VALID_TIMEFRAMES」）。前端单边新增级别会在 `/candles`、`/backtest` 上直接失败。**

### B. 实时 candle 守卫（三段，顺序不可颠倒）

```
deliver(symbol, category, timeframe, candle):            # api/bitgetWs.ts:161
  for (entry of this.series.values()):
    ① if (s.symbol !== symbol || s.category !== category || s.timeframe !== timeframe) continue   # 身份路由
    ② if (entry.last && sameCandle(entry.last, candle)) continue                                   # 相同不重复投递
    ③ if (entry.last && candle.open_time < entry.last.open_time) continue                           # 旧桶不回退
    entry.last = candle; 广播给该 entry 的 listeners
```

- **① 身份**：匹配必须同时含 `symbol`+`category`+`timeframe`；上游帧缺 `symbol`/`category` 时直接 return，**不得用 `DEFAULT_CATEGORY` 猜品类**（猜错会把 4h 的 bar 投给 1h 的订阅者）。（来源: frontend/src/api/bitgetWs.ts:139 anti_pattern `must_not`「must not guess」）
- **② 相同不重复**：`sameCandle` 比较 open/high/low/close/volume 全等。由来：重连与低频快照会重复携带同一根 bar，静默市场里同一根 bar 会不断到达，不去重会让每根蜡烛都触发整图重绘。
- **③ 单调性**：`open_time` 严格小于已投递水位即丢弃。由来：同一订阅混有低频快照（可能更旧）与事件驱动增量，不过滤会打乱时间序列。**水位 `last` 只能被真正投递过的帧推进**——若在重放的旧帧上提前推进，之后第一个合法新桶会被误丢弃，图表从此再也不动（该规则有用例守护：`api/bitgetWs.test.ts:292` anti_pattern `must_not`「out-of-order frame must not append」）。
- **每 series 独立水位**：状态挂在 `SeriesEntry.last` 上、按 `category:symbol:timeframe` 分桶，禁止跨周期共享（否则切周期互相污染）。**注意**：同 symbol 多周期共存时 `series.size` 会大于订阅数，退订必须按 listener 逐个移除，不能整键 delete。（来源: openspec/specs/ws-series-routing/spec.md §完整 series 订阅路由）
- **[切换 series 不误判] series 切换后水位独立起算：新 series 首帧即使 `open_time` 早于旧 series 的最后水位也必须正常投递，MUST NOT 因沿用旧时间戳而误判为 stale 丢掉合法帧。**（来源: openspec/specs/kline-realtime-order-guard/spec.md §切换 series 不误判）
- **[同桶替换 / 新桶追加] `open_time` 相等且 OHLCV 有变必须投递（图表替换最后一根），更大才追加；只有"相等且五字段全等"才丢弃。只比 `open_time` 的去重会把真变化当重复丢掉，表现为末根蜡烛不再刷新。**（来源: openspec/specs/kline-realtime-order-guard/spec.md §同桶刷新按替换处理 + `api/bitgetWs.ts:165` `sameCandle`）
- **[保序只管实时路径] 单调守卫 MUST NOT 施加到历史加载与左向回填：回填返回的 bar 全部早于当前尾部，必须正常 prepend。因此水位只由实时投递路径（`deliver`）维护，`earliest`/`noteEarliest`（历史）是另一套状态，两者不得合并。**（来源: openspec/specs/kline-realtime-order-guard/spec.md §保序不影响历史与回填路径）
- **[无数据帧 ≠ 拆连接] 帧缺 `data.last_candle`（含 `{"error":"no data"}`）时整帧不投递，但 MUST NOT 因此关连接、清图或进入错误态；parquet 为空而实时流有 bar 时后端仍会带 `last_candle`，不得当无效数据丢弃。**（来源: openspec/specs/realtime-ws/spec.md §K 线更新实时流优先 + `api/bitgetWs.ts:136-142`）
- **同一 key 只登记一次下游订阅 + 断连重连一次性重订阅**；重复调用 `subscribe(s,cb)` 只加监听器（`if (!entry)` 才 `sendOp`），这是防止订阅风暴的关键形状。
- **`onmessage` 必须按 `channel` 过滤**（`frame.channel !== "candle"` 直接 return），否则新增频道会误入 candle 分派。

### C. 品种目录与精度

- **[精度取自 instrument，缺字段才兜底] 必须用回退链：价格 `pricePrecision → pricePlace → 2`；数量 `quantityPrecision → volumePlace → 4`。只有目录里查不到该 instId 时才允许 `resolveSymbolInfo` 的兜底。**（来源: frontend/src/api/datafeed.ts:113-118 与 :380-383 注释「Precisions come from the instrument, not a hardcoded default; the default is only used when the symbol is unknown to the hub」+ anti_pattern `only_use`）
- **[下架品种不得出现在搜索里] `searchSymbols` 必须过滤 `symbolStatus !== "online"`，并只返回前 100 条（排序按 symbol 字典序稳定）。**（来源: `api/datafeed.ts:196-201`）
- **[品种检索只有一个入口] `BitgetDatafeed.searchSymbols` 是全模块唯一的品种检索路径（图表原生搜索框、顶栏、命令面板都只能走它，且都是 `/instruments` 驱动）。同一 `instId` 存在于多品类时必须以 `category:instId` 作为相互独立的可选项，不得"取首个匹配"——取首个等于把品类选择权交给目录顺序。**（来源: openspec/specs/market-symbol-search/spec.md §全市场符号检索 + openspec/specs/symbol-search-modal/spec.md）
- **目录缓存只允许本层持有，但必须保留 `loadInstruments(force=true)` 手动失效路径**：上架/精度变更后要能立即拉到新目录；新面板需要品种信息必须走 `resolveSymbolInfo()` / `useInstruments`，不得各拉一份。
- **[离线不得清空] `instruments` 请求失败时必须返回上次结果——宁可展示旧数据也不要把用户已看到的品种列表抹掉。**

### D. 回填（backfill）纪律

- **[首次加载不得触发回灌] 只有 `prevEarliest != null && from < prevEarliest && !exhausted` 才发回灌；首次（`prevEarliest == null`）只播种近端。由来：首次就是"从很早开始"，再触发回灌等于每次打开图表都全量拉一遍历史。**（来源: frontend/src/api/datafeed.ts:213-218 注释「the very first load always asks for the deep past and must not trigger a server-side fetch」）
- **[exhausted 按 seriesKey 记忆] `earliest_reached` → `exhausted.add(category:symbol:timeframe)`，此后 fetch/预取都跳过。MUST NOT 只按 symbol 记录，否则一个周期到顶会关掉其它周期。**（来源: `api/datafeed.ts:312-314,361-376`）
- **in-flight 去重**：同一 `seriesKey:分钟级 before 游标` 的并发请求必须共享一个 Promise（`inflight` Map，`finally` 删除）。否则拖动一下就发出多次相同 POST，把触发交易所频控的风险推给后端。
- **回灌节流 5s**（`lastPrefetchAt`）。
- **回灌失败不得阻断渲染**：`backfill().catch(() => {})`——把异常抛给 vendor 的加载链路会让图表空白；MUST NOT 改 `fetchStored` 的契约使其返回 null 以外的东西。
- **[后向加载的返回值形状归图表层]** 本子文档负责取数与回灌节奏；"返回给 vendor 的列表必须 `<= to`、到顶或回灌失败时返回 `[]`"属于图表注入契约，见 `frontend_src_chart.md` §后向加载方向性（`normalizeBackwardList`）。
- **[仅认后端的到顶信号] `exhausted` 只能由后端回带的 `earliest_reached=true` 置位。不得因为"这次返回条数少于 limit""某个渠道返回空页"就自行认定到顶——交易所的渠道深度上限与交易所真实最早历史是两件事（后端要等可无限回溯的 v3 通道对最旧窗口空页并重试一次后才下这个结论）。**（来源: openspec/specs/v3-history-channel/spec.md §深度上限与 earliest_reached 解耦）
- **[频控前提：去重与节流不是冗余] 深回灌受交易所约束（单次 ≤100 根、单次区间 ≤90 天、约 20 req/s）。本层的 in-flight 去重（`seriesKey:before` 共享 Promise）+ 5s 预取节流 + 只按 `seriesKey` 记忆 exhausted，是把频控挡在后端之前的前置条件；去掉任何一层都会以"回灌成批 429 → 图表永久停在缺数据处"的形式回报。**（来源: openspec/specs/v3-history-channel/spec.md）

### E. snapshot vs update

- **[update 帧字段收敛] candle `action:"update"` 帧只携带 `last_candle` 与 `price`（约 1s 节流）；指标与 Top-N S/R 只出现在 `snapshot` 帧及约 5s 一次的低频快照。因此"让图上指标更实时"的需求不得靠给 update 帧塞重算字段解决——后端实时路径禁止读 parquet / 算指标（会阻塞事件循环，所有 series 一起变慢），只能走 snapshot 通道或调低频快照节拍。**（来源: openspec/specs/realtime-candle-push/spec.md §更新帧内容收敛）
- **[控制帧不得进数据分派] `subscribed` / `unsubscribed` / `pong` 是控制帧：消费端必须以 `frame.action ∈ {"snapshot","update"}` 为闸门（现状：`useOrderBook.ts:111`、`useTickerList.ts:111`、`useRealSymbols.ts:110` 各有该行）。拿掉闸门后确认帧会带 `data: undefined` 进入分派，表现是"刚订完，盘口/自选就变空"。**（来源: openspec/specs/ws-series-routing/spec.md + 上述源码行）
- **[通配不能改成精确匹配] `ticker/default`（或 `*`）的帧按 channel+category 投递，不要求 symbol 相等；后端约每 5s 推一次全市场增量。把通配按精确订阅处理会让行情退化为"只有首次 REST 快照、价格永不更新"，并诱使后人把 20s REST 轮询加回来。反过来，精确订阅（`symbol=BTCUSDT`）仍必须只收该 symbol 的帧。**（来源: openspec/specs/realtime-ws/spec.md §通配频道周期增量 + openspec/specs/ui-live-data-sync/spec.md §通配 ticker 增量订阅）

- **books：`action==="snapshot"` 整盘替换（丢弃前一状态），其后 `action==="update"` 走增量 merge；`EMPTY_BOOK` 在 symbol/category/seriesKey 变化时先重置。由来：切 symbol 后残留上一品种档位会让交易员按错深度。**（来源: openspec/exchange-data-hub + `hooks/useOrderBook.ts:49`）
- **books 增量 merge 必须把 size 为 0 的价位当删除（否则删档不生效，深度只增不减）。**
- **[节流比较基准 = 当前 symbol 的完整盘口] 切 symbol 必须先重置再比较：用旧 symbol 的盘口参与"有无变化"判定，会误判"无变化"而永久停止更新，并让旧价位残留在面板上。价差显示取真实 `best ask − best bid`（`useOrderBook.ts:79,95`），任一侧为空则为 `null` → 面板渲染 `--`，禁止硬编码占位值。**（来源: openspec/specs/ui-live-data-sync/spec.md §高频数据渲染节流 + openspec/specs/orderbook-symbol-sync/spec.md §切换时立即清空 / §价差显示真实数据）
- **trade / funding / mark-price：snapshot 与 update 都是**按 instId 覆盖**语义；trade 列表 `MAX_TRADES=50` 环形裁剪，且快照到达要**整体替换**。**
- **ticker：update 增量覆盖 + `lastPr === "0"` 也算有效价**（`useTickerList.priceMap` 的显式分支），MUST NOT 用 `if (v)` 判有效。（来源: `hooks/useTickerList.ts:90-92`）
- **[列表为空的两种含义必须可区分] `count === 0`（数据源确认没有）与 fetch 抛错（未知）不同；上层据此决定显示"暂无"还是保留旧值。** 这是后端 `markets-overview-real-data`「区分空与未知」在前端的对应面。（来源: openspec/markets-overview-real-data + `hooks/useMarketOverview.ts:3-8` 注释 `data?: T` 的 undefined-vs-0 语义）

### F. 中文品类只进展示层

- `CATEGORY_LABELS` / `categoryLabel()` 只用于换文字；**请求参数、`symbolKey`、缓存 key、React key 一律使用原始 `SPOT` / `USDT-FUTURES`**。未知品类 `categoryLabel` 原样返回（不抛错）。（来源: frontend/src/api/types.ts:291,299 anti_pattern `must_not`「仅用于展示，不得用于路由/键」+ openspec/category-labels）

### G. symbol 唯一性与跨品类

- **`SymbolInfo.id` 只放 instId；跨品类唯一性由 `category:instId` 承载**（`symbolKey` / `instrumentKey`）。列表需要按 instId 收敛时只用 `dedupeSymbols` + `CATEGORY_PRIORITY`。**新接入品类（USDC-FUTURES 等）必须显式补优先级，否则并列时结果依赖迭代顺序，同花名品种可能今天显示合约价、明天显示现货价。**（来源: openspec/symbol-list-unique-ids）
- **`change24hPercent` 需要判幅归一**：`pct > 100 ? pct/100 : pct`（`tickerToSymbolInfo`），因为不同镜像对百分比/小数两种约定都出现过。改动它必须同时核对 `ScreenerPanel` 的列语义。
- **24h 字段必须做兜底链**：价格 `lastPr||n`、24h 涨跌额 `change24h||open24h`、成交额 `volume24h` 无值显示占位，不显示 0。（来源: openspec/exchange-data-hub（行情镜像）+ `useTickerList.sortValue`）

### H. 通用纪律

- **[禁止无界缓存] 本层所有 Map/Set 都以 series 为界并随 unsubscribe 释放（`subscriptions`/`series`/`earliest`/`exhausted`/`lastPrefetchAt`/`inflight`）。禁止无上限增长**（同品种多周期、反复切换会持续累积而 OOM）。
- **[高频帧合并成一次提交] 行情类 hooks 一律批处理 + "只有真变化才产生新引用"（`useRealSymbols` 的 rAF pending 缓冲、`useTickerList` 的 `changed` 标记）。由来：全市场 ticker 批量推送，逐帧 setState 会让整棵 React 树跟着抖。**（来源: `hooks/useRealSymbols.ts:118-163`）
- **[禁止把 REST 轮询当实时] 蜡烛实时只允许来自 `bitgetWs`；行情镜像只允许来自 `/ws`。全模块唯一保留的轮询是 App 的 20s 警报兜底 `api.tickers()`。**（来源: AGENTS.md L2 `test_live_ws` 契约 + `chart-shell-integrity`「单一 candle 源」）
- **[listener 不得反噬客户端] 分发循环必须对单个回调 try/catch（`api/bitgetWs.ts:103,178`、`hooks/useExchangeSocket.ts:114`、`lib/alertsStore.ts:75`、`lib/toastStore.ts:33`、`lib/periodsStore.ts:78`）。由来：一个坏订阅者不能拖垮共享 socket / store，也不能反过来让某个 UI 永远等不到更新。**
- **[订阅生命周期] hooks 必须在 cleanup 退订，`exchangeSocket.teardown()` 与 `bitgetWs` 的手工 close 路径为测试而存，不得删。**
- **[主动关闭不重连] 重连只在"非手动 close 且仍有活跃订阅"时发生（`bitgetWs` 的 `manualClose` 守卫、`ExchangeSocket` 的 `active.size > 0` 守卫）；`useExchangeSocket` 要退订到 0 个 listener 才发 `unsubscribe`。由来：切 symbol / 组件卸载引发的关闭若再重连，会留下"无人监听却持续重连"的 socket（测试残留 + 重连风暴）。退避是 `min(500*retry, 5000)`（递增且有上限），不是固定 500ms。**（来源: openspec/specs/kline-stream-resilience/spec.md §主动关闭不触发重连 / §指数退避重连 + `api/bitgetWs.ts:144-153`）
- **[连接状态可观测] `bitgetWs.onStatus()` 暴露 `live | reconnecting | closed` 三态，是状态栏与告警标识的唯一来源；重连成功并重新收到数据必须回到 `live` 并清除告警态。新增"连接是否正常"的 UI 不得自己 `setInterval` 探活，必须订阅这一流。**（来源: openspec/specs/kline-stream-resilience/spec.md §连接状态上报）
- **[重复订阅必须幂等] 同一 key 的第二次 `subscribe` 只加监听器、不再发第二份 `subscribe` 帧（`if (!entry)` 才 `sendOp`）；后端对同一连接的重复订阅也只加一次上游引用计数。任一端丢掉这个幂等都会造成上游订阅计数泄漏 → 品种越切越多、上游频控被打爆。**（来源: openspec/specs/kline-stream-resilience/spec.md §重复订阅幂等 + openspec/specs/realtime-ws/spec.md）
- **[去重键用完整价格] `sameCandle` 之类去重比较必须覆盖全部显示字段。由来：只比 open_time 会把真正的 OHLCV 变更当重复丢弃；反过来字段漏比会让新值丢失。**
- **[禁止把中文展示串当语义判据] 例如用中文品类字符串判断品类、用 display name 去重。**

### 设计决策

| 决策点 | 选定方案 | 替代方案 | 理由 |
|--------|---------|---------|------|
| series 历史来源 | 后端 `/candles` + `/candles/recent` + `POST /candles/backfill` | 前端直连交易所 REST | 后端已有持久化与频控，前端不持交易所密钥；缺口由后端补，职责清楚 |
| 实时图表通路 | `api/bitgetWs.ts` 单 socket + 按 series 键扇出 | 每图表一 socket / 快照轮询 | 消除跨订阅串扰、控制连接数、让"不重复投递"可断言 |
| 品种元数据 | 运行时从 `/instruments` 解析（60s TTL + force 刷新） | 硬编码精度表 | 目录随交易所变化，硬编码必然过期；但**兜底默认值必须保留**，否则目录没该品种时整个图表不可用 |
| 快照重放处理 | 在投递层做序列守卫（三段），不在 UI 层 | UI 自己判重/过滤 | 守卫只能有一处，落在 UI 会每个面板各写一套且必漏一个 |
| 行情镜像收敛 | instId 单值 + 显式优先级 + 复合键并存 | 全用复合键 | 展示层要 instId 简洁（价格、键），而缓存/搜索需要 category 区分；两层各司其职 |

## 变更风险（改这里会破坏什么）

| 改动 | 破坏的规则 | 后果表现 |
|---|---|---|
| 新增周期但后端未同步 `VALID_TIMEFRAMES` | 周期双向映射严格 | 图表 throw 冒泡到 vendor 加载链 → 白屏（比显示错数据好，但体验是崩） |
| 放宽 `NATIVE_TIMEFRAMES` / 去掉 throw | 未知周期不得降级回退 | 图表把另一周期数据当本周期展示且无任何报错——最坏结果 |
| 调整 `deliver()` 三段顺序 / 去掉相同帧判定 | 单调性 + 相同不重复 | 每根蜡烛都触发重绘（CPU 抖动），或更旧帧被追加成新 bar |
| 重连 replay 时推进 `last` 水位 | 只投递合法帧 | 重连后第一个真 update 被误丢，图看似正常却永远停在旧时刻 |
| 跨周期共享 `last`/`earliest`/`exhausted` | series 状态隔离 | 切秒级/周线后互相污染：水位串、历史再也拉不到更早 |
| `mergeLiveTail` 改成只拼尾巴 | 全量合并 | 存储有中间缺口时图表仍断线，用户看到"忽然跳到未来" |
| books 的 update 当 snapshot（或反之） | reset vs merge | 切 symbol 后档位残留 / 深度不再更新 |
| `symbolKey` 去掉 category | 唯一键语义 | 同 instId 跨品类互相覆盖；React key 重复；请求打错品类 |
| hooks 里新增 `new WebSocket(...)` | 单一共享 socket | 订阅风暴 + 绕开全部三段守卫（正是 `chart-shell-integrity` 禁的"第二个入口"） |
| 用 `CATEGORY_LABELS` 的值参与路由 | 品类翻译只作用于展示 | 立即表现为 WS category / `/candles` 无数据（行情不动） |
| 拿掉 `frame.action` 闸门 | 控制帧不是数据 | 确认帧以 `data: undefined` 进分派 → 刚订阅完盘口/自选就变空 |
| 把通配订阅改成 symbol 精确匹配 | 通配增量投递 | 行情退化成一次性快照，价格永不更新（还会诱发把 REST 轮询加回来） |
| 前端自行判定"到顶"（见空页/短页就置 exhausted） | `earliest_reached` 由后端权威判定 | 历史只拖到一半就再也出不来更早数据，刷新前无法恢复 |
| 去掉 5s 预取节流或 in-flight 去重 | 交易所频控前置约束（≤100 根 / ≤90 天 / 20 req/s） | 拖动一下并发相同 POST → 后端 429 → 回灌整体失效，图表停在缺数据处 |
| 把单调守卫也施加到历史/回填路径 | 守卫只作用于实时投递 | 左拖加载更早历史被全部丢弃，看起来"这个周期没有历史" |
| 给 `update` 帧塞指标 / S-R | 实时路径不重算 | 后端事件循环阻塞，所有 series 的实时推送一起变慢甚至断流 |
| 手动 close（切品种/卸载）后仍重连 | 主动关闭不重连 | 残留"重连中"的 socket，测试与真机都出现幽灵订阅 |

## 术语对照（需求语言 → 代码）

| 需求/口语 | 代码里的名字 | 位置 |
|---|---|---|
| K 线取数 / 历史回填 | `BitgetDatafeed`（`fetchStored` / `backfill` / `prefetchDeeper` / `mergeLiveTail`） | `api/datafeed.ts` |
| 蜡烛实时通道 | `BitgetWsClient` 单例 `bitgetWs` | `api/bitgetWs.ts` |
| 通用行情通道（ticker/books/trade/…） | `ExchangeSocket` 单例 `exchangeSocket` + 薄壳 hook `useExchangeSocket` | `hooks/useExchangeSocket.ts` |
| 旧快照通道（URL 参数式） | `connectSnapshot` | `api/ws.ts` |
| 全市场列表 | `useTickerList`（key `category:instId`）/ 自选与价格图 `useRealSymbols` | `hooks/*` |
| 品种精度 | `resolveSymbolInfo` / `instrumentToSymbolInfo` / `useInstruments` | `api/datafeed.ts`、`hooks/useInstruments.ts` |
| 盘口 | `useOrderBook` + `EMPTY_BOOK` | `hooks/useOrderBook.ts` |
| 成交流水 | `useTrades`（`MAX_TRADES`） | `hooks/useTrades.ts` |
| 资金费率 / 标记价 | `useDerivative` | `hooks/useDerivative.ts` |
| BlockBeats 宏观/链上镜像 | `useMarketOverview` + `NETFLOW_NETWORK_OPTIONS` + `SectionState<T>{data?}` | `hooks/useMarketOverview.ts` |
| OHLCV → KLineData 换算 | `candleToKLine` / `candlesToKLine` | `lib/transform.ts` |
| 实时性离线排查 | `npm run diagnose:kline` → `frontend/scripts/diagnose-kline-realtime.mjs` | 模块外脚本 |

## 文件组成与覆盖（本子文档负责的文件）

| 组 | 文件（相对 `frontend/src/`） |
|---|---|
| REST 客户端 | `api/client.ts`（`BASE="/api"`、`ApiError`、`request<T>`、`qs()`、单一 `api` 对象上约 40 个端点方法）、`api/types.ts`（所有响应体类型 + `MARKET_CATEGORIES` + `CATEGORY_LABELS`/`categoryLabel`） |
| WS 通道 | `api/bitgetWs.ts`（candle 专用单例 + 三段守卫）、`hooks/useExchangeSocket.ts`（通用频道 `exchangeSocket` + `useExchangeSocket` hook）、`api/ws.ts`（旧快照通道 `connectSnapshot`） |
| datafeed | `api/datafeed.ts`（`periodToTimeframe`/`periodFromTimeframe`/`normalizeTimeframe`/`isRealtimeOnlyTimeframe`/`normalizeBackwardList`/`BitgetDatafeed`/`resolveSymbolInfo`/instruments 缓存） |
| hooks | `hooks/useCandles.ts`、`hooks/useTickerList.ts`、`hooks/useRealSymbols.ts`、`hooks/useOrderBook.ts`、`hooks/useTrades.ts`、`hooks/useDerivative.ts`、`hooks/useInstruments.ts` |
| 转换 | `lib/transform.ts`（`candleToKLine`/`candlesToKLine`/价格线→overlay / 趋势线→segment / 箱体→rect） |
| 测试 | `api/{client,datafeed,types,bitgetWs,ws}.test.ts`、`hooks/{useExchangeSocket,useRealSymbols,useTickerList,useOrderBook,useDerivative,useMarketOverview}.test.ts(x)`、`lib/transform.test.ts` |
