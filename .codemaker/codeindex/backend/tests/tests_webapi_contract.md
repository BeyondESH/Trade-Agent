---
type: "Fragment"
id: backend/tests/webapi_contract
title: "全栈 E2E 测试门禁层 / Web API 与 WS 行为契约"
description: "不启进程时，TestClient 如何验证 FastAPI 的下单令牌、WS 帧路由、限流与新闻 SSE 行为？"
parent: /backend/tests/_overview.md
fragment: webapi_contract
entity_names:
  constants:
    - name: BASE
      value: "1700000000000"
      source: backend/tests/test_webapi.py
    - name: STEP
      value: "300000（5m 一根）"
      source: backend/tests/test_webapi.py
    - name: DEFAULT_FACTORS
      value: "内置因子集（默认快照指标 + 特征列）"
      source: backend/tests/test_webapi.py（从 market_data.factors 导入）
    - name: 作业上限断言基准
      value: "MAX_JOBS=200（生产值），测试中 monkeypatch 为 3 以便廉价地验证逐出"
      source: backend/tests/test_webapi.py:test_max_jobs_evicts_oldest
    - name: 确认令牌 TTL
      value: "PENDING_TOKEN_TTL_SECONDS=300（测试用 -1 强制过期分支）"
      source: backend/tests/test_webapi.py:test_confirm_token_expired_is_structured_400
    - name: 种子形态
      value: "150 根 5m bar，close=100+5*sin(i/4)，且最后一根被压到 min+0.01（刻意贴近支撑）"
      source: backend/tests/test_webapi.py:_seed
    - name: /candles limit 边界
      value: "合法 1~500（默认 500）；0/-1/501/100000 → 422"
      source: backend/tests/test_webapi.py:test_candles_limit_bounds
    - name: 新闻 SSE 快照上限
      value: "snapshot 内 items 截断为 100（total 仍报全量 120），newest-first"
      source: backend/tests/test_webapi.py:test_news_stream_snapshot_capped_newest_first
retrieval_hints:
  - "Web API 的下单二次确认令牌有什么不可复用/会过期的规则？"
  - "/ws 的 candle 快照为什么有时 last_candle 是 null？"
  - "多周期订阅时更新帧会不会串到别的 timeframe？"
  - "回测作业的数量上限怎么测？为什么不真的提交 200 个作业？"
  - "新闻流 /news/stream 的事件顺序和条数上限是什么？"
  - "要在 Web API 层加一个新端点断言，应该写在哪个文件、用什么替身？"
  - "本文件也叫 Web API TestClient 层契约、84 用例的最大单体"
  - "⚠️ 如果你要找真实进程下的端点行为（含端口/启动/网络栈），不在这里，见 tests_l2_live.md"
  - "⚠️ 如果你要找 LLM Provider 的解析规则本身（JSON 提取/回退），实现细则在 tests_offline_quant_trading.md 的 agent 小节"
architectural_role: "进程内 API 契约层（FastAPI TestClient + 可注入替身），是 Web 层最密集的回归资产"
---

## 对外接口（本层固化的 Web 契约）

