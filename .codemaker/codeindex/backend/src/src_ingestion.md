---
type: "Fragment"
id: backend/src/ingestion
title: "K 线拉取与深度回灌通道"
description: "从 MCP / Bitget v2 / v3 三条通道拉取 K 线、增量补缺口、向更早方向深度回灌的机制与边界是什么？"
parent: /backend/src/_overview.md
fragment: ingestion
entity_names:
  constants:
    - name: MARKET_TOOL
      value: "market"
      source: backend/src/market_data/ingestion.py
    - name: CANDLES_ACTION
      value: "candlesHistory"
      source: backend/src/market_data/ingestion.py
    - name: V2_MIX_CANDLES_URL
      value: "https://api.bitget.com/api/v2/mix/market/candles"
      source: backend/src/market_data/ingestion.py
    - name: V2_SPOT_CANDLES_URL
      value: "https://api.bitget.com/api/v2/spot/market/candles"
      source: backend/src/market_data/ingestion.py
    - name: V3_HISTORY_CANDLES_URL
      value: "https://api.bitget.com/api/v3/market/history-candles"
      source: backend/src/market_data/ingestion.py
    - name: MIN_NODE_MAJOR
      value: "20"
      source: backend/src/market_data/mcp_client.py
    - name: MD_AGENT_SCHEDULE_ENABLED
      value: "false（默认不自动交易/不自动重训；仅开 `agent_cycle` + `retrain` 两个任务）"
      source: backend/src/market_data/config.py
    - name: incremental_pull_rest
      value: "任务 id；同 `max_instances=1` + `coalesce=True`（不并发、不堆积）"
      source: backend/src/market_data/scheduler.py
    - name: parallel_workers
      value: "min(8, max(1, max_pages))（回灌并发拉页上限，ThreadPoolExecutor）"
      source: backend/src/market_data/ingestion.py
retrieval_hints:
  - "用户往图表左边翻页翻了本地没有的历史时，系统怎么按需补数据？"
  - "为什么某些很老的 K 线明明交易所没有，却被误判成『已到最早历史』？"
  - "定时任务只补最新一段缺口是怎么实现的？"
  - "MCP 桥为什么必须单后台事件循环 + 单 task 持有连接？"
  - "⚠️ 如果你在找『实时 bar 的 WS 订阅与镜像』，不在这里，在 `src_realtime.md`"
  - "⚠️ 如果你在找『一次性手工回填缺口（backfill_micro_gaps）』，不在这里，在 `backend/scripts`"
  - "⚠️ 如果你在找『Parquet 落盘与按日分片』，不在这里，在 `src_data_store.md`"
  - "本能力也叫『回填 / backfill / 补洞 / 越界回灌』，对应需求中的『历史深度拉取』"
  - "架构归属：新增拉取通道必须作为 `KlineIngestor` 的新方法或 `models.py` 的映射扩展，禁止新建独立 `fetcher.py`"
architectural_role: "数据接入通道层（外部交易所 → 本地 store），是历史数据唯一入口；不接触前端协议"
---

## 业务意图

本层解决的业务问题是：**在交易所频控、历史深度上限、MCP 工具能力三种约束下，把「用户想看到的更早历史」稳定地补齐且不打红测试**。Bitget 的三条可用通道各有不同特性——MCP 桥的 `candlesHistory` 约只覆盖最近 90 天、v2 REST 对日内周期约只给 30~150 天、v3 `history-candles` 能追到交易所真实最早历史但强制 100 行 / 90 天每页——且三条通道对「返回空页」的含义完全不同。本层把差异封装成单一方法族（`fetch_range` / `ingest_incremental` / `backfill_before` / `backfill_before_rest`），并统一输出 `ParquetStore.save` 可写的规范 OHLCV 帧。

