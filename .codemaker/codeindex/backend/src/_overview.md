---
type: "Module"
id: backend/src
title: "行情数据与自动交易内核"
description: "本模块是仓库唯一的后端内核包，负责把 Bitget 行情变为可持久化、可回测、可被 Agent 下单的资产，并守住「任何订单必须过风控闸门」这一硬约束。"
module_id: backend/src
architectural_role: "后端运行时层（Python 包 market_data），被 web API、CLI、调度器与前端共同依赖"
world_model_hints:
  - "属于分层架构的数据层 + 分析层 + 风控执行层 + AI Agent 层 + DL 量化层 + 自动化编排层的合一实现，前端层通过 HTTP/WS 单向调用它"
  - "上游：前端 REST/WS 请求、APScheduler 定时任务、CLI 手工命令、backend/scripts 的一次性回填脚本"
  - "下游：本地 Parquet store 与 data_dir 下 JSON/JSONL 持久化文件、Bitget REST/WS、bitget-agent-mcp 子进程、AKShare 与 BlockBeats 外部源"
  - "禁止被绕过：任何下单路径都必须经 ExecutionEngine → RiskEngine，禁止跨层直接访问 Bitget API"
upstream_modules:
  - module: frontend/src
    confidence: extracted
  - module: backend/tests
    confidence: extracted
  - module: backend/scripts
    confidence: extracted
  - module: backend (pyproject 入口 `market-data = market_data.cli:main`)
    confidence: extracted
downstream_modules:
  - module: data/parquet 本地列存（store.py 落盘，L1 门禁与图表读取的唯一数据源）
    confidence: extracted
  - module: Bitget v2/v3 REST + 公共 WS（外部行情源）
    confidence: extracted
  - module: bitget-agent-mcp 子进程（Node ≥20，npx 启动；历史 K 线与实盘下单通道）
    confidence: extracted
  - module: AKShare / BlockBeats api-pro（外部资讯与数据源）
    confidence: extracted
---

## Files

### 源代码路径

- `backend/src/market_data/`（本模块唯一子包，34 个 `.py` 文件含 `__init__.py`，约 8.6k 行）

按职责归属（每个文件都被且仅被一个子文档主讲）：

| 文件 | 归属子文档 |
|---|---|
| `config.py`、`models.py`、`store.py` | `src_data_store.md` |
| `ingestion.py`、`mcp_client.py`、`scheduler.py`、`discover.py`、`excel_export.py`、`cli.py` | `src_ingestion.md` |
| `realtime.py`、`streamhub.py` | `src_realtime.md` |
| `indicators.py`、`structure.py`、`smc.py`、`levels.py` | `src_analysis.md` |
| `factors.py`、`dlquant.py`、`backtest_history.py` | `src_quant.md` |
| `risk.py`、`execution.py`、`events.py` | `src_risk_execution.md` |
| `agent.py`、`llm.py`、`memory.py`、`orchestration.py` | `src_agent_orchestration.md` |
| `newsfeed.py`、`news_broker.py`、`blockbeats.py`、`blockbeats_cache.py` | `src_news.md` |
| `webapi.py`、`appconfig.py`、`chartstore.py`、`alertstore.py` | `src_api_stores.md` |
| `__init__.py`（导出 `Settings` / `get_settings`） | `src_data_store.md` |

### 知识库文档

