---
type: "Fragment"
id: backend/src/api_stores
title: "HTTP/WS 门面与本地文档存储"
description: "前端能调哪些端点、`/ws` 订阅帧长什么样、下单为什么要两步、三个 JSON 存储各自守什么上限？"
parent: /backend/src/_overview.md
fragment: api_stores
entity_names:
  constants:
    - name: MAX_CANDLE_LIMIT
      value: "500（`/candles` limit 上限，超限 422）"
      source: backend/src/market_data/webapi.py
    - name: PENDING_TOKEN_TTL_SECONDS
      value: "300（`/order` 预览令牌有效期）"
      source: backend/src/market_data/webapi.py
    - name: MAX_JOBS
      value: "200（内存 job 表上限，只淘汰已完成者）"
      source: backend/src/market_data/webapi.py
    - name: analyze_min_rows
      value: "30（`/analyze`、`/agent/decide`、`/agent/cycle` 的最小行数，不足 422）"
      source: backend/src/market_data/webapi.py
    - name: backfill_locks / backfill_sem
      value: "per-series `threading.Lock` + `threading.Semaphore(2)`（同时最多 2 个 series 回灌）"
      source: backend/src/market_data/webapi.py
    - name: candle_update_throttle
      value: "1.0 秒/series；低频 snapshot 循环 5.0 秒"
      source: backend/src/market_data/webapi.py
    - name: ws_default_args
      value: "category=`USDT-FUTURES`、candle timeframe=`5m`、symbol=`BTCUSDT`（ticker 频道 symbol 缺省为空=全市场）"
      source: backend/src/market_data/webapi.py
    - name: MAX_DRAWINGS_PER_SERIES
      value: "100（单 series 手绘上限）"
      source: backend/src/market_data/chartstore.py
    - name: AlertStore.REQUIRED_FIELDS / CONDITIONS
      value: "`(symbol, condition, threshold)` / `(above, below)`"
      source: backend/src/market_data/alertstore.py
    - name: 本地存储路径
      value: "`data_dir/config/app.json`、`data_dir/config/chart.json`、`data_dir/alerts/alerts.json`、`data_dir/backtest_history/history.json`、`data_dir/memory/trades.jsonl`、`data_dir/events/circuit_breaker.jsonl`"
      source: backend/src/market_data/webapi.py
retrieval_hints:
  - "前端新增一个页面要调哪些端点、错误码怎么约定？"
  - "`/ws` 订阅一路 K 线要发什么帧、收到什么帧？"
  - "为什么下单要两次请求？token 会过期吗？"
  - "画线、指标布局、价格提醒这些数据存在哪里、有没有上限？"
  - "⚠️ 如果你找的是「回测/风控/分析的实际算法」，不在这里，分别在 `src_quant.md`、`src_risk_execution.md`、`src_analysis.md`"
  - "⚠️ 如果你找的是前端的 `apiClient` / WS 自动重连（`connectSnapshot`）实现，不在这里，在 `frontend/src`"
  - "本模块也叫『后端 API / 接口层 / webapi / 本地配置存储』"
  - "架构归属：新端点 MUST 加在 `create_app()` 内部并保持「薄封装 + 业务逻辑留在既有模块」；配置类持久化 MUST 复用 `ConfigStore`/`ChartStore`/`AlertStore` 三个 JSON 文档存储风格，禁止新开第三种 ORM"
architectural_role: "对外契约层（唯一 HTTP/WS 入口，绑定 127.0.0.1）+ 本地 JSON 文档存储；不含业务算法"
---

## 业务意图

本层解决的业务问题是：**把内核能力以稳定、可预测失败的接口暴露给浏览器，同时把「用户自己产生的小量状态」在没有任何数据库的前提下可靠地持久化**。它保证三件事：①长耗时任务（回测、拉取）不会被 HTTP 超时拖死——一律走 job 表；②真实资金操作不会因为「前端多点了一下」就发生——下单被拆成预览 + 确认两步并带 TTL；③图表上的个人资产（画线、指标布局、价格提醒、回测历史）能跨设备/会话保留，且各自有上限，绝不让单个 JSON 文件无限增长。