> 全部通过 `TestClient(create_app(settings, stream=..., market=..., news_broker=...))` 在**同进程**内驱动；替身注入是本层的定义性特征。

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `GET /health`、`/candles`、`/analyze`、`/levels`、`/structure` | test → app | `candles[]`、`count` | 读路径；`/candles` 的 timeframe **大小写不敏感**（`5M` 等价 `5m`） | `test_health`、`test_timeframe_case_insensitive` |
| `POST /order` → `POST /order/confirm` | test → app | `token`、`filled`、`live=false` | 两段式下单：提交不下单，确认才成交；令牌**一次性**（TTL 内复用 → 400） | `test_order_confirm_token_flow`、`test_confirm_token_cannot_be_reused_within_ttl` |
| `POST /order`（风控无余量） | test → app | 无 `token`、400 | 风险被拒时**不发令牌**（避免「拿到令牌就能成交」的错觉） | `test_order_risk_rejection_no_token` |
| `PUT /control` | test → app | `kill_switch`、`enabled`、`live_enabled` | `live_enabled=true` 将 `paper_only` 取反以打开实盘通道；拉闸或禁用总开关 → `POST /order` 返回 **403**；`enabled=true` 后恢复 200 | `test_kill_switch_blocks_order`、`test_control_enabled_flag_blocks_and_restores_order` |
| `POST /backtest` (+`/sweep`、`/walkforward`) | test → app | `factors`、`params`、`window`、`model`、`job_id` | 回测/扫描/滚动训练；非法表达式/窗口/模型 → 4xx，未训练完成前不产出伪结果 | `test_backtest_with_factors_and_params`、`test_backtest_rejects_bad_expression` |
| `GET /jobs/{id}` | test → app | `status ∈ {running,done,error}` | 异步作业；`/jobs/{未知}` → 404 | `test_backtest_job` |
| `WS /ws`（candle） | test ↔ app | `action: snapshot/update`、`event: subscribed`、`data.last_candle` | 快照优先取实时流（Parquet 为空也能出图），无流无档 → 错误帧 | `test_ws_candle_snapshot_prioritizes_live_stream_when_parquet_empty`、`test_ws_candle_snapshot_error_when_no_stream_and_no_parquet` |
| `WS /ws`（限流与陈旧抑制） | test ↔ app | `last_candle`（陈旧时置 **null**）、`price` 等增强字段仍在 | 突发 bar 合并为「≈1 条/秒」的 update 帧；~5s 轮询快照 MUST NOT 回推比已推送更旧的 bucket（否则图表会追加乱序 bucket） | `test_ws_candle_update_throttled_to_one_per_second`、`test_ws_candle_poll_snapshot_does_not_send_stale_last_candle` |
| `WS /ws`（多周期） | test ↔ app | 按 `symbol/timeframe` 路由 | 多周期 update 帧 MUST NOT 互相串台；退订/断连要摘掉 listener | `test_ws_candle_multi_period_update_frames_do_not_cross`、`test_ws_candle_disconnect_removes_listener` |
| `WS /ws`（市场频道） | test ↔ app | `ticker`/`books`、类别通配 | 通配 ticker 会周期性收到全市场帧；类别过滤生效；断连释放引用计数订阅 | `test_ws_ticker_wildcard_receives_periodic_update`、`test_ws_disconnect_releases_subscriptions` |
| `GET /candles/recent` | test → app | `limit` 默认 200、上限 500（>500 → 422）；空缓冲时从上游 REST 补齐并订阅 | 刚切币的合约也要能立即出图；仅实时周期（1s）不得预装历史 | `test_candles_recent_returns_stream_batch`、`test_candles_recent_seeds_from_rest_when_stream_empty`、`test_candles_recent_realtime_only_does_not_seed_history` |
| `GET /news/categories`、`/news/health`、`/news/context`、`/news/stream`、`/news/history` | test → app | `categories`、`hours`、`category` 过滤、SSE `event: snapshot` + `event: item` | 新闻链路对 UI 的对外契约：health `status=="ok"`、context 按小时+类别过滤、SSE 快照 100 条 newest-first、分页带 hasMore | `test_news_categories_and_health`、`test_news_stream_sse`、`test_news_history_paging_and_filters` |
| `POST /agent/decide`、`/agent/cycle` | test → app | `action ∈ {open,close,hold}`、`status`、`reason` | Agent 端点在有/无新闻条目两种态下都必须 200 | `test_agent_endpoints_with_news_items`、`test_agent_endpoints_without_news_items` |
| 告警 + 参考线 | test → app | 含颜色的 `referenceLine`、跨重启持久化 | 告警/参考线存 `data/alerts`；重启后仍在，颜色字段必须 round-trip | `test_alerts_crud_and_persistence`、`test_alerts_round_trip_reference_line_with_color`、`test_alerts_persist_across_app_restart` |
| 回填端点参数边界 | test → app | `max_pages ∈ 1..20`（0 或 21 → 422）；`before` 必填 | 无界回填会打爆上游限流与磁盘；越界 MUST 在触达上游前被拒（`fake.calls == []`） | `test_backfill_rejects_invalid_max_pages` |
| 回填（REST 主 + MCP 兜底） | test → app | `appended`、`earliest_reached`；限流退避以 `ingestion.time.sleep` 可桩方式实现 | `/candles/backfill`：v3 REST 优先，抛 `V2RestError` 才回落 MCP bridge；限流（异常文案含 `rate limit`）退避重试且不倒退进度 | `test_backfill_rest_path_appends_when_rest_fetcher_succeeds`、`test_backfill_falls_back_to_mcp_when_rest_fails`、`test_backfill_rate_limit_retry_keeps_progress` |
| 生命周期调度注册 | app startup | `job ids ⊆ {circuit_breaker, agent_cycle, retrain}` | 默认只注册熔断守护；`agent_schedule_enabled` 才注册 agent_cycle + retrain 共 3 个 job；`MD_SCHEDULE_INTERVAL_SECONDS=0` 时不注册 | `test_lifespan_registers_only_circuit_breaker_by_default`、`test_lifespan_registers_agent_and_retrain_when_enabled`、`test_lifespan_skips_both_schedulers_when_interval_disabled` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src`（`market_data.webapi`） | 被断言的应用本体（工厂 `create_app`，可注入 `stream`/`market`/`news_broker`） | `create_app`、`_register_job` | extracted |
| `backend/src`（`realtime` / `streamhub`） | 替身复刻 `latest/recent/subscribe/add_listener` 与 `tickers/orderbook/trades` 的最小接口，替身必须与真实接口同形 | `BitgetWsStream`、`MarketStream` | extracted |
| `backend/src`（`mcp_client` / `ingestion`） | 回填兜底路径需要假 MCP client 与 REST 失败注入 | `FakeMcpClient`、`V2RestError` | extracted |
| `backend/src`（`models` / `store` / `config`） | 种子 parquet + Settings 隔离（`data_dir=tmp`） | `Series`、`ParquetStore`、`Settings` | extracted |
| `backend/src`（`factors` / `dlquant`） | `/backtest`、`/backtest/dl-features` 的因子与特征契约 | `DEFAULT_FACTORS`、IC/coverage 指标 | extracted |
| `backend/tests/infra` | 隔离 `Settings`（部分用例用 `_tmp()` 自建临时目录而非 fixture；本文件**不**触碰 L2，故无需真实进程） | `tmp_settings`、`Settings` | extracted |

> 反向依赖（谁依赖本层的结论）：

| 调用方 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/src` 与 `frontend/api` | `/ws` 帧语义（陈旧 bucket 置 null、限流 1/s、大小写容错）直接决定图表是否「追加乱序 bucket」；本层是图表问题的最快裁判 | `test_ws_candle_*` 系列 |
| `backend/tests/l2_live` | L3 无法在 TestClient 覆盖的行为（真进程、真实 WS 栈）由那里补齐，本层是它的离线前置 | `live_server` 用例集 |
| `openspec/specs`（realtime-candle-push / ws-series-routing / ui-live-data-sync 等） | 这些 capability 的验收断言物理上就 living 在本文件 | `test_ws_candle_*`、`test_news_*` |