**本层文件范围**：`ingestion.py`（三通道选择与游标翻页）、`mcp_client.py`（stdio 子进程桥）、`scheduler.py`（APScheduler 任务骨架）、`discover.py`（MCP 工具能力探测）、`cli.py`（`market-data` 命令入口）、`excel_export.py`（按 UTC 自然日分片写 `.xlsx`；数据源仍是 `ParquetStore` 读出的帧，导出失败 MUST NOT 影响入库）。

## 对外接口（内部通道）

| 接口 | 方向 | 关键参数 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `fetch_range(series,start,end)` | MCP 拉取 | 游标向早方向推进 | 通用区间拉取与页间衔接 | `ingestion.py:KlineIngestor.fetch_range` |
| `ingest_incremental(series,start,end)` | MCP 增量 | 读库后起点 + 仅拉缺口 | 按级别 step 补最新缺口，`0` 表示无增量 | `ingestion.py:KlineIngestor.ingest_incremental` |
| `find_gaps(series)` | 缺口检测 | 返回缺 `open_time` | 按 step 枚举缺失 bar | `ingestion.py:KlineIngestor.find_gaps` |
| `backfill_before(series,before_ms,…)` | **MCP** 深度回灌 | `(added, earliest_reached)` | 从已存最早 bar 继续向更早翻页；**受近端窗口限制，不能无限回溯** | `ingestion.py:KlineIngestor.backfill_before` |
| `backfill_before_rest(series,before_ms,…)` | **v3 REST** 深度回灌主通道 | `(added, earliest_reached)` + 逐页即时落盘 | 无限深回溯；`parallel=True` 走游标链并发 + `ThreadPoolExecutor` | `ingestion.py:KlineIngestor.backfill_before_rest` |
| `_fetch_v3_history_page` / `_fetch_v2_page` | 底层 | 返回原始 rows | 分页 HTTP 请求；`limit` 硬夹在 100 / 1000；429 转 `V2RestError("rate limit: …")` | `ingestion.py` |
| `run_incremental_pull(ingestor,settings)` / `run_incremental_pull_rest(store,settings)` | 定时任务 | 单目标失败仅记日志 | MCP 版给 CLI，REST 版给 webapi 常驻 | `scheduler.py` |
| `McpDataClient.call_tool(name,args)` | MCP 同步外观 | `with` / `.call_tool(name,args)` | 阻塞式返回 `structuredContent`；`McpError` 表传输/工具失败；每次 op 最多重试一次 | `mcp_client.py:McpDataClient` |
| `market-data <子命令>` | CLI | 子命令 `discover/pull/incremental/gaps/export/schedule/analyze/agent/memory/orchestrate` | `schedule --once <mcp>` 跑一次增量后退出；`pull --export` 同步产 Excel；`analyze` 打印指标/ S/R 末值 | `cli.py:main` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `models.py` | 有效级别、step、MCP granularity、`is_realtime_only_timeframe` | `timeframe_step_ms`、`timeframe_to_granularity` | extracted |
| `store.py` | 每页/每窗即时落盘（重试不丢进度） | `ParquetStore.save`、`latest_open_time` | extracted |
| `bitget-agent-mcp`（外部子进程） | 经 stdio 的 `market`/`order` 工具 | `McpDataClient.call_tool` | extracted |
| Bitget v2/v3 公共 REST | 回灌主通道与播种 | `httpx.get(V2_MIX_CANDLES_URL / V2_SPOT_CANDLES_URL / V3_HISTORY_CANDLES_URL)` | extracted |
| APScheduler | 周期任务 | `BackgroundScheduler.add_job(max_instances=1, coalesce=True)` | extracted |

**反向调用方**

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `src_data_store`（store） | 拉取结果必须去重合并落盘 | `ParquetStore.save`（`→ ingestion.py`） |
| `src_api_stores`（webapi） | `/candles/backfill`、`/candles/recent` 播种 | `create_app.backfill` |
| `src_agent_orchestration`（orchestration/scheduler） | 数据拉取任务注册 | `build_orchestrator(data_pull=…)` |
| `backend/scripts/backfill_micro_gaps.py` | 微缺口回填（走同一 `_fetch_v3_history_page`） | `KlineIngestor` |
| `backend/tests/test_offline.py` | 离线分页/退避行为回归 | `KlineIngestor` + fake MCP |

