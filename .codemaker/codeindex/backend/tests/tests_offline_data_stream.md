---
type: "Fragment"
id: backend/tests/offline_data_stream
title: "全栈 E2E 测试门禁层 / 行情与实时流离线不变式"
description: "在不联网的单元层里，时间周期 token、Parquet 读写、回填分页、WS 帧路由与新闻代理各守住哪些不变式？"
parent: /backend/tests/_overview.md
fragment: offline_data_stream
entity_names:
  constants:
    - name: BASE（各离线文件通用种子时刻）
      value: "1700000000000"
      source: backend/tests/test_offline.py、test_store.py、test_ingestion_rest.py、test_dlquant.py、test_factors.py、test_analysis.py、test_orchestration.py
    - name: STEP（离线单元通用周期）
      value: "300000（5m）"
      source: backend/tests/test_offline.py、test_ingestion_rest.py、test_dlquant.py
    - name: DAY
      value: "86400000（Parquet 日分区裁剪用例用）"
      source: backend/tests/test_store.py
    - name: CAT / SPOT / SYM
      value: "\"USDT-FUTURES\" / \"SPOT\" / \"BTCUSDT\""
      source: backend/tests/test_realtime.py、test_streamhub.py
    - name: EXPECTED_ORDER（新闻分类固定顺序）
      value: "crypto, macro, policy, a-share, global-market, industry, company"
      source: backend/tests/test_newsfeed.py
    - name: PONG_FRAME
      value: "\"pong\"（WS 层心跳回帧，realtime 与 streamhub 各持一份）"
      source: backend/tests/test_realtime.py、test_streamhub.py（从 market_data 导入）
    - name: MAX_BARS_PER_SERIES
      value: "200（实时 candle 每 series 缓冲上限）"
      source: backend/tests/test_realtime.py
    - name: 周期 token 别名规则
      value: "1M 与 1mo 等价（月），1m 恒为分钟；1s 只有 granularity 无 step；15s/1y 等外部周期永不降级支持"
      source: backend/tests/test_models.py
    - name: v3 history-candles limit 上限
      value: "100（传入 500 也被截为 \"100\"）"
      source: backend/tests/test_ingestion_rest.py
retrieval_hints:
  - "为什么 1M（月）会被错当成 1m（分钟）？哪个用例在守这条？"
  - "实时 buffer、订阅引用计数、断线重放的语义分别由哪个用例锁定？"
  - "回填分页在什么情况下算『已到最早历史』？短页为什么不提前终止？"
  - "BlockBeats 代理的端点名与错误码语义（400 / 502）分别对应什么情况？"
  - "改动行情/实时模块时，离线单元层有哪些可复用的替身（fake client / fake ws / fake ak）？"
  - "本组用例也叫『离线单测』『offline 子集』，对应需求中的「不联网也必须全绿」"
  - "⚠️ 如果你要找 REST/WS 端点的**对外行为**（HTTP 层），不在这里，在 tests_webapi_contract.md 与 tests_l2_live.md"
  - "⚠️ 如果你要找缺口白名单与数据质量门禁，不在这里，在 tests_l1_integrity.md"
  - "⚠️ 如果你要找回测/风控/Agent 的不变式，不在这里，在 tests_offline_quant_trading.md"
  - "新增行情/实时层的离线用例请放进对应 test_<domain>.py，不要为单个函数新建文件"
architectural_role: "离线单元层（数据域）；以替身隔离外部依赖，冻结时间/存储/流三条链路的语义"
---

## 覆盖文件与对应不变式（12 个源文件）