## 典型调用链

### WS candle 推送契约
```
with TestClient(create_app(settings, stream=_FakeStream(), market=_FakeMarket())) as c
  → c.websocket_connect("/ws")                         ← 本模块入口
    → send {"op":"subscribe","args":[{channel:"candle",symbol:"BTCUSDT",timeframe:"5m"}]}
      → webapi 内部：subscribe → _push_snapshot → {"action":"snapshot", ...} + {"event":"subscribed"}
        → _FakeStream.emit(更新 bar)                    ← 跨模块：注入假实时流
          → webapi listener → {"action":"update","data":{"last_candle": 新 bucket}}
            → 轮询通道 latest() 返回更旧 bucket → last_candle 置 null（陈旧抑制）
```

### REST 回填主 + MCP 兜底
```
POST /candles/backfill {category,symbol,timeframe,before,max_pages(默认 10，合法 1..20)}
  → 取 series_lock + backfill_sem                            ← 本模块入口（并发保护）
    → ingestion: KlineIngestor.backfill_before_rest(fetch_page=v3 或注入的 REST 拉子)
      → 成功     → ParquetStore.save → 回 {appended, earliest_reached}
      → V2RestError → 回落 MCP bridge（backfill_client_factory 注入的假 client）
        → 限流（异常文案含 "rate limit"）→ time.sleep 退避（用例把 `ingestion.time.sleep` 换成记录器，断言确实 Pause 了一次且进度不倒退）
          → 回填后用 GET /candles 验证 open_time 序列与预期一致
```

## 实现约束清单

> 实现本层相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `BASE` / `STEP` | `1700000000000` / `300000` | `test_webapi.py` | 全部种子与 WS 帧时间的基准（5m）；改 STEP 会连带影响多周期与陈旧 bucket 断言 | — |
| `MAX_JOBS` | `200`（生产）/ 用例内 `3`（monkeypatch） | `test_webapi.py` | 逐出策略可廉价验证的前提：`_register_job` 在**调用时**解析 `MAX_JOBS`，因此 patch 模块属性有效 | 若实现改为 import 期捕获常量，本测试立刻失去意义 |
| `PENDING_TOKEN_TTL_SECONDS` | `300` / 用例内 `-1` | `test_webapi.py` | 令牌过期分支的唯一可测入口（负 TTL 让条目「提交即过期」） | 过期必须返回结构化 400（`detail == "invalid or used token"`）并**不得**建仓 |
| `_seed` 价格 | `min + 0.01` | `test_webapi.py` | 最后一根 close 被刻意压到区间最低附近，使规则 Agent 稳定产出 `open`（贴近支撑）| 改动种子形态会让 `/agent/decide`、`/analyze` 的方向性断言失效 |
| 作业终态集合 | `{running, done, error}` | `test_webapi.py` | `/jobs/{id}` 的 status 枚举；轮询循环靠 `!= "running"` 判结束（TestClient 会在响应后同步跑完后台任务） | 新增中间态会让轮询类断言误判 |
| 新闻 SSE 事件序 | `event: snapshot` → N × `event: item` | `test_webapi.py` | UI 无限流的首帧快照 + 增量；快照 items 截断 100、`total` 报全量（`snapshot(max_items=100)`） | 违反即前端首屏重复渲染或漏条 |