## 典型调用链

### 「越界翻页触发深度回灌」

```
frontend 历史预取策略（窗口余量触发）→ POST /api/candles/backfill
  → webapi.candles_backfill                                ← 接口层（非本模块）
    → KlineIngestor(None, ParquetStore, page_limit=100)    ← 本模块入口
      → backfill_before_rest(series, before=earliest)       ← 本模块（v3 主通道）
        ├─ backfill_before_rest_parallel（游标链 + ThreadPoolExecutor(min(8,max_pages))，整窗合并为一次 save）
        └─ _call_v2_with_backoff（指数退避 + page_delay）        ← 本模块
    → 与既有回灌用同一 per-series 锁 + 全局 Semaphore(2)          ← 接口层限并发（非本模块）
        → _fetch_v3_history_page → _normalize_payload → ParquetStore.save   ← 跨模块（src_data_store）
      → 失败时回退 KlineIngestor.backfill_before（MCP via McpDataClient）     ← 本模块兜底通道
    → 返回 {appended, earliest_reached}（游标链严格边界：首页 exclusive，后续 inclusive）
```

### 「常驻增量落盘」

```
uvicorn 启动 → FastAPI lifespan → scheduler.build_rest_scheduler(store, settings)
  → run_incremental_pull_rest(store, settings)      ← 本模块
      → 空库播种 / ParquetStore.latest_open_time → start_ms = latest + step   ← 跨模块 src_data_store
      → KlineIngestor 的 fetch_range 语义 / v3 分页补到 now
      → ParquetStore.save → 返回新增行数
```

### 「调度 Agent 周期」

```
lifespan → orchestration.build_orchestrator(settings)
  → 注册「保护性熔断平仓」任务（无条件）        ← 跨模块 src_risk_execution
  → if settings.agent_schedule_enabled: 注册 agent_cycle / retrain  ← 仅显式开时
MD_SCHEDULE_INTERVAL_SECONDS=0 → lifespan 完全不启动 scheduler
```

## 实现约束清单

### 必须遵守的通道选择规则

| 规则 | 位置 | 说明 |
|---|---|---|
| 深度回灌 MUST 走 v3 REST 通道 | `backfill_before_rest` | v3 是唯一可无限回溯到交易所真实最早历史的通道 |
| v3 单页 `limit = min(…,100)`；请求 `startTime/endTime` 区间 ≤ 90 天 | `ingestion.py` | 超限时交易所拒答 |
| 频控与并发保护 MUST 保留 | `MD_BACKFILL_PAGE_DELAY` + `backoff_base` 退避 + `parallel_workers=min(8,max_pages)` + webapi 的 `backfill_locks`(per-series) 与 `threading.Semaphore(2)` | 并发拉页不能突破全局并行约束 |
| 回灌 MUST 逐页/逐窗即时落盘 | `save` 在页循环与并发分支内 | 否则重试丢进度，用户看不到已拉到的数据 |
| 仅实时级别 MUST NOT 参与本层 | `is_realtime_only_timeframe` 短路返回 | `1s` 无历史查询、不回灌、不检缺口、不落盘 |

