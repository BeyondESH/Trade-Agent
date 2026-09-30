---
type: "Fragment"
id: backend/tests/l2_live
title: "全栈 E2E 测试门禁层 / L2 真实进程 API 与 WS 契约"
description: "真实 uvicorn 进程下的全部 REST 端点与 /ws 通道，各自的成功路径、错误语义和离线兜底是什么？"
parent: /backend/tests/_overview.md
fragment: l2_live
entity_names:
  constants:
    - name: CAT
      value: "USDT-FUTURES"
      source: backend/tests/test_live_api.py
    - name: pytestmark（L2 两个模块）
      value: "pytest.mark.live"
      source: backend/tests/test_live_api.py、backend/tests/test_live_ws.py
    - name: online 子集用例
      value: "3 个（test_blockbeats_data_online / test_blockbeats_news_online / test_backfill_online）"
      source: backend/tests/test_live_api.py
    - name: 共享 client 超时
      value: "15.0 秒（httpx.Client(base_url=live_server, timeout=15.0)，module 级）"
      source: backend/tests/test_live_api.py
    - name: _recv_until 超时
      value: "5.0 秒（等待匹配 WS 帧的上限，超时即 AssertionError）"
      source: backend/tests/test_live_ws.py
    - name: WS 连接超时
      value: "open_timeout=10, close_timeout=5"
      source: backend/tests/test_live_ws.py
    - name: 作业轮询上限
      value: "120 次 x 0.25s（≈30s）；未在窗口内结束即 AssertionError"
      source: backend/tests/test_live_api.py:_run_backtest_done
    - name: 新鲜度告警的最小 bar 数
      value: "30（/agent/decide 少于 30 根 bar → 422）"
      source: backend/tests/test_live_api.py:test_agent_insufficient_data
retrieval_hints:
  - "后端 REST 接口在真实进程下的成功/失败语义分别是什么？哪些非法参数返回 200 而不是 400？"
  - "WebSocket /ws 的订阅帧、快照帧、错误帧长什么样？"
  - "为什么 `pytest -q` 里这些用例是 skipped？要跑它们该敲什么命令？"
  - "回测任务（/backtest + /jobs/{id}）在真实进程里怎么轮询到完成？"
  - "L2 用例为什么会出现 47 errors / startup 超时？如何调启动上限？"
  - "⚠️ 如果你要找的是接口的业务定义（请求/响应字段完整 schema），不在这里，在 openspec/specs 与 backend/src 的 market_data.webapi"
  - "⚠️ 如果你要找的是 TestClient（不起进程）的 Web API 断言，不在这里，见 backend/tests 的 tests_webapi_contract.md"
  - "⚠️ 如果你要找的是浏览器端到端旅程，不在这里，在 frontend/tests（Playwright L3）"
  - "新增 L2 用例必须写进 test_live_api.py / test_live_ws.py 并保持模块级 pytestmark=live，不可另建未打 marker 的文件"
architectural_role: "真实进程合约层；以子进程 HTTP/WS 证明部署态行为，不参与任何生产调用路径"
---

## 对外接口（本子模块消费的进程接口）