### 必须实现的函数

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `_seed(tmp)` / `_client(tmp, news_broker=None)` | `test_webapi.py` | 每个用例独立 tmp（`with _tmp() as c`）+ 注入替身；**禁止**跨用例共享 settings/告警/持仓状态 |
| `_FakeStream` | `test_webapi.py` | 复刻 `latest/recent/subscribe/unsubscribe/add_listener/remove_listener/emit`，`emit` 用 `loop.call_soon_threadsafe` 保证事件循环安全 |
| `_FakeMarket` | `test_webapi.py` | 复刻 `streamhub` 扇出接口（`tickers/orderbook/trades/mark_prices/funding/instruments/subscribe`），`emit(category, channel, symbol, action, data)` |
| `_FakeNewsBroker` | `test_webapi.py` | 静态 `items` 快照 + `categories`（7 类固定序）+ `health()` 六字段（poll_seconds/buffer_size/buffer_items/last_poll/running/sources）；`subscribe` 用 `call_soon_threadsafe` 灌队并以 `None` 哨兵收尾 |
| 实盘失败注入 | `test_webapi.py` | `_failing_live_client("start" 或 "call_tool")` 以替身类 Swap 掉 `mcp_client.McpDataClient`，断言 `502 + error` 且 `positions == {}`（失败不得建仓） |
| `test_config_roundtrip_and_reject` | `test_webapi.py` | 配置 PUT 只负责持久化与回读（`config_store.save` 抛 ValueError → 400）；用例 MUST 断 round-trip（PUT 后 GET 能读到新值）并对越界值（`margin_pct=2.0`）断 400 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| WS 实时性如何在离线验证 | 注入可 emit 的 `_FakeStream`/`_FakeMarket`，在 TestClient 内驱动 listener | 真实进程 + 真上游（那是 L2），或干脆跳过 | 事件驱动帧、限流、陈旧抑制、多周期路由都需要「精确控制推送时序」，真实上游做不到；同 D6 |
| 陈旧 bucket 处理 | 轮询快照发现 `latest` 比已推送更旧时，把 `last_candle` 置 `null` 但仍保留 price 等增强字段 | 直接不回帧 | 不回帧会让 UI 指标卡长期空白；回旧帧会让图表出现「倒序插入的 bucket」——正是规格点名禁止的回归 |
| 配置 PUT 的副作用边界 | 测试只断言「写入 + 回读」与「非法值 400」，不假设 runtime 即时重建 | 在 PUT 内同步重建 Agent/orchestrator | 同步重建会拉入 vectorbt/sklearn 等重型依赖，使 HTTP 语义不确定；因此本层 MUST NOT 把「配置已热生效」写成断言（新行为需先改 `openspec/specs/config-persistence` 再补用例） |
| 断连的订阅归属 | 必须显式 `remove_listener` + `unsubscribe`（`RefCountSubscription` 释放） | 靠 gc | 不 release 会让后台 stream（如 5s ticker 刷新）永远持有 handler，形成资源泄漏与幽灵推送 |
| `/agent/decide` 失败语义 | 数据不足 → **422**（不回 200 + `hold` 伪装成成功） | 200 + hold | 决策与「无法决策」必须在指标层可区分，否则告警与回测会把「没数据」当「该观望」 |

## 变更风险与边界约束

### 背景与权衡（为什么只能这样组织）