### 设计决策（两种方案均可行时的既有选型）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 回灌主通道 | v3 REST 优先，MCP 仅兜底 | 统一走 MCP | MCP 桥只能覆盖约 90 天且依赖 Node/npx 可用性；v3 可达交易所最早历史 |
| 「空页」的含义 | 受窗口深度限制的通道（MCP/v2）的空页不表示「到底了」；v3 空页 MUST 重试一次后才作为 `earliest_reached=True` | 见空页即终止 | 否则日内周期会永久缺失早于近端窗口的全部历史（本仓库曾为此专开 v3 通道）。空页的含义与通道绑定是刻意的语义区分。 （来源: `openspec/specs/v3-history-channel/spec.md`） |
| 并发分页的实现 | 预计算游标链（窗口 `min(90 天, page_limit*step)`）+ 线程池 + 合并去重 | 串行下一页 | 低周期深度回灌串行往返过慢，前端预取会明显等待 |
| 游标边界 | 首页 `open_time < before_ms`（严格）；后续页 `≤`（包含） | 全程严格 | 后续页最旧 bar 正好落在游标上，用严格比较会丢 bar；由 `save` 去重保证无重复 |
| 重试策略 | 指数退避 + 仅对 rate-limit 类错误重试（`_RATE_LIMIT_HINTS` 按异常文本匹配） | 全部错误重试 | 参数类错误重试只会浪费配额并掩盖真因 |
| 增量起点 | MCP/REST 共用 `latest_open_time + one step` | 固定回看窗口 | 固定窗口会重拉已存数据；`candle_page_limit` 只在播种路径使用 |
| MCP 桥线程模型 | 单一后台事件循环 + 一个长生命周期 async task 持有连接（请求经队列投递） | 每次调用新开 event loop | anyio task group 必须在同一 task 进出，否则出现跨 task teardown 错误；同时避免 npx 反复冷启动 |
| 任务生命周期 | `MD_SCHEDULE_INTERVAL_SECONDS` 设 `0` 即完全禁用调度 | 用环境变量总开关 | interval=0 不合法（会抛错），统一判断更不易漏（测试环境正是靠它避免落盘与编排抢资源） |

## 边界（能做什么 / 禁止什么）

- ✅ 可在本层新增「第四条通道」（如另一交易所），作为新私有方法复用既有游标、退避、`_normalize_payload`，并在 `models.py` 补级别映射。
- ❌ 禁止绕过 `ParquetStore.save` 直接写盘（会破坏去重语义与 L1 数据门禁）。
- ❌ 禁止新建独立 `fetcher.py`；通道代码统一归 `ingestion.py`，CLI `discover.py`（一次性探测 MCP 工具面）不注册 `market-data` 主入口。
- ❌ 禁止放宽并发约束（把 `max_instances` 改为大于 1、去掉 `coalesce=True`、把 `Semaphore(2)` / `parallel_workers` 调大、把 `MD_BACKFILL_PAGE_DELAY` 设成 0 后大批翻页）→ 触发频控退避乃至封禁、同 series 写入竞争。 （约束由来: 参数族 `backoff_base`/`page_delay`/`max_pages` 的存在与 webapi 的 `Semaphore(2)` 组合；频控数值属外部 API 文档，未在本仓库固化，**待人工复核**）
- ❌ 禁止在本层引入任何下单/账户类 MCP 调用：本层只读（`order` 类工具在 `execution.py` 的实盘闸门后）。 （来源: `openspec/specs/system-architecture/spec.md`「不得跨层直接访问 Bitget API 绕过风控执行层」）
- ⚠️ 本层依赖外部网络：测试必须用 `fetch_page`/`sleep`/`client` 注入 fake（签名已为此特意保留）；`_normalize_payload`/`_coerce_row` 是私有方法，被测试注入 mock 时改名会造成静默失败。

## 变更风险