## 对外接口（端点即契约；共 8 组约 30 余条路由）

| 端点 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|----------|
| `GET /health` | 只读 | `kill_switch`、`live_enabled` | 就绪探针（L2 fixture 用 `/health` 判可读） | `webapi.health` |
| `GET /candles` | 读历史 | `category,symbol,timeframe,start,end,limit≤500` | 严格升序；越界提示走 `/candles/backfill` | `webapi.candles` |
| `GET /candles/recent` | 读实时 | buffer 优先，空则 REST 播种 + `subscribe` | 新切换 symbol 立刻可读 | `webapi.candles_recent` |
| `POST /candles/backfill` | 触发 | `before`、`max_pages∈1..20` | `{appended, earliest_reached}`；REST(v3) 主 → MCP 兜底 | `webapi.candles_backfill` |
| `GET /analyze` | 分析 | 少于 30 行返 422 | 指标末值 + Top-N S/R（默认 `top=8`） | `webapi.analyze`（`top` 默认 `8`） |
| `GET /levels` | 分析 | S/R 候选 | `{price,kind,strength,sources}` | `webapi.levels_endpoint` |
| `GET /structure` | 分析 | 趋势线/箱体/OB | | `webapi.structure` |
| `GET /tickers` `/instruments`；`/books/{category}/{symbol}`、`/trades/{category}/{symbol}`、`/mark-price`、`/funding` | 镜像快照 | 均支持 `category` | 只读内存镜像，不阻塞等待 WS | `webapi.tickers`、`webapi.books_categorized`、`webapi.funding`、`webapi.mark_price`、`webapi.instruments` |
| `POST /backtest` → `GET /jobs/{job_id}` | 长任务 | `{job_id}` | `status=running\|done\|error`；未知 id 404 | `webapi.backtest` |
| `POST /backtest/sweep`、`/backtest/walkforward`、`/dl/features` | 同步 | 窗口 + 因子 + 参数 | 直接返回结果（**不**建 job 记录） | `webapi.backtest_sweep` 等 |
| `GET /backtest/history[/{run_id}]`、`DELETE /backtest/history/{run_id}` | 读写 | 摘要/详情/404 | 回测历史留存的对外口径 | `webapi.backtest_history_*` |
| `GET/PUT /config` | 读写 | `provider`、`risk`、`system_prompt`、`manual_rules`、`factors` | 非法配置抛 `ValueError` → 400 且不写文件 | `webapi.put_config` → `ConfigStore.save` |
| `GET/PUT /chart-config` | 读写 | `category,symbol,timeframe,state{indicators,drawings,layers}` | 校验后整份覆盖 | `webapi.put_chart_config` → `ChartStore.save` |
| `GET/POST /alerts`、`PUT/DELETE /alerts/{id}` | CRUD | `symbol,condition,threshold,enabled,triggered,color` | 创建非法 400；未知 id 404 | `webapi.alerts_*` → `AlertStore` |
| `POST /agent/decide` | 只建议 | 返回 `AgentDecision` dict | 不下单；数据不足 422 | `webapi.agent_decide` |
| `POST /agent/cycle` | 纸面一次 | 经风控执行 | 返回 `{status: open\|close\|hold\|halted, ...}` | `webapi.agent_cycle` |
| `GET /portfolio` / `GET /journal` | 只读 | 持仓/净值、全量交易日志 | | `webapi.portfolio` |
| `PUT /control` | 运行控制 | `kill_switch` / `live_enabled` / `enabled` | `live_enabled=true` ↔ `paper_only=false`（默认纸面） | `webapi.control` |
| `POST /order` + `POST /order/confirm` | 两步下单 | `{token, preview{margin,notional,leverage}}`；`ConfirmBody{token,data?}` | 第一步只做风控预校验；第二步带 TTL 校验后才真下单 | `webapi.order` |
| `GET /blockbeats/*`、`POST /blockbeats/data/refresh` | 代理 | 见 `src_news.md` | 未知端点 400；失败 502 | `webapi.blockbeats_*` |
| `/news/categories`、`/news/context`、`/news/history`、`/news/stream`（SSE）、`/news/health` | 资讯 | SSE 帧 `event: snapshot` 含 `{items,total,sources}`；后续 `event: item` | 断线重连语义在前端，本层只管 replay | `webapi.news_stream` |
| `WS /ws` | 订阅 | `{"op":"subscribe\|unsubscribe","args":[{channel,category,symbol,timeframe}]}` | 回推 `{category,channel,symbol,timeframe,action,data}`（`action=snapshot\|update`） | `webapi.ws` |