Web 层的断言面对三个结构性困难。第一，**决策依赖上游实时性**：真实推送、真实限流、真实抖动让「什么时候收到第 N 帧」不可预测；注入替身（假 stream / 假 market / 假 news broker / 假回填 client）是本层唯一能让「更新先到、轮询后到且更旧」这类**相对时序**变成可控输入的办法——而这恰恰是图表是否会长出乱序 bucket 的判定现场。第二，**行为依赖后台任务**：调度线程、ticker 周期刷新、WS 事件线程一旦在测试里真跑，就无法断死返回结构、也无法保证隔离性。用 `_lifespan_ids` 这类「直接问调度器注册了哪些 job」的读法，把时间依赖替换成结构依赖；替身只暴露被断言所需的最小接口，也顺带变成接口面积的文档。第三，**重型依赖导入极慢**：回测、特征与向量计算栈的导入以十秒计，于是需要「慢路径的结论」的用例改走「空 series 让任务快速 error」，再配合 monkeypatch 降低生产常量——这样逐出分支仍然被真正执行（`_register_job` 在调用时解析 `MAX_JOBS`），成本却从数百次回测降到几次提交。这三条共同解释了本层的组织方式为什么既不是纯黑盒 HTTP，也不是全 mock 单测。

需要特别记住的是替身的**形状即契约**。`_FakeStream`/`_FakeMarket`/`_FakeNewsBroker` 只实现被路由真正调用的那几个方法；生产侧新增一次方法调用，替身就会 `AttributeError`——这份「脆」是故意的：它把「Web 层新依赖了实时层的什么」这件事变得不可忽略。反过来说，把替身做成 `**kwargs` 全吞的万能假人，等于把本层的探测能力清零。

`last_candle` 置 null 这一条也值得单独说明：它是两种正确性之间的折中。不回帧会让指标卡与右侧面板长期空白（前端依赖 update 帧携带 price/高低价/成交量/涨跌幅等增强字段）；回旧帧则会在图表上追加一个乱序 bucket，直接违反严格升序无重复的数据契约。把 bucket 置空、保留增强字段，让「时序」与「可观测性」各自达标——因此本层同时存在「陈旧必置空」与「非陈旧必保留」两条用例，删掉任一条都会让另一端失去约束：只留前者，最坏实现就是每帧都置 null，前端永远拿不到最新价。

### 本层与相邻层的责任边界

- 本层负责「Web/WS 行为契约」（状态码、错误语义、帧结构、路由隔离、生命周期注册表），不负责「数据内容对不对」（L1）与「真进程能否起来」（L2）。三层各自都有过被互相替代的历史，替代的结果是留下一片真空。
- 本层与 `tests_offline_data_stream.md`（单元层）的关系：单元层管「算法与状态机在自己的输入下是否正确」，本层管「这些输出被协议暴露时形状是否仍然正确」，因此允许出现同一业务规则在两层各有一条断言（如周期 token 归一），这是有意的双保险而不是重复。
- 本层与 `tests_offline_quant_trading.md` 的关系：回测/风控/Agent 的正确性口径在后者，本层只断「端点是否按该口径给出结果与错误码」；若本层的数值断言开始变多变细，说明单元层缺位，应下沉而不是在本层继续加。



**变更风险（改动本层会破坏什么）**

- 放宽 WS 陈旧抑制或改 `last_candle` 帧格式（对象 → 数组）→ 图表追加乱序 bucket 或前端解构失败；本层是图表类需求唯一可信回归点（历史事故：`realtime-candle-event-push` 与 `fix-kline-realtime-order` 期间确立的守卫）。
- 允许令牌复用或让「风控拒绝」也返回 `token` → 用户可对同一 token 二次成交，纸面/实盘皆放大为真实资金风险；实盘链路还有 `LiveBroker` 的双闸兜底，但接口层这道闸必须存在。
- 把 `/candles` 的未知 symbol 改成 4xx → 前端切币时会出现 4xx 抖动（L3 与 `ui-affordance-integrity` 依赖「数据缺失不得抖动」的宽容语义）；L2 也断言 `200 + count:0`。若真要把本层改成 422，必须同时改 `openspec/specs/market-endpoints` 与本层。
- 让 `/news/stream` 全量下发（去掉 100 上限或改成最旧优先）→ 首屏快照体积与排序错乱；上限/排序就是与前端共同签署的契约。
- 删除 `/candles/backfill` 的 `max_pages` 越界拒绝用例（0 与 21 → 422，且 `fake.calls == []` 证明未触上游）→ 会新增「无界回填」与「打爆上游限流」两类真实故障。
- 生命周期 job 注册矩阵被改（例如默认注册 `agent_cycle`）→ 后端启动即开始自动交易，「默认纸面 / 不自动交易」的安全声明失效；这条断言是**默认配置改变的唯一守门人**。

### 断言强度的取舍（哪些性质必须双条覆盖）