- 改游标/`limit`/窗口逻辑 → 若与 `backend/tests/test_offline.py` 的 fake 返回集不一致，会表现为「门禁绿但数据缺 bar」的隐性漏拉（假通过）。
- 把 `earliest_reached=True` 的判定放宽/收紧 → 直接改变前端「已到最早」提示与「是否继续往前翻页」，影响预取消耗（收紧则重复打上游，放宽则出现空洞错觉）。 （来源: `openspec/specs/history-backfill/spec.md`）
- 去掉 MCP 兜底 → 离线/无网络环境（`backend/tests` L2 `--run-live` 的非 `--live` 用例、CI 依赖）的 `/backtest` 与 `/candles` 播种失败。
- `build_orchestrator` 里把熔断任务纳入 `data_pull` 开关控制 → `orchestration-jobs` 要求「熔断保护平仓任务 SHALL 始终注册且不受 kill-switch 影响」被破坏。 （来源: `openspec/specs/orchestration-jobs/spec.md`）

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **v3 是深度回灌的规范主通道**，且带三条硬上限：单次 `limit` ≤ 100 根、单次 `startTime/endTime` 区间 ≤ 90 天、频控 20 req/s。v3 持续失败（网络/非频控错误）时 SHALL 回退既有通道（v2 candles / MCP）尽力返回，MUST NOT 抛未处理异常中断前端加载。（来源: `openspec/specs/v3-history-channel/spec.md`）
- **`earliest_reached` 的语义边界（改错即造成永久停更）**：MUST 区分「渠道近端窗口深度上限」与「交易所真实最早历史」；该标记 SHALL 仅在可无限回溯通道（v3）对最旧窗口返回空页**且重试一次后仍为空**时成立；临时性空页（接口抖动、频控、窗口边界）SHALL NOT 判定为已到最早，也不得因此让该 series 在本次会话内永久停止回灌。（来源: `openspec/specs/v3-history-channel/spec.md`、`openspec/specs/history-backfill/spec.md`）
- **翻页不得留缝**：深度回溯 MUST 以该页最旧 bar 的 `open_time` 前移 `endTime` cursor，翻页 MUST NOT 产生时间缺口；越 90 天窗口的历史改由 v2 REST `endTime` 逐页前移获取，且 MUST 按品类选端点（合约 `/api/v2/mix/market/candles` + `productType`，现货 `/api/v2/spot/market/candles`），每页即时去重升序合并入库。（来源: `openspec/specs/v3-history-channel/spec.md`、`openspec/specs/history-backfill/spec.md`）
- **按需回灌的三条行为约束**：用户左翻越过本地最早 bar MUST 触发「仅缺失区间」的拉取并落库，随后 `/candles` MUST 能连续返回更早区间；选定 symbol 后 SHALL 后台预取当前周期，且 MUST 节流；预取与按需回灌命中同一区间时 SHALL 合并复用，禁止对同一区间重复请求。（来源: `openspec/specs/history-backfill/spec.md`）
- **增量与缺口校验的普适性**：拉取前 MUST 先查已存最新时间并只补缺口；步长 MUST 对全集所有提供历史查询的级别可解析（MUST NOT 因级别未登记而抛未支持异常）；仅实时级别 MUST NOT 参与历史拉取、落盘与增量/缺口校验。（来源: `openspec/specs/kline-ingestion/spec.md`）
- **定时增量的复用底线**：同一任务实现 MUST 同时支撑 CLI `schedule` 与 webapi lifespan 常驻，两种运行方式共享错误隔离策略；单目标失败 SHALL 只记日志且不影响下一轮；应用关闭时 scheduler MUST 正常 shutdown，不留后台任务。（来源: `openspec/specs/scheduled-ingestion/spec.md`、`openspec/specs/kline-history-gap-fill/spec.md`）
- **MCP 桥的环境底线**：以 stdio 子进程拉起 `bitget-agent-mcp`，MUST 自行管理连接、超时与重连；Node ≥20 缺失时 MUST 给出明确错误信息而非静默失败；MCP 异常终止 MUST 返回可识别错误而不拖慢启动（客户端 import 阶段 MUST NOT 抛错）。（来源: `openspec/specs/mcp-data-bridge/spec.md`）
- **频控是外部风险，不是内部细节**：回灌与预取 MUST 施加节流/限并发以避免触发 Bitget REST/MCP 频控导致失败或封禁；遭遇频控 MUST 退避重试且不丢失已拉取的分页进度。（来源: `openspec/specs/history-backfill/spec.md`）