| 文件 | 锁定的业务不变式 |
|------|-----------------|
| `test_models.py` | timeframe token 的大小写不敏感归一；**月 `1M`/`1mo` 与分钟 `1m` 永不折叠**；`1s` 有 granularity 但无 step；非原生日等级别（`15s`/`1y`）必须抛错而非降级；现货长格式 `1min/1day/1week` |
| `test_store.py` | Parquet 读按日分区裁剪、`limit` 反向累计取最近 N 根、读缓存命中不触磁盘、`save`/`delete` 必须使缓存失效 |
| `test_ingestion_rest.py` | v2/v3 分页参数拼装、`limit` 上限 100、429/限流文案 → `V2RestError`、重试空页后才算 `earliest_reached`、并行窗口合并去重、默认 fetcher 是 v3 |
| `test_offline.py` | MCP 通道的分页/归一/日分区去重、增量只补缺口不产生重复、缺根探测、Excel 单日导出 + 批量追加、node 缺失报错、重连后重试一次、调度任务失败隔离、REST 增量调度注册 |
| `test_realtime.py` | 订阅通道拼装与 interval token、按 `arg.channel` 路由到正确 series（月/秒）、buffer 语义（覆盖同 open_time、乱序插入排序、按容量裁剪）、listener 通知规则（变则通知、未变不通知、移除后不再通知）、ping/pong、重连重订阅、动态订阅/退订与 refcount |
| `test_streamhub.py` | `RefCountSubscription` 的 acquire/release 与 per-category 隔离、订单簿 seq 断档触发重订阅、ticker/trades/mark/funding 镜像、per-series 缓存隔离、异常帧不得关闭连接、`_on_ping` 三形态、退订清缓存、多类别合并与过滤 |
| `test_blockbeats.py` | 数据代理的 `network` 参数传递（DXY 必须 `us`）、端点名与上游对齐（旧名 → 400）、未知端点 400、上游异常 → 502、newsflash 白名单转发与 `create_time` 归一 |
| `test_blockbeats_cache.py` | 「无参端点不得串到有参端点的缓存文件」、缓存路径解析、缓存命中优先、缺失/损坏时回落实时、刷新时逐端点失败隔离且保留旧缓存 |
| `test_news_broker.py` | 轮询循环不启线程、buffer 环形上限、按类别过滤、单源失败隔离、退避跳过失败源、snapshot 有界 newest-first |
| `test_newsfeed.py` | 四个源适配器用假 `ak` 对象驱动：标准化、按规则优先级分类、fallback 分类、id 稳定性、`fetch_all` 的失败隔离；分类顺序固定 |
| `test_chartstore.py` | 图表配置按 series 隔离、跨进程实例持久化、`pane` 非法拒绝、`MAX_DRAWINGS_PER_SERIES` 上限拒绝 |
| `test_events.py` | 有界 JSONL 事件日志：追加/列出、溢出逐出最旧、按 kind 过滤、`limit` 取最新、损坏行跳过 |

## 对外接口（替身契约——离线层唯一的「接口」）

> 这些替身必须与生产接口**同形**；替身漂移 = 测试通过但生产坏。