**错误口径（写死在代码里，改动即契约变更）**：`ValueError → 400 {"error":...}`（timeframe/category/参数非法）；`BrokerError`/`McpError → 502 {"error":...}`（上游故障不得冒 500）；kill-switch 生效时 `/order` 与 `/order/confirm` → `403 {"detail":"kill-switch active"}`（`/candles/backfill`/`/config` 等读写路径不设此闸门）；缺参数/超限 → 422；未知 job/alert/history id → 404；成功响应字段名（`candles`/`series`/`count`、`runs`、`trades`、`deleted`/`ok`）是前端解析契约。

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| 几乎全部内模块 | 本层只转发 | `indicators.compute`、`levels.build_levels`、`store.read`、`dlquant.run_pipeline`、`RiskEngine`、`ExecutionEngine`、`AlertStore` | extracted |
| 构造注入点（便于测试隔离外部网络） | 所有可注入协作者集中在 `create_app(...)` 签名 | `create_app(settings, stream, market, backfill_client_factory, backfill_rest_fetcher, news_broker)` | extracted |
| `bitget-agent-mcp` | 仅 `run_control.paper_only == False` 时构造 `McpDataClient` + `LiveBroker(enabled=True, confirm=lambda: True)` | `McpDataClient(settings.mcp_command, settings.mcp_args)` | extracted |
| 测试层 | `live_server` fixture 用 `MD_SCHEDULE_INTERVAL_SECONDS=0` 关调度 | `conftest.py` | extracted |

**反向调用方**：`frontend/src`（REST apiClient + `/api/ws` + SSE）、`backend/tests` L2（33 端点全量断言）、L3 Playwright journeys、`scripts/dev-*` 启动脚本。

## 典型调用链

```
POST /api/order {category, symbol, side, leverage, price}   ← 本层
  → run_control.can_trade() 否 → 403 kill-switch active
  → RiskEngine(RiskEngine(cfg)).check_order(engine.portfolio, symbol, leverage)
  → pending[token] = (body, monotonic()+300s)，返回 {token, preview}
POST /api/order/confirm {token}
  → 过期/复用（`pop` 单用）→ 400 "invalid or used token"
  → paper_only → ExecutionEngine.place(...)                ← 跨模块 src_risk_execution
  → live       → McpDataClient.start() → LiveBroker(enabled=True, confirm=lambda:True)  ← 跨模块外部依赖
```
```
WS /api/ws → 收 {"op":"subscribe","args":[{channel:"candle",category,symbol,timeframe}]}
  → series_key 四元组入 subs（幂等）
  → 首帧 action:"snapshot"  ← _snapshot()（含 levels / macd_hist / portfolio）
  → stream.add_listener(...) → 事件更新经 1.0s 节流后以 action:"update" 下发
    · candle `update` 帧 data 只携 {last_candle, price}（无指标/levels）
    · 发送前比对 candle_sent_open_time，更旧的 open_time 不下发 last_candle ← 保序不变量
  → 断连按四元组清理 listener；重连（幂等）不重复抬上游 refcount；水位随退订重置
```
```
lifespan 启动顺序（失败均 best-effort 记日志，不阻断启动）
  blockbeats_cache.has_cache()→refresh_all → BlockBeats cron 调度器
  → schedule_interval_seconds>0 才启动 ingest scheduler(build_rest_scheduler) + orchestrator
    （AgentCycle 内联构造：engine/journal/MemoryStore/run_control/news_provider=_news_digest/
      complete=make_complete(config_store.provider_config())，`data_pull=None` 避免双拉）
  → dlquant.warmup() → stream.start() / market.start() / news_broker.start()
  → 收尾 await stream.stop()/market.stop() + news_broker.stop() + cache/ingest/orchestrator shutdown(wait=False)
```