本层的用例大量成对出现，这不是冗余，而是「同一条规则的两端各会怎么坏」的直接体现：陈旧 bucket 必须置空 / 非陈旧必须保留；退订后不再收到该 series 帧 / 未退订的其它 series 仍正常；REST 成功走 REST / REST 失败必须回落 MCP；有新闻条目时 200 / 无条目时也必须 200；`enabled=false` 时下单 403 / 恢复 `true` 后同一请求必须 200；作业超限时最旧被逐出 / 最新仍在；未知 symbol 走 REST 种子 / 仅实时周期不得预载历史。只留其中一条，「永远返回空」与「永远返回旧值」这两种相反的坏实现都能通过另一半——因此**成对性本身就是契约**，删掉成对中的一条与删掉断言同等危险。

另一处取舍是错误注入放在哪一层。回填链有 v3 REST 与 MCP 两个通道（`backfill_client_factory` / `backfill_rest_fetcher` 两个注入点，配合 `_raise_rest` 强制 REST 失败），因此本层可以廉价地测「两通道均失败」「两通道均无更早历史（`appended=0` 且 `earliest_reached=true`）」这类组合；这些组合在 L2 无法稳定复现，因为真实上游不配合制造失败。同理，限流退避的断言靠把 `ingestion.time.sleep` 换成记录器完成——它验的是「确实暂停过、且暂停后进度不倒退」（`len(sleeps) == 1` 且 `fake.calls == 3`），而真实 429 行为属 `test_backfill_online` 的在线冒烟职责（来源: `openspec/changes/archive/2026-08-17-bitget-connectivity/design.md`、`openspec/specs/v3-history-channel/spec.md`）。

最后一处是持久化边界。`/alerts`、`/config`、`/chart-config`、`/backtest/history` 都落到 `tempfile` 下的真实文件存储，本层用「换数据目录 + 重建 app」证明跨进程语义，用「未知/缺失 id 返回空态或 404 而不是异常」保护 UI 刷新不抖。若有人为省事把这些存储改回进程内字典、或把文件路径改成硬编码 `data/`，这三类断言会立刻失败——这正是本层存在的意义：**让「配置与告警重启即丢」这种用户直接可见的退化无法静默合入**。

### 契约变更的先后顺序（改实现还是改断言）

本层的多数麻烦不是「断言写错」，而是「顺序写错」。合理的判定链是：先确认实现当前行为 → 与 `openspec/specs` 比对 → 若行为正确而 spec 过时，先改 spec/文档再改断言 → 若断言过时（需求已变更），同步更新本层与受影响的 L3 用例 → 只有当两者都错时才动实现。原因很直白：本层断言是前端与后端共同依赖的接缝（`api/types.ts`、WS 帧解析、错误码到 UI 提示的映射都在它两侧），任何单方面「就范」都会把另一半推到不一致上；`/candles` 的宽容语义、`DELETE /alerts/{missing}` 的 404/405 二义、WS 的 `last_candle` 载荷形状，历史上都经历过一轮完整的「实现—spec—断言」三方对齐，任何跳过 spec 的单边改动最后都被回滚。

同样值得记住的是本层的**结构性断言优先于数值断言**：能用「字段存在且类型正确」「集合有序」「新旧计数变化」表达的，就不要写成具体数字。数字（价格、涨跌幅、K 线索引）随种子数据而变，一旦断死，任何人改 `_seed` 的形状都会撞上一片与需求无关的红；而结构与相对关系（单调、newest-first、上限 100、`limit > 500 → 422`）正是需求原文的形态。只有确实定义在规格里的量（快照 100 条上限、buffer 大小、TTL、`MAX_JOBS`）才值得按数字断言——它们改动即等于契约改动。

最后是本层的成本结构：它跑得比 L2 快两个数量级（不起进程、不打网络），因此当一条断言在两层都能写时，默认放本层，只有「必须真进程才成立」的性质（socket 生命周期、启动期注册、真实 HTTP 校验中间件、WS 握手）才上升到 L2。反过来，把只在本层可测的性质搬进 L2 会让 CI 的 L2 job 变长且没有换来任何保证——这是分层最容易走歪的一个方向。

### 为什么这是一个 84 用例的单文件（以及不该怎么拆）

本层刻意保持单文件：所有用例共享同一套替身（`_FakeStream`/`_FakeMarket`/`_FakeNewsBroker`/`_FakeMcpClient`）与同一个 `_seed` 语义。同一份替身若被拆到多个文件，就会被拆出多份互不相同的「近似实现」，而替身之间的差异正是最容易藏 bug 的地方（一份的 `recent()` 带 `limit` 截断，另一份忘了带，两个文件于是对同一端点给出不同结论）。拆分的正确方向按**注入点**而非主题：只有当某个能力引入新的注入通道（例如新的后台任务、新的上游客户端工厂）时，才把该能力独立成文件，并把它的替身一起带走；此时必须同步更新本文件的覆盖声明、`_overview.md` 的「子文档速览」与 `AGENTS.md` 的命令矩阵，否则「哪个文件负责哪段契约」这个问题就没有权威答案。