| 替身 | 伪装的生产对象 | 必须实现的方法 | 入口符号 |
|------|---------------|---------------|---------|
| `FakeClient` | `McpDataClient`（Node 子进程 JSON-RPC） | `call_tool(name, args)`（按 `from/to` 返回分页 bar）、`close()`（返回 `{"closed": True}`）、`start()` 缺 node 时抛错 | `test_offline.py` |
| `KlineIngestor.backfill_before_rest(..., fetch_page=..., max_retries=2, backoff_base=0.1, page_delay=0.0, sleep=...)` | 真实 REST 分页拉取 | 注入 fetch_page 抛 `V2RestError("rate limit: 429")` 验证重试，并用 `sleep=` 回调记录退避次数 | `test_rest_backfill_rate_limit_retries_then_succeeds` |
| `_FakeWs` + `websockets.connect` 桩 | Bitget WS 服务端 | `send(text)`（记录回帧）、`closed` 标志 | `test_realtime.py`、`test_streamhub.py` |
| `asyncio.sleep` 桩 | 退避与节流 | 记录调用次数与实参（断言「确实睡过」） | `test_ingestion_rest.py`、`test_live_api` 风格用例 |
| `_FakeAK` | `akshare` 模块 | 四个源函数返回 `DataFrame`（列名对齐真实上游） | `test_newsfeed.py` |
| `blockbeats._get` monkeypatch | BlockBeats 上游 | 返回 `{"status": 0, "data": ...}` 或抛异常（走 502 分支） | `test_blockbeats.py` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src`（market_data.store / models / config） | 时间轴归一与分区读写的被断言对象 | `ParquetStore.save`、`ParquetStore.read`（LRU 缓存 `_read_cached`）、`timeframe_step_ms` | extracted |
| `backend/src`（ingestion / mcp_client） | v2/v3 历史拉取与 MCP 通道 | `KlineIngestor`、`V2RestError`（限流以 `"rate limit"` 文案携带）、`McpError` | extracted |
| `backend/src`（realtime / streamhub） | WS 帧路由与扇出 | `BitgetWsStream`、`MarketStream`、`RefCountSubscription` | extracted |
| `backend/src`（blockbeats / blockbeats_cache / newsfeed / news_broker） | 新闻与数据代理 | `_get`、`path_for`、`_data_filename`、`CATEGORY_RULES`、`build_item` | extracted |
| `backend/src`（chartstore / events / excel_export） | 图表配置、事件日志、Excel 输出 | `ChartStore`、`EventLog`、`export_frame`、`ExcelAppender` | extracted |
| `backend/data/parquet`（真实数据目录） | **不使用**：全部落 `tempfile.TemporaryDirectory()` | — | extracted |

> 反向依赖（谁依赖本子模块的结论）：

| 调用方 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `tests_webapi_contract` / `tests_l2_live` | Web 层断言依赖这些底层语义成立（如 timeframe 归一、buffer 排序、refcount） | 各底层符号 |
| `frontend/src` 图表 | 周期按钮集合与 token 归一必须与 `test_models.py` 冻结的表一致，否则 5s/1M 类切换会静默错位 | `timeframe_to_granularity` |
| `backend/scripts` | 回填脚本复用同一批分页/分类语义；此处语义变动必须同步脚本 | `KlineIngestor._fetch_v3_history_page` |

## 典型调用链

### 回填分页（REST 主路径）
```
KlineIngestor.backfill_before_rest(series, BASE, fetch_page=fake, max_pages, parallel)
  → 游标链（window = min(90d, max_pages * step)）        ← 本模块入口
    → fetch_page(cat, sym, granularity, end_ms, limit)     ← 跨模块：market_data.ingestion
      → 空页 → 重试一次；仍空才判 earliest_reached=True
      → 短页（页数 < limit）不得提前终止（上游偶发短页）
        → 并行分支：按游标预计算窗口并发取页 → 合并 → ParquetStore.save（open_time 去重）
          → 断言 appended 计数与结果严格连续无重复
```

### 实时帧路由（1M vs 1m）
```
stream._handle_frame(_FakeWs(), frame_json)               ← 本模块入口
  → 解析 arg.channel（"candle1M"）
    → 归一为 series timeframe "1mo"                        ← 跨模块：models 的 token 规则
      → 仅 "1mo" 的 listener 收到（"1m" listener 必须为空）
        → buffer 内同 open_time 覆盖、乱序插入保持升序、超 MAX_BARS_PER_SERIES=200 逐出最旧
```

### 订阅引用计数与退订
```
streamhub.subscribe(channel, symbol, category)
  → RefCountSubscription.acquire()                        ← 本模块入口
    → 同 channel 第二个订阅者不重复向交易所发 subscribe（refcount=2）
      → 首个 unsubscribe → release → refcount=1，仍保留镜像
        → 最后一个 release → 发送 unsubscribe + 清 per-series 缓存（无孤儿状态）