- `.codemaker/codeindex/backend/src/_overview.md`（本文件）
- `.codemaker/codeindex/backend/src/src_data_store.md`
- `.codemaker/codeindex/backend/src/src_ingestion.md`
- `.codemaker/codeindex/backend/src/src_realtime.md`
- `.codemaker/codeindex/backend/src/src_analysis.md`
- `.codemaker/codeindex/backend/src/src_quant.md`
- `.codemaker/codeindex/backend/src/src_risk_execution.md`
- `.codemaker/codeindex/backend/src/src_agent_orchestration.md`
- `.codemaker/codeindex/backend/src/src_news.md`
- `.codemaker/codeindex/backend/src/src_api_stores.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）；包命名空间前缀 `backend.src.market_data.*`

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `src_data_store.md` | OHLCV 列契约、时间级别全集与月/分消歧、仅实时级别规则、Parquet 按日落盘与读取裁剪 | `OHLCV_COLUMNS`、`VALID_TIMEFRAMES`、`_REALTIME_ONLY_TIMEFRAMES=1s`、`_TIMEFRAME_STEP_MS`、`MD_*` 配置 |
| `src_ingestion.md` | MCP/REST 三通道拉取、增量补洞、深度回灌、频控退避、定时任务、CLI 入口 | `KlineIngestor`、`V3_HISTORY_CANDLES_URL`、`earliest_reached`、`McpDataClient`、`build_rest_scheduler` |
| `src_realtime.md` | K 线实时流与交易所多频道镜像、引用计数订阅、订单簿合并、保序水位 | `BitgetWsStream`、`MarketStream`、`MAX_BARS_PER_SERIES=200`、`MAX_DEPTH_LEVELS=400`、`ping/pong` |
| `src_analysis.md` | 指标计算、摆动点/趋势线/箱体、SMC 流动与订单块、S/R 聚合与强度 | `indicators.compute`、`FIB_RATIOS`、`find_swings(k=2)`、`build_levels(tol=0.001)`、`Level.strength` |
| `src_quant.md` | 因子目录与白名单表达式 DSL、sklearn+vectorbt 回测、无前视与逐笔交易契约、回测历史落盘 | `FACTOR_CATALOG`、`DEFAULT_FACTORS`、`_INJECTION_PATTERNS`、`run_pipeline`、`MAX_RUNS=20` |
| `src_risk_execution.md` | 全仓保证金/杠杆/加仓/回撤四道闸门、纸面与实盘 broker、熔断事件日志 | `RiskConfig`、`size_position`、`ExecutionEngine.place`、`settle_close`、`BrokerError`、`DEFAULT_MAX_EVENTS=200` |
| `src_agent_orchestration.md` | Agent 结构化决策、provider 抽象与降级、记忆检索与反思、编排任务与 kill-switch | `AgentDecision`、`RuleBasedProvider`、`similarity`、`RunControl.can_trade`、`MD_AGENT_SCHEDULE_ENABLED` |
| `src_news.md` | AKShare 四源归一与分类、后台线程 + SSE 推送、BlockBeats 代理与日更缓存 | `CATEGORY_RULES`、`NewsBroker`、`NEWSFLASH_TYPES`、`DATA_ENDPOINTS`、`SNAPSHOT_MAX_ITEMS=100` |
| `src_api_stores.md` | 30+ REST 端点与 `/ws` 协议、后台 job 表、二次确认下单、三个 JSON 文档存储 | `create_app`、`MAX_CANDLE_LIMIT=500`、`PENDING_TOKEN_TTL_SECONDS=300`、`MAX_JOBS=200`、`ChartStore`、`AlertStore` |

## 模块概述

**业务定位**：本模块解决的是「一个自用型 AI 交易系统如何让行情、分析、回测、下单四条链路共享同一份可信数据与同一套风险边界」。它把 Bitget 的 K 线（历史 + 实时）、外部资讯（AKShare / BlockBeats）、技术分析结果（指标 / 结构 / SMC / S/R）、量化回测结果（因子 → 模型 → 信号 → vectorbt 组合）以及交易记录（纸面与实盘持仓、交易日志、熔断事件）统一到同一个 `market_data` 包内，并在此处固化三条业务底线：①时间序列必须严格升序且不重复（图表与 L1 数据门禁共用此前提）；②任何订单（含 Agent 与调度器产生的）都必须先过熔断检查再过风控检查；③默认纸面交易，实盘必须「显式开启 + 二次确认」双条件同时成立。
（来源: `openspec/specs/system-architecture/spec.md`、`openspec/specs/e2e-data-integrity/spec.md`、`openspec/specs/live-safety/spec.md`）

**业务上游**：四类触发者。① `frontend/src` 通过 `/api/*` REST 与 `/api/ws` WebSocket 发起请求（K 线、分析、回测、下单、配置、告警、资讯、行情镜像）；② `webapi.create_app` 的 lifespan 在启动时拉起 APScheduler（增量落盘、BlockBeats 日更、编排任务）与两条 WS 流；③ `market-data` CLI（`backend/pyproject.toml` 注册）由人工执行 pull/incremental/gaps/schedule/analyze/trade；④ `backend/scripts/backfill_micro_gaps.py` 与 `backend/tests` 直接 import 本包的生产类（`KlineIngestor`、`ParquetStore`）复用能力，而非另写一套。
（来源: `AGENTS.md`「Test Suite」、`backend/scripts/backfill_micro_gaps.py` 的 import、`openspec/specs/scheduled-ingestion/spec.md`）

**业务下游影响**：改动本模块会同时影响 ①`data/parquet` 的序列质量（L1 门禁 `python -m pytest -m integrity` 的通过与否、缺口白名单是否失效）；②前端图表是否出现空洞/乱序/永久停更（`/candles`、`/ws` candle 帧、历史回填）；③量化结果的可复现性（前视偏差、默认 7 因子的字节级兼容、回测历史容量上限）；④资金安全语义（熔断保护性平仓、实盘下单二次确认、PnL 结算公式）；⑤ `L2` 全端点 E2E（`--run-live`）的 33 个端点契约。
（来源: `openspec/specs/e2e-live-api/spec.md`、`openspec/specs/history-backfill/spec.md`、`openspec/specs/circuit-breaker-enforcement/spec.md`）

## 架构简析

模块采用「协议/入口层 → 领域逻辑层 → 数据落地层」三层结构，单一 Python 包内以「通道」和「闸门」两个概念解耦：

`webapi.py` / `cli.py`（入口）→ `ingestion.py` + `realtime.py` + `streamhub.py` + `news_broker.py`（外部通道）→ `store.py` + `chartstore.py`/`alertstore.py`/`appconfig.py`/`backtest_history.py`/`events.py`（落地）→ `indicators.py` + `levels.py` + `factors.py` + `dlquant.py`（分析计算）→ `risk.py` → `execution.py` → `agent.py` + `orchestration.py`（决策与安全）

- **核心文件**：`webapi.py`（1510 行，唯一对外契约层，所有端点与 `/ws` 协议在此）；`models.py`（时间级别标识全集与月/分消歧的唯一真值源，其余模块一律 import 而非内联字面量）；`store.py`（Parquet 按 UTC 日分文件 + `open_time` 去重合并，是「升序无重复」承诺的落地点）；`execution.py` + `risk.py`（下单硬闸门）；`ingestion.py`（v2/v3/MCP 三通道与 `earliest_reached` 语义）。
- **关键数据流**：`KlineIngestor.fetch_range / backfill_before_rest → ParquetStore.save → ParquetStore.read → indicators.compute → levels.build_levels → agent.build_agent_context → ExecutionEngine.place → TradeJournal.append`；实时侧 `BitgetWsStream/MarketStream` 只维护内存镜像，落盘由 `run_incremental_pull_rest` 独立驱动。
- **状态机/生命周期**：持仓三态（无仓位 → 有仓位 → 平仓写日志），熔断触发时 `enforce_circuit_breaker()` 返回全部待平持仓并写 `circuit_breaker` 事件；组合权益 `peak_equity` 单调不回退，是回撤百分比的分母。
- **扩展点**：`Model` Protocol（换 sklearn 模型）、`LLMProvider` 的 `kind ∈ {rule, openai, ollama, llm}`、`Broker` Protocol（`PaperBroker` / `LiveBroker`）、`RiskConfig` / `ProviderConfig` 全量可配置、`FACTOR_CATALOG` 预设因子 + 白名单表达式 DSL、`newsfeed.SOURCES`（新增 AKShare 来源只需加一个懒加载适配器）、`EventSink` Protocol（结构化事件落地可替换）。
（来源: `openspec/specs/system-architecture/spec.md`「分层架构」）

## 上下游关系

> `extracted` = 静态 import / 调用链可验证；`inferred` = Agent 推断待复核

**上游（谁触发本模块）**

| 上游 | 方式 | 依据 | confidence |
|---|---|---|---|
| `frontend/src` | HTTP `/api/candles`、`/api/backtest`、`/api/order` 等 + `/api/ws` 订阅 | `api-core` / `market-endpoints` / `realtime-ws` 规格；webapi 路由表 | extracted |
| APScheduler（lifespan 内 3 个调度器） | 增量落盘、BlockBeats 日更、熔断/Agent/重训任务 | `scheduler.py:build_rest_scheduler`、`orchestration.py:build_orchestrator` | extracted |
| `market-data` CLI | `pull/incremental/gaps/schedule/analyze/trade/risk-check/backfill` 子命令 | `cli.py` argparse 定义 | extracted |
| `backend/scripts/backfill_micro_gaps.py` | 直接调用 `KlineIngestor._fetch_v3_history_page` + `ParquetStore.save` | 见 `backend/scripts` 模块知识库 | extracted |
| `backend/tests`（L1/L2 三层门禁） | import `KlineIngestor`/`ParquetStore`/`create_app`，契约回归 | `test_store/test_offline/test_webapi/conftest` | extracted |
| `bitget-agent-mcp` 子进程回调 | `call_tool("market", {action: candlesHistory})` / `order` | `mcp_client.py`、`ingestion.py` | extracted |
| `AKShare` / `BlockBeats` 公共 API | `newsfeed` 懒加载 import、`blockbeats._get()`；密钥仅服务端持有 | `newsfeed.SOURCES`、`blockbeats.py` | extracted |

**下游（本模块影响谁）**

| 下游 | 影响 | confidence |
|---|---|---|
| `data/parquet/**` | 序列是否升序、无重复、无缺口——L1 门禁与图表连续性的唯一判定对象 | extracted |
| `data/{config,alerts,backtest_history,memory,events}/*` JSON/JSONL | 前端配置/告警/历史/日志展示与跨设备一致性 | extracted |
| `frontend/src` 图表与量化工作台 | `/candles`、`/ws` 帧、heatmap、IC、回测明细 | extracted |
| Bitget / BlockBeats 配额与封禁风险 | 回灌翻页频率、`MD_BACKFILL_PAGE_DELAY`、退避策略 | inferred |
| `backend/tests` 缺口白名单（`KNOWN_GAPS`） | 新缺口或新时间级别会立即打红 hard gate；脚本回填后必须逐条清空 | inferred |
| 纸面/实盘账户资金 | 下单顺序、熔断平仓、二次确认闸门 | extracted |

**已知外部依赖禁忌（必须遵守）**

- `bitget-agent-hub` 系列包（`bitget-agent-sdk` / `bitget-agent-mcp` / `bitget-signal`）**只能作为依赖消费，禁止 fork 或修改其源码**；因此本模块只能通过子进程 stdio 与 MCP 通信，不得内联实现交易所协议细节。 （来源: `openspec/specs/system-architecture/spec.md`「Purpose」）
- LLM 供应商仅作为可配置依赖参与推理，**任何外部网络依赖不得被伪造为本地实现**；无网络时走 `RuleBasedProvider` 确定性基线，绝不阻塞启动。 （来源: `openspec/specs/llm-provider/spec.md`、`openspec/specs/system-architecture/spec.md`）

## 外部知识源整合说明

本模块文档在生成时扫描了两类仓库内置/外部知识源，并将**业务规则、接口契约、边界约束、术语定义**提炼后并入产物（不复制原文）：

| 知识源 | 扫描结果 | 并入位置 |
|---|---|---|
| `backend/src/**/*.md`（模块目录内内置文档） | **无 `.md` 文件**（该目录仅有 34 个 `.py` 源码），无内置文档可合并 | — |
| `openspec/`（仓库根 open specs 目录，含 `specs/` 与 `changes/archive/`） | 命中 130+ 能力规格，其中约 60 个与本模块直接相关 | 每个子文档末尾新增 `## 附：OpenSpec 摘要` 节；模块概述与下方禁忌清单已并入整体架构约束 |