> 方向均为「测试客户端 → 真实 uvicorn 子进程」，`base_url` 来自 `conftest.live_server`。

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `GET /health` | test → server | `status` | 就绪与存活；同时被 fixture 用作权威就绪信号 | `test_health` |
| `GET /candles` | test → server | `category`,`symbol`,`timeframe`,`limit` | 历史读路径；**未知 timeframe/category/symbol 返回 200 + `count=0`（宽容），而非 400** | `test_candles_seeded`、`test_invalid_timeframe_lenient` |
| `GET /candles/recent` | test → server | `limit` | 实时缓冲读路径；`limit` 越界 → **422** | `test_candles_recent`、`test_limit_overflow_rejected` |
| `GET /analyze /levels /structure` | test → server | `symbol`,`timeframe` | 指标/支撑阻力/结构引擎的进程态输出 | `test_analyze`、`test_levels`、`test_structure` |
| `POST /backtest`、`GET /jobs/{id}` | test → server | `job_id`,`status`,`result` | 异步作业；`/jobs/{未知 id}` → **404** | `test_backtest_and_job`、`test_job_not_found` |
| `POST /backtest/sweep`、`/backtest/walkforward` | test → server | `thresholds[]`,`n_splits`；fold 需 `train_end < test_start` | 参数扫描与滚动训练（防未来函数泄漏的硬约束） | `test_backtest_sweep_live`、`test_backtest_walkforward_live` |
| `GET/PUT /config`、`/chart-config` | test → server | `provider.kind == "rule"` | 配置回读；非法体 → 4xx | `test_config_roundtrip`、`test_config_invalid_rejected` |
| `GET/POST/PUT/DELETE /alerts` | test → server | `id`,`symbol`,`condition`,`threshold` | 告警 CRUD；删除不存在 id → **404 或 405（路由层先于业务层）** | `test_alerts_crud`、`test_alerts_delete_missing` |
| `POST /order` → `POST /order/confirm` | test → server | `token`,`preview`,`approved`,`filled`,`live` | 两段式下单；确认必须 `live is False`（默认纸面交易）；未知 token → 400 | `test_order_confirm_token_flow`、`test_order_confirm_unknown_token` |
| `PUT /control` | test → server | `kill_switch` | 拉闸后 `POST /order` → **403**；用例在 `finally` 中恢复 `false` | `test_order_kill_switch_blocked`、`test_control_roundtrip` |
| `POST /agent/decide`、`/agent/cycle` | test → server | `action ∈ {open, close, hold}`、`reason`、`decision` | 规则型 provider 决策；bar 不足 → **422** | `test_agent_decide_rule_based`、`test_agent_insufficient_data` |
| `GET /portfolio`、`/journal` | test → server | `positions`（dict） | 空态结构；被订单用例当作「共享状态探测」使用 | `test_portfolio_empty`、`test_journal_empty` |
| `GET /tickers /books/{cat}/{sym} /trades/{cat}/{sym} /funding /mark-price /instruments` | test → server | `asks`,`bids`,`trades`,`funding`,`mark_prices`,`instruments` | 上游依赖端点的**离线兜底契约：200 + 结构正确的空容器**，不是 5xx | `test_books_offline_structured` 等 |
| `GET /backtest/history[/{id}]`、`DELETE .../{id}` | test → server | 列表 meta 字段集；详情含 `trade_list`,`series.equity` | 自动落盘的回测历史；列表「保持轻量」（不含 `trade_list`/`series`），详情/删除/二次删除 → 404 | `test_backtest_history_auto_saved` |
| `WS /ws` | test → server | `{op:"subscribe",args:[{channel,symbol,category,timeframe}]}` | 通道：`candle`/`ticker`/`books`/`trade`；快照帧 `action=="snapshot"` + `event=="subscribed"` | `test_ws_candle_snapshot`、`_sub_candle` |
| `WS /ws`（ping/pong、异常输入） | test → server | `{event:"ping"}` → `{event:"pong"}` | 非法 JSON 帧不得关闭连接；订阅后 ping 仍要能收 pong | `test_ws_connect_and_ping_pong`、`test_ws_malformed_frames_ignored` |
| `@pytest.mark.online` 子集 | test → server → 外网 | — | `/blockbeats/data/us10y`、`/blockbeats/newsflash/important`、`/candles/backfill`（真实 v3 回填） | `test_backfill_online` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/tests/infra`（conftest） | L2 全部用例通过 session 级 fixture 获得真实进程与种子数据 | `live_server`、`bitget_reachable`、`blockbeats_reachable` | extracted |
| `backend/src`（webapi） | 被 `uvicorn market_data.webapi:create_app --factory` 拉起，是断言对象本体 | `create_app`、各路由 | extracted |
| `backend/src`（market_data.store/models/config） | 种子数据与 `MD_DATA_DIR` 解析路径 | `ParquetStore`、`Series`、`Settings` | extracted |
| 第三方 `httpx` / `websockets` | HTTP 与 WS 客户端（无 pytest-asyncio 依赖，用 `asyncio.run` 同步风格） | `httpx.Client`、`websockets.asyncio.client` | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| CI（L2 独立 job） | `python -m pytest -m live --run-live`，全部用例共享单个 `live_server` | `pytestmark = pytest.mark.live` |
| `openspec/specs/e2e-live-api`、`e2e-live-ws` | 把这 50 个用例当作端点/协议覆盖率的验收口径 | Requirement 列表 |
| `frontend/tests/e2e`（L3，推断关系待人工复核） | L3 依赖同一份 webapi 行为；L2 的宽容语义（未知参数返回 200 空数据）是 L3 断言的前置事实 | `live_server` 行为子集 |

## 典型调用链

### 真实进程 REST 断言
```
pytest -m live --run-live
  → conftest.py:live_server                            ← 跨模块：backend/tests infra
    → test_live_api.py:client（module 级 httpx.Client, timeout=15s）
      → client.post("/order", {...})                   ← 本模块入口（进程合约）
        → 真实进程 market_data.webapi: /order → 风控 → token
          → client.post("/order/confirm", {"token": ...})
            → GET /portfolio 断言出现 SOLUSDT 仓位（纸面成交，live=False）