另一个常见误操作是给本层加 fixture 化的共享 app。每个用例独占临时目录（`with _tmp() as c:`）是有意的：告警、配置、回测历史都是文件存储，跨用例共享会让「顺序无关」这一前提失效——那正是 L2 需要用 skip 规避的问题，在本层没有理由接受。代价是重复起 app（毫秒级），换来的是任何单条用例可独立执行、可 `--lf` 重跑、可在 CI 分片里乱序运行。同理，替身实例必须每用例新建：`subscribed/removed/added` 这类记录列表一旦被复用，前一个用例的调用历史就会污染下一个用例的「未被调用」断言。

还有一处纪律值得单独写下：**每个用例自己负责恢复全局态**。`kill_switch`、`live_enabled`、`enabled` 与「待确认令牌」都是进程内可变状态，任何把它们改成非默认值的用例 MUST 在 `finally` 里复位（或直接依赖每用例新建的 app 实例）。否则将出现最难缠的一类故障：单独跑通、整文件跑红、且红的位置随文件内顺序漂移——这类问题在本层的成本远高于在 L2，因为本层文件大、用例多、共享代码路径长。

同理，本层不得引入任何模块级可缓存的重对象（如把 app/settings/store 提到函数外）。模块级状态会让 pytest 的文件内顺序成为契约的一部分，等价于把「顺序无关」这一前提作废；而本层的文件规模（84 个用例、四类替身）恰恰使顺序问题的排查成本最高。凡是发现某条断言需要「前一个用例先把状态做成这样」才能通过，正确反应都是**在该用例内部把前置做出来**（多用一次 PUT、多喂一条假数据），而不是调整顺序或合并用例。

最后提醒一个只在本层出现的「双通道同形」要求：`/candles/backfill` 的返回形状必须在两个失败通道下都成立——REST 失败回落 MCP（本层断）与两通道均失败（本层也断，MUST 返回结构化错误而非 traceback）。原因是前端对回填结果的消费只有一套字段集（`appended`、`earliest_reached`、错误时带 `detail`）：任何一条失败路径给出 `500 + 堆栈`，用户看到的是「点了没反应」，而监控只会在数小时后才从「回填请求全部失败」里察觉；这正是本层要提前挡住的部分。

同理，涉及文件路径的断言 MUST 用 `chart-config`（`data/config/chart.json`）与 `alerts`（按 id 命名的独立文件）这类实际落盘位置反向验证：一旦存储实现改用单一文件存全部 series，「per-series 隔离」就会静默失效（读一个 series 的配置把另一个的覆盖掉），而只有从 tmp 目录里能一眼看出的路径差异，才能把这条退化变成红。

**边界约束（什么能做、什么禁止）**