```

## 实现约束清单

> 实现本组用例（或被这些用例守护的功能）时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| 周期 token 折叠表 | 见 `test_models.py` 的全量 native 集合 | `test_models.py` | 月/分钟二义性的唯一防线：`timeframe_step_ms("1M") == timeframe_step_ms("1mo")`，而 `timeframe_to_granularity("1m") == "1m"` | 历史上 `1M` 一度被折叠成分钟，导致 WS 帧路由与周期栏错位 |
| `1s` 的 step | **无**（`timeframe_step_ms("1s")` 抛 `ValueError`），但 `timeframe_to_granularity("1s") == "1s"` | `test_models.py` | 秒级只走实时流、不进 Parquet 聚合链路 | 需求 `realtime-only-timeframe`；L1 门禁也不该被秒级 series 参数化 |
| 非原生日等级别 | `15s`、`1y` → `ValueError` | `test_models.py` | **禁止**「静默降级到邻近支持级别」的宽容兜底 | 需求明确要求未支持级别不得被悄悄支持（否则图表显示周期与实际数据周期不符） |
| v3 `limit` | 上游硬上限 `100` | `test_ingestion_rest.py` | 即便配置 `rest_candle_page_limit=500`，v3 页也必须截为 100 | 上游契约；不截会拿到非预期空页且浪费配额 |
| `MAX_BARS_PER_SERIES` | `200` | `test_realtime.py` | 实时 buffer 上限，超出逐出最旧 | 内存上限与「最近 N 根」响应尺寸契约 |
| `MAX_DRAWINGS_PER_SERIES` | `100` | `test_chartstore.py` | 图表手绘线/段上限（101 条 → 拒绝） | 防止配置文件膨胀导致读放大 |
| `EXPECTED_ORDER` | 7 类固定序 | `test_newsfeed.py` | 分类顺序即 UI 顺序；`CATEGORY_RULES` 的首元素必须是 `crypto` | 与 news_broker/Web API 的 `categories[0] == "crypto"` 断言成对 |
| Parquet 日分区 | `DAY = 86_400_000` | `test_store.py` | 读裁剪以 UTC 日历日为粒度；`save` 合并去重以 `open_time` 为键 | L1 门禁与回填脚本都依赖同一分区语义 |

### 必须实现的函数（用例侧夹具与断言点）

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `_make_ingestor(tmp, page_limit)` | `test_ingestion_rest.py` | 构造 store + ingestor 并强制小页以触发分页；改分页策略时先改这里 |
| `fake_fetch(category, symbol, granularity, end_ms, limit)` | `test_ingestion_rest.py` | 以 `end_ms` 为游标反推区间，模拟「向前翻页」；必须严格按参数签名，否则并行窗口拼装失真 |
| `_stream(**kw)` | `test_realtime.py`、`test_streamhub.py` | 统一默认参数（url 指向不可达端口 + 注入 fetcher/心跳/重连间隔），确保任何用例都不会误触真网络 |
| `_update_frame` / `_book_row` | `test_realtime.py`、`test_streamhub.py` | 上游帧格式的唯一构造出口（字段全为字符串），新增通道必须复用 |
| `is_exempt` 风格的辅助查询 | （属 l1，见同模块 `tests_l1_integrity.md`） | 说明本组用例不处理缺口白名单 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 外部行情如何入测试 | 全量替身（假 MCP client / 假 fetch_page / 假 ws / 假 `ak`），零真网络 | 录制回放或真实在线 | 在线不可复现且 CI 禁用外网；录制回放的帧结构会随上游漂移而失真 |
| 「已到最早历史」的判据 | **空页 + 重试一次仍空**才置 `earliest_reached` | 短页/单页空即终止 | Bitget 偶发返回短页或瞬时单页空，终止得越早越容易漏历史 |
| 缓存键的文件粒度（BlockBeats） | 有参端点必须带参进文件名，无参端点不得复用有参文件（`_data_filename`/`path_for`） | 端点名一维缓存 | 同端名不同 `params` 会互相污染（DXY 多市场混淆） |
| listener 通知条件 | 值变化才通知（未变化不通知），且 `remove_listener` 后必须静默 | 每帧都通知 | 下游 WS 限流依赖「有变化」的前提；多余通知会造成 1/s 节流窗口被空帧占满 |
| 秒级周期在测试中的处理 | `1s` 只验 granularity 与帧路由，不验 step 与 Parquet | 一并纳入 step 断言 | 秒级无 `step_ms`，强加断言会逼出生产侧「假 step」的降级实现 |
| 引用计数粒度 | `(category, channel)` 二维 refcount | 全局 channel 计数 | 多类别（USDT-FUTURES/SPOT）共用一个 channel 时不得互相退订；退订泄漏会让上游订阅数无界增长 |

## 变更风险与边界约束

### 背景与权衡（为什么只能这样组织）

这一组文件是整条行情链路的「输入输出定义层」，它们共同面对一个业务风险：**外部上游的名字与粒度不是我们能决定的**。Bitget 用 `1M` 表示月而交易所习惯把 `m` 当分钟、`5m/15m/30m/4h/1d/1w` 在不同接口里各有自己的 token 拼法、现货与合约的历史接口又分别要 `1min` 与 `1m`。这类差异一旦在代码里靠「大小写归一后查表」偷懒实现，就会在某个具体组合上产生静默错位——最典型的就是把月线当分钟线缓存，前端切到 1M 时看到一堆错误的 bucket。于是本组用例的共同写法是：**把 token 的全部合法组合显式列举出来，把非法组合显式要求抛错**。「拒绝」比「接受」更重要：静默降级到邻近周期不会报错，只会在图上留下一个与实际数据不符的标签，用户无从察觉，这比失败更不可接受。

第二个共同风险是**分页与增量的终止条件由上游行为决定**。上游会短页（网络截断、窗口边界、限流），会偶发一个空页却仍有更早历史。于是「空页就终止」的直觉实现会留下看不见的历史断层——断层是 L1 以缺口的形式事后爆红、由人回填，还是在本层用一条用例判死，成本相差数个量级。所以本层把「什么时候才敢说已经到最早」写成显式契约：空页 + 重试后仍空；短页绝不作为终止理由。并行分片同理：窗口按 `page_limit * step` 预计算，相邻窗口重叠属正常，去重落在存储层（按 `open_time` 合并），因此**并行只影响吞吐，不得影响最终序列的连续与唯一**。

第三个风险是**共享的实时结构被误伤**。`BitgetWsStream` 与 `MarketStream` 是「扇出 + 订阅引用计数」型服务，最坏的两类故障是退订不干净（上游订阅数随用户操作无界增长，最终被限流而整个进程失去行情）和缓存串台（`SPOT` 与合约共用一个 key，行情互相覆盖导致用户在错误品种上看到别人价格）。所以本层的断言不是「功能能通」，而是**状态被清理干净**：listener 摘除、refcount 归零、per-series 缓存在重新订阅前为空。同理，`EventLog`/`blockbeats_cache`/`ChartStore` 的「容忍损坏、跳过坏行」也是一组相同取向的断言：单个坏记录绝不允许把读路径变成异常，因为那会让一次局部数据污染扩散成整页 5xx。

### 本组与相邻层的责任边界

本组不验证 HTTP 状态码与帧格式（那是 `tests_webapi_contract.md`），也不验证数据本身良否（那是 `tests_l1_integrity.md`）；它验证「外部世界的不规则输入经过解析、分页、缓存、扇出之后，内部状态仍是有序且可清理的」。替身（假 MCP client、假 ws、假 `ak`、假 fetch_page）是这一层的标准设施，新增替身时 MUST 与生产接口保持同形：签名漂移的替身会让测试通过而生产失败，是最隐蔽的假绿。



**变更风险（改这些用例或其守护的代码会破坏什么）**

- 把 `1M`/`1mo` 折叠规则改回「大小写不敏感即视为分钟」→ 前端周期栏（15m/30m/4H/1d/1w/**1M**）与 WS 帧路由会错位；`test_models`、`test_realtime` 两条链的用例是唯一的组合防线。
- 在 `timeframe_to_granularity` 上加「未知级别降级到最近支持级别」→ 用例红，但更重要的是图表标题显示 15s 而数据是 1m，属用户可见的数据正确性缺陷。
- 允许 BlockBeats 缓存按端点名一维落盘 → 不同 `network`/参数的数据互相覆盖；`test_blockbeats_cache.py` 的「无参端点排除有参端点」用例专门防这一退化。
- 修改 `_on_ping`/ping-pong 回帧或允许异常帧关闭连接 → 静默丢帧 + 连接 churn；上游周期性发 ping、文本 pong、JSON ping 三种形态，三者都必须在同一用例里覆盖。
- 让「短页即终止」或「空页即终止」的判据变化 → 历史回填提前截断，缺口由 L1 门禁以类型 B/C 的形式事后爆红，排查成本远高于在单测层守住。
- `save`/`delete` 若不再使读缓存失效 → `/candles` 与回填端点会返回陈旧窗口（用户在回填后看不到新数据）。

### 失败模式复盘（本组各自拦住哪一类事故）

- **周期折叠**：`1M` 被折叠成 `1m`（或反推时 `1M` 变成分钟）后的症状不是崩溃，而是「切到月线却看到分钟数据」「实时帧被写进错误的 buffer」，用户与图表都察觉不到。因此本组的写法是双向列举：正向 `timeframe_to_granularity`、反向 `granularity_to_timeframe`、以及 WS 帧路由（`candle1M` 只进 `1mo` listener，`1m` listener 必须为空），三条一起才封得死同一条规则。
- **静默降级支持**：给不支持的级别（`15s`/`1y`）加一层「就近取一个能用的」回退，会让所有上层判断（图表标号、回测时间步、`2*step` 的 L1 新鲜度阈值）都基于一个与实际数据不符的 step。MUST 抛错是本组最重要的拒绝断言。
- **短页/单空页提前终止**：回填一旦把「上游这次只给了一半」理解成「没有更早的了」，缺的那段会以缺口形式回到 L1（类型 B/C），由人工再走登记—回填—清空。**终止条件写错时，缺陷不会在本层出现，而会在另一层隔几天出现**，这是本组最贵的几条断言。
- **并行不去重**：并行窗口的相邻区间必然重叠；若合并改成追加，`open_time` 会出现重复，直接违反 L1 的「严格递增无重复」。本组因此必须断「合并后连续且无重复」，而不只是断「行数增加了」。
- **退订不干净**：listener 与 refcount 的泄漏不会让功能立刻坏，只会让上游订阅数随用户点击无界增长，最终触发限流而整个进程失去行情；或让已切走的 series 仍被写入缓冲。断言形态必须是「计数归零 + 缓存清空 + 旧 listener 不再被调用」，而非「不再看到画面」。
- **一坏俱坏**：事件日志里的一行损坏、一个源抓取抛错、一个缓存文件 JSON 坏掉，任一种都只该影响该条/该源。若读路径不跳过坏行、刷新不逐源隔离，一次局部污染就变成整页 5xx——本组的「容忍坏数据」断言就是这个意思。
- **通知不收敛**：实时流按帧广播而不比较值时，每秒几十次 update 会把下游全打满（Web 层的 1/s 节流也形同虚设）。「只在值变化时通知、`remove_listener` 后零通知」是扇出型服务必须自证的性质。

需要提醒的改动方向：本组用例几乎全部通过参数注入（`fetch_page`、`fetch_instruments`、`sleep`、假 ws、假 `ak`）达成离线确定性。若某个新依赖无法注入，正确做法是给生产函数补注入点，而不是**在本组里放宽断言**或去起真实上游（那是 L2/`online` 的职责）。

### 本组测试数据的选择原则

- 时间基准统一取同一个 epoch 毫秒数、周期统一取 5m，让「第 N 根」在毫秒算术里完全确定，缺口与相邻判断的期望值可以手算。
- 需要断「按日分区裁剪」时构造跨越多个 UTC 日历日的时间轴（间隔取 24 小时），以避开「同一天两个分区」这类偶然通过。
- 帧构造器（`_update_frame`、`_book_row`、`_news` 这类辅助）统一使用上游真实字段名与字符串类型数值，绝不用 Python 数字——把「上游传字符串」这一事实固化在构造器里，避免实现悄悄依赖 `float` 输入而在真实推送上崩掉。
- 上游可失败时，假对象都要接受 `fail_at`/`fail`/`fail_rate_limits` 之类的失败注入参数：**「正常路径 + 至少一种失败路径」是最低要求**。只测成功路径是本组最常见的假绿来源（缓存损坏、单源失败、限流、旧记录缺字段都属于这一类）。

同理，本组断言普遍包含「反面对照」：某 listener 必须有值时，另一 listener 必须**恰好为 `[]`**；某 series 缓存被清时，其他 series 缓存必须仍在。若只断正面，「路由扇出给所有人」「缓存全局共享」这类实现将完全无法被拒之门外——而它们在真实行情里对应的正是用户可见的「切币后串数据」（来源: `openspec/specs/orderbook-symbol-switch-stale/spec.md`、`chart-symbol-switch-race` 一类问题的测试侧对应物）。

**边界约束（什么能做、什么禁止）**

- **禁止**任何真实外部依赖：网络、Node 子进程（除 `test_offline.py` 用假 client 伪装）、akshare 导入（`test_newsfeed.py` 注释明确「never imported here」）。新增上游调用必须同时新增替身。
- **禁止**在生产包里加测试专用分支；如需扩展点，用注入参数（`fetch_page`、`fetch_instruments`、`_loop`、`sleep`）。
- **禁止**用 `time.sleep` 等待异步事件（会锁死 TestClient 的事件循环）；异步必须同步驱动协程（如 `asyncio.run(stream._handle_frame(...))`）。
- 每个文件保留 `python tests/test_x.py` 可直跑（`_run_all()` 风格），但**不得**引入 `pytest` 之外的断言框架；`pyproject` 的 `testpaths/test_mark` 保持不变。
- 涉及 `data/parquet` 的用例一律落 `tempfile` 目录；如确需读真实数据（仅 L1 允许），必须走 `Settings()` 而非硬编码路径。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/timeframe-identifier-scheme/spec.md`、`realtime-only-timeframe/spec.md`、`kline-ingestion/spec.md`、`market-data-store/spec.md`、`history-backfill/spec.md`、`v3-history-channel/spec.md`、`multi-market-hub/spec.md`、`exchange-data-hub/spec.md`、`blockbeats-data/spec.md`、`blockbeats-data-cache/spec.md`、`global-news-pipeline/spec.md`