```

### 异步回测作业
```
POST /backtest {category,symbol,timeframe}
  → _run_backtest_done 轮询 GET /jobs/{job_id}（120 x 0.25s）
    → status != "running" → 断言 status=="done"
      → GET /backtest/history（列表须含 id/created_at/metrics/data_meta，且不含 trade_list/series）
        → GET /backtest/history/{id} → DELETE → 再 GET 404 → 再 DELETE 404
```

### WS 协议
```
websockets.connect(ws://127.0.0.1:{port}/ws)
  → send {"op":"subscribe","args":[{channel:"candle",...}]}    ← 本模块入口
    → _recv_until(action=="snapshot" and channel=="candle")     ← 超时 5s 即 fail
      → _recv_until(event=="subscribed")
        → 动态 unsubscribe 后 SHALL NOT 再收到该 symbol 业务帧
```

## 实现约束清单

> 实现本子模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须遵守的接口语义（**按实测行为写断言，不按计划写**）

| 场景 | 实测语义 | 断言写法 | 约束由来 |
|------|---------|---------|---------|
| 未知 timeframe（`xyz`）/ 未知 category（`BADCAT`）/ 未知 symbol（`NOPE`）访问 `/candles` | `200` + `count == 0` | `assert r.status_code == 200 and r.json()["count"] == 0` | V1 侦察结论：「非法 timeframe/category → 200 + 空数据，而非 400；错误路径断言须据此设计」（`/candles` 对未知 series 宽容） |
| `limit` 越界（0 / -1 / 501 / 100000） | `422`（模型校验层拦截） | `assert r.status_code == 422` | 声明式校验发生在路由前，与「业务宽容」不冲突 |
| `DELETE /alerts/{不存在 id}` | `404` **或** `405` | `assert r.status_code in (404, 405)` | V1 侦察：路由层先于业务校验返回，测试必须容忍两种语义 |
| 上游依赖端点（tickers/books/trades/funding/mark-price/instruments）离线 | `200` + 空但结构正确的容器 | 只断言「键存在且类型是 list/dict」，不断言非空 | 离线优先原则：不得因断不上外网而红 |
| `/order/confirm` | 必须先 `POST /order` 拿 `token`；确认响应含 `approved/filled/live`，默认 `live is False` | 三步：order → confirm → portfolio 回读 | 纸面交易默认 + 实盘双闸（见 tests_offline_quant_trading） |
| `/agent/decide` bar 不足（种子只有 48 根的场景之外，用全新 symbol 强制 <30） | `422` | 用 `NEWSYM` 触发；不得用「恰好 30 根」的脆弱边界 | 错误路径需可复现，不能依赖种子 bar 数的巧合 |

### 必须实现的函数（本子模块内的公共设施）

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `_series_qs(symbol, timeframe)` | `test_live_api.py` | 统一 querystring 构造；新端点用例复用，避免参数名拼写漂移 |
| `_run_backtest_done(client, **extra)` | `test_live_api.py` | 提交 + 轮询 `/jobs` 直到非 running；**不得**改为 sleep 固定时长 |
| `_backend_reachable`（infra 提供） | `conftest.py` | 就绪判定复用，勿在 L2 用例内重复实现 |
| `_connect` / `_recv_until` / `_sub_candle` / `_sub` / `_unsub` / `_run` | `test_live_ws.py` | WS 帧谓词式收取；`_recv_until` 以「匹配谓词」而非「第 N 帧」定位，避免推送与 ack 顺序耦合 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| L2 WS 的实时性断言 | 协议层离线稳定断言（连接/订阅/快照/错误/异常输入） + 真实推送仅做「单调不倒退」的宽松校验 | 断言必须收到 N 条真实 update 帧 | Bitget WS 不可达或安静时会让门禁无端变红；实时正确性由可注入假 stream 的 TestClient 层（`tests_webapi_contract.md`）保证 |
| 共享 session 进程的状态污染 | 用例先探测 `/portfolio`，非空则 `pytest.skip`，并在 `finally` 恢复 `kill_switch=false` | 每个用例独立起进程（成本不可接受）；靠执行顺序排序（脆弱） | `live_server` 是 session 级，订单/Agent/回测用例会互相消费同一个纸面孔位的保证金余量；显式 skip 是唯一稳定的写法 |
| WS 客户端 | 直接用 `websockets` + `asyncio.run` | 引入 `pytest-asyncio` | 不新增第三方依赖（该变更的 Non-Goal 之一） |

## 变更风险与边界约束

### 背景与权衡（为什么只能这样组织）

L2 的存在理由只有一句：TestClient 跑不出真实进程才有的行为。同进程测试共享解释器、事件循环和导入缓存，它能验证路由与业务分支，却验不到 socket 绑定、WS 握手、启动期调度注册、多请求并发下的锁交互，也验不到「用 `--factory` 从命令行起起来」这条真实部署路径。因此本层的价值与「起真进程」这件事绑死；但同一份价值也带来三种成本——冷启动慢、状态进程内共享、外部依赖（Bitget / BlockBeats）不可控——本层的每一条写法都是在为这三种成本付账。

第二种成本最容易被低估：`live_server` 是 session 级，端口、数据目录、配置存储与纸面持仓都是**同一份可变状态**。于是断言必须写成「不假设起点」的形态——先探测再决定断言或 skip、写后立即回读、改完必恢复。任何「这个用例排在前面所以应该拿到干净状态」的想法都是伪命题：`-k` 过滤、`--lf`、CI 的 job 切分都会改变顺序。与之配套的是**分层超时**：外层用 `_recv_until` 之类的小窗口快速定位目标帧、内层用作业轮询的有限循环（而不是 `sleep`）等结果，最外层才是进程就绪的自适应上限——三者语义不同，不可合并成一个「大超时」。

第三种成本的处理原则是「离线也必须是有效断言，而不是跳过一切」。因此本层区分出三个等级：真值断言（种子数据上的历史读路径）、结构断言（上游依赖端点返回「合法的空」）、以及可选真值断言（`online` 子集）。第二级看着宽松，但它的业务含义很硬：**数据缺失不得变成 5xx**——前端的宽容策略与告警面板都建立在这条之上；把「空」写成「错」会让离线环境与断网用户同时看到一片红。

最后是关于实测与预期的冲突处理顺序：当本层断言与规格文本不一致时，先复跑实现确认实际行为，再改规格。本层的错误路径记录（未知参数返回 200 空、缺失 id 的删除可能得 404 或 405）就是这条流程留下的痕迹；把断言按「应该怎样」写回去，只会得到一个永远红的层。



**变更风险（改动本层会破坏什么）**

- 把「未知 timeframe/category 返回 200 空数据」改写成断言 400 → 与真实实现冲突，L2 常红；反向若有人把 webapi 改成 400，本层会第一个发现契约漂移。**任何一侧修改都必须同步另一侧 + `openspec/specs/market-endpoints`。**
- 删除 `test_alerts_delete_missing` 对 `405` 的容忍 → HTTP 路由注册顺序变化（例如新增 `DELETE /alerts/{id}` 之外的同前缀路由）会让 L2 随机红。
- 让某用例假定「`/portfolio` 初始为空」 → session 级共享状态下与 `test_agent_cycle`、`test_order_confirm_token_flow` 顺序耦合，重现 `fix-live-test-order-flake` 修掉的抖动。
- 在 L2 用例里直接读取真实 `backend/data/parquet` 或断言「数据新鲜」 → 破坏 `MD_DATA_DIR=<tmp>` 的隔离前提，结果依赖本机是否恰好跑过后端。
- 去掉两个模块的 `pytestmark = pytest.mark.live` → 普通 `pytest -q` 会重新收集 L2（历史证据：修复前「47 errors」），单元回归不再快速可复现。

### 失败模式复盘（本层如何与真实故障对应）

- **顺序污染**：`/portfolio` 与 `/control` 是本层唯一的跨用例可变状态。纸面持仓的保证金余量被前一个用例吃掉后，后一个下单用例会拿到「风控无余量」的 400，且失败随 `-k` / `--lf` / 分片而变——这类间歇故障最难复现。对策不是固定顺序（pytest 的顺序不是契约），而是写成「先探测、非空即 Skip」，让断言只在它成立的前置下执行。
- **把宽容语义断成 400**：规格文本写「非法参数 400」，而实现选择了对未知 series 返回 200 + 空数据。若 L2 按字面实现语义断 400，会出现「代码没错、测试红」的僵局，最终有人把路由改成 400 —— 而前端切币时恰恰依赖 200 空数组（否则会弹错误提示/触发重试）。本层的实测记录就是防这种误改的护栏（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` V1）。
- **上游缺席被断成 5xx**：`/tickers`/`/books`/`/instruments` 在离线只应有空容器。如果把它们写成 `status_code == 200 and len(...) > 0`，测试就变成网络健康探针，CI 也随之失去意义。第二级（结构断言）就是「合法的空」的表达法，它同时也是对前端的契约：**没数据不许报错**。
- **就绪窗口与真实推送混为一谈**：WS 的实时更新是否到达取决于上游订阅与行情活跃度；把它写成必须收到 N 帧会制造无法修复的抖动。本层的做法是把「协议」与「实时性」分开——协议层永远断，实时性只在有帧时断单调不倒退（`test_ws_event_frames_monotonic_if_live`），真推送冒烟放 `online`。
- **把 `--run-live` 与 `--run-online` 混用**：前者控制「是否起真进程」，后者控制「是否出网」。CI 起真进程是必要成本，出网不是；只传 `--run-online` 会让 L2 仍然跳过（缺 `--run-live`），只传 `--run-live` 才是 L2 的正确入口（来源: `AGENTS.md` 命令矩阵、`openspec/specs/ci-quality-gates/spec.md`）。
- **删除 `405` 容忍**：HTTP 层的路由匹配先于业务处理，`DELETE /alerts/{missingId}` 在同前缀路由增加后可能从 404 变 405。把它断成唯一状态码，等于把「路由注册顺序」变成隐式契约。

写本层用例的默认口径：先跑实现、再定 expected。如果实现与 `openspec/specs` 冲突， SHALL 先修 spec 与文档，再动断言；任何「让实现就范于旧文本」的改法都必须同时核对前后端两侧（`frontend/api` 类型定义与 UI 的空态处理都建立在这些语义上）。

### 本层与相邻层的责任边界

L2 与 Web 契约层（`tests_webapi_contract.md`）容易混淆，边界值得说清：本层断言的是「装配成一个真实服务之后仍然成立的部分」——TCP 端口、HTTP 服务器的参数校验中间件、启动期 lifespan 真的把调度器/编排器建起来了、WS 走真实 socket 栈（含分片、握手、关闭码），以及「用命令行 `--factory` 方式起起来」这条真实部署路径；TestClient 层则负责可注入的时序与替身。因此同一端点在两层都出现是刻意的：本层的价值在于**验证装配本身**，它的价值不在于重复业务分支。

同时，本层为「离线可运行」设定的底线不能被反向突破：一旦某个非 `online` 用例开始依赖真实上游（哪怕只是 `/tickers` 返回非空、哪怕只是「恰好本机有后端在跑」），L2 就从代码回归退化为环境探针——这正是 L1 新鲜度用例坚持用 skipif 而不是失败的原因（来源: `openspec/specs/e2e-live-api/spec.md`「离线可运行」、`AGENTS.md` L1 freshness 说明）。

**边界约束（什么能做、什么禁止）**

- L2 SHALL NOT 修改应用代码来通过测试；只能在测试基础设施/文档层修复（来源: `openspec/changes/archive/2026-09-20-fix-live-test-order-flake/design.md`「关键约束」）。
- 需要真实外网的用例 MUST 打 `@pytest.mark.online`（并在需要时依赖 `bitget_reachable`/`blockbeats_reachable` 做 skip），CI MUST NOT 传 `--run-online`（来源: `openspec/specs/ci-quality-gates/spec.md`）。
- 每个 REST 端点的成功路径 MUST 逐一覆盖，且数据变更类端点（PUT/POST）MUST 有回读断言（roundtrip）（来源: `openspec/specs/e2e-live-api/spec.md`）。
- 离线运行时非 `online` 用例 MUST 全绿：历史与回填基于种子 parquet，配置/告警基于临时存储，Agent 基于确定性 `RuleBasedProvider`（来源: `openspec/specs/e2e-live-api/spec.md`「离线可运行」）。
- 新增通道订阅 MUST 与 `streamhub`/`realtime` 的帧结构一致，不得在本层私自定义新字段语义（来源: `openspec/specs/e2e-live-ws/spec.md`「全通道订阅矩阵」）。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-live-api/spec.md`、`openspec/specs/e2e-live-ws/spec.md`、`openspec/specs/realtime-ws/spec.md`、`openspec/specs/realtime-candle-push/spec.md`、`openspec/specs/kline-realtime-order-guard/spec.md`、`openspec/specs/multi-market-hub/spec.md`、`openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md`（仅提炼需求/决策摘要，非完整转录）

- **全 REST 端点成功路径覆盖**：逐一验证 `/health`、`/candles`、`/candles/recent`、`/candles/backfill`、`/analyze`、`/levels`、`/structure`、`/backtest`、`/jobs/{id}`、`/tickers`、`/books/{cat}/{sym}`、`/trades/{cat}/{sym}`、`/funding`、`/mark-price`、`/instruments`、`/config`(GET/PUT)、`/chart-config`(GET/PUT)、`/alerts`(CRUD)、`/agent/decide`、`/agent/cycle`、`/portfolio`、`/journal`、`/control`、`/order`、`/order/confirm`、`/blockbeats/newsflash/{type}`、`/blockbeats/data/{endpoint}`；载荷结构 SHALL 与 `api/types.ts` / webapi 定义一致。
- **错误路径覆盖**：非法 timeframe/category、未知 symbol 空结果、超限参数 422、未知告警 id 404、blockbeats 未支持端点 400。
- **WS 契约**：连接建立与 ping/pong 语义、candle 首帧快照含 `last_candle`、后续 event 帧 `open_time` 单调不倒退、ticker/books/trade/mark-price/funding-rate 全通道矩阵、运行期动态订阅/退订生效、非法 channel/timeframe/symbol 必须回错误帧而非静默接受。
- **D5/D6 决策**：L2 WS 聚焦「连接建立、订阅协议、快照/错误语义」；实时推送冒烟放在线子集，避免无上游时 L2 空转或假红。
- **在线实时冒烟**：`--live` 模式下 Bitget WS 可达时，观测窗口内 SHALL 收到至少一条 candle 或 ticker 帧；不可达 SHALL skip 而非失败。
- **实时帧保序口径**：`kline-realtime-order-guard` 要求实时 candle 投递按 `category:symbol:timeframe` **独立**判实单调不回退（旧帧丢弃、同桶替换、新桶追加），且保序**只**作用于实时投递路径（历史加载与向左回填不受拦截）。L2 只在 `online` 子集做「已收到推送则 `open_time` 不得倒退」的宽松校验，严格的保序/跨周期不串台由 `tests_webapi_contract.md` 的可注入假 stream 层守。
- **品类集合以 `multi-market-hub` 为准**：仅 `SPOT` 与 `USDT-FUTURES` 建立行情镜像与订阅，规格明写 SHALL NOT 拉取 `MARGIN`/`USDC-FUTURES`/`COIN-FUTURES`；因此 L2 统一使用 `CAT = "USDT-FUTURES"`。注：较早的 `exchange-data-hub` 仍按五品类列举，属已被后续规格裁剪的历史口径——新增品类相关用例前先确认以哪份为准，不要直接拿它当白名单。（来源: `openspec/specs/multi-market-hub/spec.md`、`openspec/specs/exchange-data-hub/spec.md`）
- **WS 帧协议口径**：订阅/退订采用 `{"op":"subscribe","args":[{channel,symbol,category,timeframe}]}`，回推 `{channel,symbol,action:"snapshot|update",data}`，`candle` 的 `snapshot` 帧含最新 K 线 + 指标 + Top-N S/R，`update` 帧由事件驱动并只携带 `last_candle`/`price`（指标与 S/R 由 snapshot 与约 5s 低频快照提供）；心跳采用 Bitget 官方格式（ping → pong）。（来源: `openspec/specs/realtime-ws/spec.md`、`openspec/specs/realtime-candle-push/spec.md`、`openspec/specs/ws-series-routing/spec.md`）

**本节逐条来源对照**

> （来源: `openspec/specs/e2e-live-api/spec.md`）
> （来源: `openspec/specs/e2e-live-ws/spec.md`）
> （来源: `openspec/specs/kline-realtime-order-guard/spec.md`）
> （来源: `openspec/specs/multi-market-hub/spec.md`、`openspec/specs/exchange-data-hub/spec.md`）
> （来源: `openspec/specs/realtime-ws/spec.md`、`openspec/specs/realtime-candle-push/spec.md`）
> （来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md`）