- 所有摘抄条目的来源均以 `（来源: openspec/specs/<capability>/spec.md）` 形式标注在条目末尾，便于回溯核对。
- `openspec/changes/archive/*/specs/**` 为历史变更归档，与 `openspec/specs/**` 的现行规格重复，**以 `openspec/specs/**` 为现行真值**；归档目录仅用于理解设计动因（`proposal.md` / `design.md` / `tasks.md`）。
- ⚠️ 规格与代码冲突时的判定顺序：**代码 > `openspec/specs/**` 现行规格 > 归档变更**。当前已知冲突：时间级别原生全集计数（规格文本写 13、枚举实为 15、代码为 14 个可回灌级别），详见 `src_data_store.md` 末尾的「附：OpenSpec 摘要」。

## 跨模块契约底线（改本模块任何一层前先读）

以下条目来自 OpenSpec 现行规格，是跨子文档共享的硬约束；违反任一条都可能造成资金损失、图表永久停更或数据门禁失效：

- **任何下单路径 MUST 经执行层两层闸门**：熔断检查 → 风控校验 → broker；Agent、编排任务、CLI、HTTP 端点一律不得直连交易所或 MCP `order` 工具。实盘还 MUST 同时满足「显式开启」AND「二次确认」。 （来源: `openspec/specs/execution-core/spec.md`、`openspec/specs/live-safety/spec.md`、`openspec/specs/system-architecture/spec.md`）
- **默认纸面、默认不自动交易**：未显式配置时纸面运行；`MD_AGENT_SCHEDULE_ENABLED` 默认 false（不自动下单、不自动重训）；但熔断保护性平仓 MUST 始终注册且 MUST NOT 被 kill-switch 阻断。 （来源: `openspec/specs/run-control/spec.md`、`openspec/specs/orchestration-jobs/spec.md`、`openspec/specs/circuit-breaker-enforcement/spec.md`）
- **序列契约是四条链路的共同前提**：`open_time` UTC 严格升序、无重复、OHLC 合法、间隔等于 timeframe step；仅实时级别（`1s`）MUST NOT 落盘/回灌/进缺口校验。 （来源: `openspec/specs/e2e-data-integrity/spec.md`、`openspec/specs/realtime-only-timeframe/spec.md`）
- **`earliest_reached` MUST 只在可无限回溯通道（v3）空页且重试一次后成立**；渠道近端窗口上限造成的空页 MUST NOT 被判定为「已到最早」，否则该 series 在本会话内永久停更。 （来源: `openspec/specs/v3-history-channel/spec.md`、`openspec/specs/history-backfill/spec.md`）
- **Agent 的 S/R 与态势 MUST 来自确定性算法**（`indicators` / `structure` / `smc` / `levels`），LLM MUST NOT 臆造价位；决策 MUST 结构化为 `{action, side, symbol, reference_price, reason, confidence}` 且默认 hold。 （来源: `openspec/specs/ai-agent-strategy/spec.md`、`openspec/specs/agent-decision/spec.md`）
- **无前视与确定性贯穿分析/量化**：指标只用截至当前 bar 数据；特征只用过去、标签取下一根、末行丢弃；训练索引全部早于测试；模型固定随机种子；回测走 vectorbt 标准语义，MUST NOT 自研等价实现。 （来源: `openspec/specs/technical-indicators/spec.md`、`openspec/specs/feature-engineering/spec.md`、`openspec/specs/walk-forward-training/spec.md`、`openspec/specs/quant-engine-vectorbt/spec.md`、`openspec/specs/backtest-engine/spec.md`）
- **密钥只在前端之外**：`BB_API_KEY` 等只从后端配置读取并 MUST 永不暴露给浏览器；未配置时返回可见错误（400）而非静默空列表。 （来源: `openspec/specs/blockbeats-news/spec.md`）
- **L2 是端点级回归基线**：规格枚举的 33 个 REST 端点逐一覆盖成功路径 + 错误路径码（400/404/422），除显式 `--live` 用例外 MUST 在断网环境全绿；而代码实际路由多于该清单（`/dl/features`、`/backtest/{sweep,walkforward,history}`、`/news/*` 等无现成回归覆盖），新增或改动端点 MUST 同步补进 L2 清单（清单缺口详情见 `src_api_stores.md`）。 （来源: `openspec/specs/e2e-live-api/spec.md`、`openspec/specs/e2e-live-ws/spec.md`）