## 实现约束清单

### 必须实现的函数 / 行为

| 函数 | 所在文件 | 说明 |
|---|---|---|
| `create_app(...)` | `webapi.py` | 应用工厂：依赖以参数注入且**默认自建**，保证 CLI 可零参启动（`market-data serve`）、测试可注入替身。新增外部 IO MUST 走这里 |
| `ConfigStore.save` | `appconfig.py` | MUST 用 `ProviderConfig`/`RiskConfig` 构造器做校验（复用内核校验）——非法值拒绝且不写盘 |
| `ChartStore._validate_state` | `chartstore.py` | `pane` 只允许 `"candle"\|"sub"`；`indicators[].name` 必为字符串；`drawings` ≤ 100；`layers` 的键为布尔值（sr/structure/smc）。**`_EMPTY_SERIES_STATE["layers"]={"sr":True,"structure":True,"smc":False}`——smc 图层默认关，改变默认值会改变用户看到的图** |
| `AlertStore.create/update` | `alertstore.py` | 键名与字段与前端 `Alert` 类型一致（`createdAt` 驼峰、`id` 12 位、`enabled`/`triggered` 布尔），结构镜像前端类型才能让服务端/localStorage 两种数据源 interchangeable |
| `settle_close` | `execution.py` | `/order/confirm` 纸面下单 MUST 走它，不得在路由内自算 margin/notional。**注意：`PaperBroker` 的加仓按 notional 加权平均入场价，`/portfolio` 直接暴露 `positions`（`max_adds` 语义见 `src_risk_execution.md`）** |

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `MAX_CANDLE_LIMIT` / `/candles/recent` 上限 | `500`（超限 422 "limit must be within 1..500"） | `webapi.py` | 单响应体积上限 | 读取限量约束 |
| `PENDING_TOKEN_TTL_SECONDS` | `300` | `webapi.py` | 预览令牌 TTL | `live-safety` |
| `MAX_JOBS` | `200` | `webapi.py` | 超出时按插入序淘汰已完成 job、**保护 `running`** | 内存有界（重启即清空） |
| 回灌并发 | `Semaphore(2)` + per-series lock；`max_pages` 夹 `1..20`（否则 422） | `webapi.py` | 同时最多 2 个 series 回灌 | 频控保护 |
| `analyze_min_rows` / `/structure` 下限 | 均为 `30` | `webapi.py`（`analyze`、`levels_endpoint`、`structure`、`agent_decide`、`agent_cycle`） | 低于即 422（明确拒绝而非静默返回近似结果）；`/levels` 走 `df.empty` 判定而非 30 行 | 接口一致性 + 分析层最小样本要求 |
| `/news/history` `limit` | 1..200（默认 100） | `webapi.py` | 分页窗口 | 与 buffer 500 配套 |
| `REQUIRED_FIELDS` / `CONDITIONS` | `(symbol,condition,threshold)` / `(above,below)` | `alertstore.py` | 告警最小字段 | `alerts-backend` |
| `BACKFILL_FALLBACK` | 路由顺序写死在端点：`backfill_before_rest(parallel=True, page_limit=v3_candle_page_limit, page_delay=backfill_page_delay)` → 异常/空页时回退 `backfill_before`（MCP） | `webapi.py` | REST(v3) 优先、MCP 兜底 | `v3-history-channel` |