- **禁止**在本层触网或触真实上游：一切外部依赖都必须以替身/mocker 提供（假 client、假 `asyncio.sleep`、`monkeypatch` 的 fetch）。这是离线全绿的前提，也是 D2 的策略。
- **禁止**修改 `create_app` 签名以外的注入通道：新替身必须实现与生产 `stream`/`market`/`news_broker` 参数同形的方法集，否则「测试通过但真流不同形」的假绿。
- 新增 Web 端点断言时，**先**在 `test_webapi.py` 内以主题前缀加用例；只有当形成独立 capability（如新闻、回测历史）时才新建文件，并同步更新本知识库与 `## 子文档速览`。
- `/api/*`（若存在）与 `/ws` 契约一旦确立，需与 `openspec/specs/*` 保持同步；发现漂移时，本层要么已断言（生产改坏，本层红），要么补断言（防未来退化）。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/market-endpoints/spec.md`、`openspec/specs/ws-series-routing/spec.md`、`openspec/specs/realtime-candle-push/spec.md`、`openspec/specs/kline-realtime-order-guard/spec.md`、`openspec/specs/live-control/spec.md`、`openspec/specs/orchestration-jobs/spec.md`、`openspec/specs/global-news-pipeline/spec.md`

- **K 线读取量上限**：`GET /candles` 的 `limit` 小于 1 或大于 500 MUST 返回结构化 422，MUST NOT 静默截断；默认 `limit` 保持 500（本层 `test_candles_limit_bounds` 即此约束的落地）。来源: `openspec/specs/market-endpoints/spec.md`「K 线读取量上限」。
- **实时缓存端点形状**：`GET /candles/recent` SHALL 返回与 `/candles` 相同形状（无数据返回空列表）；对仅实时级别 MUST NOT 调用交易所历史接口补种，且 SHALL 建立该 series 的实时订阅（来源: `openspec/specs/market-endpoints/spec.md`「实时缓存 K 线端点」）。
- **后台任务有界保留**：任务状态字典 SHALL 固定上限 + 最旧优先淘汰，被淘汰任务的查询 MUST 返回结构化 404，MUST NOT 让进程内状态无限增长（来源: `openspec/specs/market-endpoints/spec.md`「后台任务有界保留」；本层以 `MAX_JOBS` 断言 + `_register_job` 调用期解析实现该验证）。
- **级别全集受理与月/分不混淆**：K 线端点 SHALL 接受原生全集中任一级别，MUST NOT 因大小写归一化混淆月级与分钟级；非原生级别 SHALL 返回明确的未支持提示，MUST NOT 静默返回其他级别数据（来源: `openspec/specs/market-endpoints/spec.md`「行情与分析端点」）。
- **未知 symbol 的实测语义**：未知 symbol/周期返回 200 + `count:0`（**非规格条文**，而是 L2 侦察到的实现行为，见 `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` V1；本层与 L2 都按实测断言）。
- **PUT 配置语义**：配置 SHALL 立即持久化并可通过 GET 回读，写入 MUST 复用配置构造校验拒绝非法值；本层断言止于「写入+回读+非法 400」，MUST NOT 约定 runtime 是否即时重建（来源: `openspec/specs/config-persistence/spec.md`）。
- **/ws 路由**：candle 通道 SHALL 按 `symbol/timeframe` 精确路由，SHALL NOT 串台；event update 帧与约 5s snapshot/增强帧并存时以 event-driven 为主，update SHALL 限流至最多 1 次/秒并总是带最新价；snapshot/回推 SHALL NOT 携带比已推送更旧的 bucket（来源: `openspec/specs/ws-series-routing/spec.md`、`openspec/specs/realtime-candle-push/spec.md`）。
- **update 帧字段收敛（不可“顺手补齐”）**：`action:"update"` 的 candle 帧只带 `last_candle` 与 `price`，指标与 Top-N S/R 仅由 `snapshot` 与约 5s 低频快照提供；后端 SHALL 按 series 记录已推送的最新 `last_candle.open_time`，低频快照若更旧则不下发该 `last_candle`。因此本层同时存在「陈旧必须置 null」与「非陈旧必须保留」两条对向断言（来源: `openspec/specs/realtime-candle-push/spec.md`「更新帧内容收敛」）。
- **保序作用域（防“防护过捕”）**：单调性防护 SHALL 只管实时 candle 投递路径（旧帧丢弃 / 同桶替换 / 新桶追加，按 `category:symbol:timeframe` 独立判定），历史加载与向左回填（prepend 更早历史）MUST NOT 被该防护拦截；本层以「多周期不串台」与「回填不被过度剥离」两类用例固化这一边界（来源: `openspec/specs/kline-realtime-order-guard/spec.md`「保序不影响历史与回填路径」）。
- **编排 job 注册矩阵**：默认 SHALL 仅注册 `circuit_breaker`；`agent_schedule_enabled` 时 SHALL 注册 `agent_cycle` + `retrain`；`MD_SCHEDULE_INTERVAL_SECONDS=0` 时 SHALL 不注册任何调度；三个 job 的异常 SHALL 各自隔离（见 tests_offline_quant_trading.md）。
- **新闻流**：`/news/health` 当前返回 `{"status": "ok", **broker.health()}`（`status` 由路由写死，用例仅断 `status == "ok"`）；`/news/stream` 首帧 SHALL 为 `snapshot`，`snapshot` 与 `/news/history` 载荷 SHALL 统一为最新在前，`/news/context` 的响应结构 SHALL 不随瀑布流改版变化（来源: `openspec/specs/global-news-pipeline/spec.md`「瀑布流载荷顺序一致」）。

**本节逐条来源对照**

> （来源: `openspec/specs/market-endpoints/spec.md`）
> （来源: `openspec/specs/ws-series-routing/spec.md`）
> （来源: `openspec/specs/realtime-candle-push/spec.md`）
> （来源: `openspec/specs/kline-realtime-order-guard/spec.md`）
> （来源: `openspec/specs/config-persistence/spec.md`）
> （来源: `openspec/specs/live-control/spec.md`）
> （来源: `openspec/specs/global-news-pipeline/spec.md`）
> （来源: `openspec/specs/orchestration-jobs/spec.md`）