- **周期标识一致性**：前端周期栏、`timeframe_to_granularity/step_ms`、WS 通道 token 三者 MUST 同源；月的 token 为 `1mo`（上游 `1M`），且 MUST NOT 与分钟 `1m` 混淆；非原生周期 MUST 显式拒绝。
- **仅实时周期**：秒级/实时级别 SHALL 只经 WS 提供，不建 Parquet 行、不参与 L1 门禁参数化。
- **历史回填（v3 REST）**：分页游标向前翻页、429/限流 MUST 退避重试、并行窗口 MUST 按 `open_time` 去重合并、`earliest_reached` MUST 在「空页且重试后仍空」时才置位；REST 失败允许回落 MCP 通道（不新增前端依赖）。
- **BlockBeats 代理与缓存**：端点名与上游对齐（旧别名 → 400）、上游异常 → 502、参数必透传；本地缓存 MUST 按「端点 + 参数」唯一化，命中优先、缺失回落实时、逐端点失败隔离且保留旧缓存。
- **全球新闻流水线**：源适配器逐源标准化 + 规则优先级分类 + 全序固定的类别顺序；单源失败 MUST NOT 影响其余源；buffer 有界且 snapshot 最新在前。
- **Parquet 存储层不变式**：K 线 SHALL 按 `category/symbol/timeframe` 分区并**按 UTC 自然日每日一个文件**（`<YYYY-MM-DD>.parquet`）；写入 MUST 以 `open_time` 去重合并，保证同一 bar 不重复。本层的落地方式是分层的：**去重合并**由 `test_offline.py::test_pagination_and_store_dedup`（重复保存 `added == 0`、分页后 `open_time.nunique() == 20`）守，**日分区读写**由 `test_store.py`（`test_read_trims_to_day_range` 按日裁剪、`test_read_limit_reverse_accumulates`、保存/删除后缓存失效）守。改动写入合并口径会同时弄坏 L1 门禁（相邻间隔与重复时间戳判定直接读这些文件）与前端历史预加载（来源: `openspec/specs/market-data-store/spec.md`、`openspec/specs/kline-ingestion/spec.md`）。
- **v3 深历史通道口径**：单次 `limit` SHALL NOT 超过 100；本层 `test_ingestion_rest.py` 断言的是**出网参数**而非入参（`_fetch_v3_page` 把 500 截为 `"100"`）。⚠ 不要与 v2 混淆：`_fetch_v2_page` 的 `limit` 是**透传**（`500` 即 `"500"`，上限 1000 由上游决定）——两代通道的限幅语义不同，混改会让回填悄悄少拉或多拉；单次时间窗口 ≤ 90 天；`earliest_reached` MUST 仅在「可无限回溯的 v3 对最旧窗口重试后仍空」时成立，MUST NOT 把 v2 短页/空页当作到底（否则会造成永久不可补的历史空洞）（来源: `openspec/specs/v3-history-channel/spec.md`、`openspec/specs/history-backfill/spec.md`）。
- **行情 hub 的订阅共享与品类隔离**：镜像 SHALL 按 `category` 独立维护（ticker/books/trade/mark-price/funding-time），各品类用对应 `instType` 建订阅；对外部订阅 SHALL 按「品类+symbol+频道」引用计数，**0→1 才订阅、降为 0 才退订**，多方复用同一条 Bitget 连接（来源: `openspec/specs/exchange-data-hub/spec.md`）。⚠ 品类集合存在**规格漂移**：`exchange-data-hub` 仍写五品类，后续的 `multi-market-hub` 已裁剪为仅 `SPOT`+`USDT-FUTURES`（明写 SHALL NOT 拉取 MARGIN/USDC-FUTURES/COIN-FUTURES）；本层用例只出现 `USDT-FUTURES`/`SPOT`，新增品类用例前须先确认以哪份规格为准，不得直接拿旧规格当白名单（来源: `openspec/specs/multi-market-hub/spec.md`）。

**本节逐条来源对照**

> （来源: `openspec/specs/timeframe-identifier-scheme/spec.md`）
> （来源: `openspec/specs/realtime-only-timeframe/spec.md`）
> （来源: `openspec/specs/kline-ingestion/spec.md`）
> （来源: `openspec/specs/market-data-store/spec.md`）
> （来源: `openspec/specs/v3-history-channel/spec.md`）
> （来源: `openspec/specs/multi-market-hub/spec.md`、`openspec/specs/exchange-data-hub/spec.md`）
> （来源: `openspec/specs/history-backfill/spec.md`）
> （来源: `openspec/specs/blockbeats-data/spec.md`）
> （来源: `openspec/specs/blockbeats-data-cache/spec.md`）
> （来源: `openspec/specs/global-news-pipeline/spec.md`）