### 设计决策（选型记录）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|---|---|---|---|
| 实时帧生成 | 事件投递只读 buffer（1s 节流 + pending-latest 合并丢中帧）+ 5s 低频携带指标/S-R 的 snapshot 补全 | 每帧现算指标 | 指标/S-R 重算 MUST NOT 出现在事件投递路径（拖垮事件循环），重算只做低频 |
| 下单安全 | 二次确认（预览 token + TTL） | 单步下单 + 前端弹窗 | 弹窗可绕过，token 过期即失效 |
| 本地持久化 | JSON 文档存储，各自有上限（告警无上限、图表画线 ≤100/series、回测历史 ≤20 runs） | SQLite | `→ openspec/specs/system-architecture/spec.md`（明确避免重型 ORM/DB，且已有同类实现） |
| 配置校验 | 复用 dataclass 构造器：`ProviderConfig(**data["provider"])` 与 `RiskConfig(**data["risk"])` | 写一套 JSON Schema | 内核与接口层同源校验，杜绝漂移 |
| 行情镜像 | 所有 `/tickers`/`/books`/`/trades` 只读现有镜像（REST 播种），不阻塞等待 WS | 按需拉上游 | 上游 WS 有握手开销；镜像缺失要区分「上游不可达」(4xx/502) 与「无数据」(空数组) |
 | 测试隔离 | 所有外部 IO 以工厂/参数注入 | patch 全局 | L2 必须在无外网下全通过（非 `--live` 用例） |

## 边界

- ✅ 可新增只读转发端点；可把新配置项接进 `ConfigStore`（复用构造器校验）；可对 GET 路径加缓存/裁剪。
- ❌ 禁止在路由函数里写业务规则或算指标（业务逻辑必须沉到已有内核模块）。
- ❌ 禁止把回测/拉取写成同步长请求。
- ❌ 禁止新增绕过 `ExecutionEngine` 与两闸门的直接下单通道。 （来源: `openspec/specs/live-safety/spec.md`）
- ❌ 禁止把 `/` 绑到 0.0.0.0：`create_app()` 不内置鉴权与 CORS，本服务按「本机自用（127.0.0.1）」设计，暴露到局域网属明确禁忌；`/health` 会泄漏 `live_enabled`/`kill_switch` 状态。
- ❌ 禁止把 `ChartStore`/`AlertStore` 文件改成「追加不清理」：`chart.json` 每 series 上限 100，整体无清理。
- ⚠️ 修改任何错误码、响应键名或 `/ws` 协议字段都属于**契约变更**，MUST 同步 `frontend/src/api/types.ts` 与 L2 `test_webapi.py`（双端手工同步）。

## 变更风险

| 改动 | 破坏什么 | 后果 |
|---|---|---|
| 换掉 `Series(category,symbol,timeframe)` 构造或跳过 `_normalize_timeframe`| `1M`（月）与 `1m`（分）大小写归一；`factors.py:FEATURE_COLUMNS` 的因子列序也是隐式契约 | 读到错误周期或空数据；因子静默取到错误列、`memory` 情境特征错位 |
| 绕过 `store.read` 自拼 DataFrame（不去重） | `e2e-data-integrity` 的「升序无重复」契约 | 图表空洞/重复 bar |
| 动 `_BACKTEST_ALLOWED_KEYS`/`_SWEEP_PARAM_KEYS`/`_WALKFORWARD_PARAM_KEYS`/`_MODEL_PARAM_KEYS`/`_BACKTEST_MONEY_KEYS`/`_VALID_MODELS` 六组白名单 | spec 要求「未知参数拒绝」→ 目前以 `params⊆BACKTEST_ALLOWED_KEYS` 实现 | 未知键静默被忽略（而非 422），或被误拒 |
| 删 `_snapshot` 的「parquet 为空仍发实时 bar」分支 | **`/candles` 无 buffer/store 时 MUST NOT 抛 5xx**（应正常返回空数组）；`/ws` 新订阅时 buffer 为空 MUST 回 `{error:"no data"}`，前端据此显示「等待数据」占位而非丢弃连接（`/candles` 端点本身无 `no data` 错误体） | 前端占位与提示逻辑失效；新切换 symbol 无历史时永久收不到任何帧 |
| 让 lifespan 的某个 best-effort `try/except` 变成抛异常 | 「外部依赖不可用不阻断启动」约定 | 开发环境无 npx/无 akshare 时服务整个起不来 |
| 只改 `webapi.py` 路由而不改 `frontend/src` | 手工维护的 TS 类型；L2 会验 33 个端点的 roundtrip | 前端运行时 undefined / 门禁失败 |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/`（仅提炼接口契约与边界要点，非完整转录）

- **应用骨架**：应用工厂可创建 FastAPI 应用，MUST 默认绑定 `127.0.0.1`，提供 `GET /health`（200 + 状态）与 OpenAPI 文档，且非法参数失败 MUST 返回带错误信息的统一 JSON 与合适状态码（MUST NOT 冒成未处理 500）。（来源: `openspec/specs/api-core/spec.md`）
- **参数校验是端点契约的一部分**：非法 timeframe/category → 400；超限参数 → 422；未知 symbol → 空结果（不是错误）；未知告警 id → 404；blockbeats 不支持的端点 → 400。`GET /candles` 的 `limit` MUST 与 `/candles/recent` 同界：<1 或 >500 直接 422（默认 500），MUST NOT 静默截断或按超限值读盘。数据不足以分析时 MUST 返回明确提示而非 500。（来源: `openspec/specs/e2e-live-api/spec.md`、`openspec/specs/market-endpoints/spec.md`）
- **行情端点 MUST 接受原生全集中的任一级别**（含月级；按 `models.py` 为准的 15 个粒度标识 / 14 个可回灌级别，见 `src_data_store.md` 的规格计数偏差说明），且 MUST NOT 因大小写归一化把月级与分钟级折叠成同一 series——两者返回的标识 MUST 不同；非原生级别 MUST 明确拒绝而不是静默返回他级数据。（来源: `openspec/specs/market-endpoints/spec.md`、`openspec/specs/timeframe-identifier-scheme/spec.md`）
- **实时缓存端点语义**：`GET /candles/recent` SHALL 返回与 `/candles` 相同的数据形状（无数据返回空列表）；对仅实时级别 MUST NOT 调用交易所历史接口补种，同时 SHALL 建立该 series 的实时订阅。（来源: `openspec/specs/market-endpoints/spec.md`）
- **后台 job 契约**：回测与拉取按 job id 异步暴露进度/结果；状态字典 MUST 有固定上限并**最旧优先淘汰**，被淘汰 id 的查询 MUST 返回结构化 404，进程内状态 MUST NOT 无限增长。（来源: `openspec/specs/market-endpoints/spec.md`）
- **`/ws` 订阅协议**：`{"op":"subscribe","args":[{"channel":"…","category":"…","symbol":"…"}]}` / `unsubscribe` 帧驱动，回推 `{"channel","symbol","action":"snapshot|update","data"}`，新订阅 MUST 先 `snapshot` 再 `update`，断连 MUST 释放该连接全部订阅并停止推送；`{symbol:"default"/"*"}` 的 ticker 通配订阅 SHALL 周期推 `snapshot` + `update` 并与精确订阅共存（按 category 投递）。行情镜像 REST 快照端点为 `/tickers`、`/books/{category}/{symbol}`、`/trades/{category}/{symbol}`、`/funding`、`/mark-price`、`/instruments`，未订阅数据返回空。（来源: `openspec/specs/realtime-ws/spec.md`、`openspec/specs/exchange-data-hub/spec.md`、`openspec/specs/multi-market-hub/spec.md`）
- **实盘两步下单的 token 契约（易被简化）**：提交阶段 MUST 只做风控预检并返回一次性 token、**MUST NOT 下单**；预检不通过 MUST NOT 发 token；确认阶段携带 token 才经闸门执行。token MUST 有界有效期（超时视为无效：确认 MUST 返回结构化 400 且 MUST NOT 执行下单）、MUST 一次性（命中即失效），并且服务端 MUST 清理过期 token 以免待确认表无限增长。（来源: `openspec/specs/live-control/spec.md`）
- **运行控制三态读写不对称（现状）**：kill-switch、实盘开关（默认关）、全局启用标志（默认启用）三者 SHALL 均可经控制端点读取与设置；当前路由只提供 `PUT /control`（设置并回返当前状态），而 `GET /control` 未单独定义——新增读写对称的查询能力时 MUST NOT 改变现有 `PUT` 响应形状（前端依赖）。（来源: `openspec/specs/live-control/spec.md`、`backend/src/market_data/webapi.py` 路由表）
- **配置端点**：provider/risk 参数、系统提示与手动规则的读写 MUST 持久化到本地 JSON，写入 MUST 复用配置构造器校验取值，非法 MUST 拒绝；因子配置同样经 `/config` 持久化，**旧配置缺 `factors` 键时 MUST 无报错按默认因子集处理**。（来源: `openspec/specs/config-persistence/spec.md`、`openspec/specs/factor-workbench/spec.md`）
- **警报与图表数据的持久化底线**：`/alerts` 的 GET/POST/PUT/DELETE MUST 落库 `data_dir` 并跨设备/会话保持（重启后仍在）；前端本地态不得成为唯一真相。图表画线/告警等文档型存储各自有容量上限（如每 series 100 条），回测历史 ≤ 20 条且列表只回轻量元数据。（来源: `openspec/specs/alerts-backend/spec.md`、`openspec/specs/backtest-history/spec.md`）
- **Agent 端点边界**：决策类端点只出建议、循环端点才带执行与日志读取（`/journal`、`/portfolio`）；日志与组合端点 MUST 保持只读语义。（来源: `openspec/specs/agent-endpoints/spec.md`）
- **回归门禁（改端点即改 L2）**：L2 以隔离数据目录 + `MD_SCHEDULE_INTERVAL_SECONDS=0` 拉起真实 uvicorn，对规格枚举的 **33 个 REST 端点**逐一验证成功路径（`/health`、`/candles`、`/candles/recent`、`/candles/backfill`、`/analyze`、`/levels`、`/structure`、`/backtest`、`/jobs/{id}`、`/tickers`、`/books/{cat}/{sym}`、`/trades/{cat}/{sym}`、`/funding`、`/mark-price`、`/instruments`、`/config`(GET/PUT)、`/chart-config`(GET/PUT)、`/alerts`(CRUD)、`/agent/decide`、`/agent/cycle`、`/portfolio`、`/journal`、`/control`、`/order`、`/order/confirm`、`/blockbeats/newsflash/{type}`、`/blockbeats/data/{endpoint}`），并覆盖错误路径（400/404/422）；除显式 `--live` 用例外 MUST 在无外部网络下全绿（历史靠种子 parquet、agent 靠确定性 `RuleBasedProvider`）。
  ⚠️ **已知清单缺口**：代码实际还路由了 `/backtest/history`（list/detail/delete）、`/backtest/sweep`、`/backtest/walkforward`、`/dl/features`、`/news/{categories,context,health,history,stream}`、`/blockbeats/data/refresh` 等，**未进入上述 33 端点的 L2 清单**；改动这些端点时无现成回归网兜底，MUST 手工验证并顺手补 L2。（来源: `openspec/specs/e2e-live-api/spec.md`与 `backend/src/market_data/webapi.py` 路由表比对、`openspec/specs/e2e-live-ws/spec.md`）
