---
type: "Module"
id: trade
title: "系统架构、层次与模块边界"
description: "七层分层架构下 19 个知识库模块的归属边界、跨层调用禁忌与四条主数据流的走向。"
repo_name: trade
last_updated: 2026-09-28
---

# trade 系统架构

## 系统层次划分

| 层次 | 归属模块 | 职责 | 关键落点 |
|------|---------|------|---------|
| 前端表现层 | `frontend/src` | TradingView 风格单图终端：外壳/图表/右栏面板/QUANT LAB/市场视图 | `webapi` 的 REST + `/ws` + SSE 消费方 |
| 依赖供给层 | `frontend/vendor` | vendored klinecharts-pro（可改，须重建 dist）+ tradingview-pro 模板（只读 pristine） | `dist/klinecharts-pro.js` 为运行时真身 |
| Web 门面层 | `backend/src` | FastAPI `create_app`：REST/WS/SSE 协议、令牌确认、节流、本地 JSON 存储 | `webapi.py`、`chartstore/alertstore/appconfig/backtest_history/events` |
| 数据层 | `backend/src` | 时间级别/品类真值、Parquet 按 UTC 日分片、三条历史通道、实时内存镜像、资讯管线 | `models.py`、`store.py`、`ingestion.py`、`realtime.py`、`streamhub.py`、`newsfeed/news_broker/blockbeats*` |
| 分析层 | `backend/src` | 确定性指标/结构/SMC/统一 S/R 候选、因子与特征、DL 模型与 vectorbt 回测 | `indicators/structure/smc/levels`、`factors.py`、`dlquant.py` |
| 风控执行层 | `backend/src` | 全系统唯一合法下单/平仓出口：熔断检查 → 风控校验 → Paper/Live broker | `risk.py`、`execution.py`、`events.py` |
| AI Agent + 编排层 | `backend/src` | LLMProvider 决策结构化、交易记忆与反思、APScheduler 周期编排 | `llm.py`、`agent.py`、`memory.py`、`orchestration.py`、`scheduler.py` |
| 质量门禁层 | `backend/tests`、`frontend/tests`、`frontend/scripts`、`.github/workflows`、`__root/__files` | L1/L2/L3 金字塔、端到端诊断、CI 编排、pre-commit 与文档同源 | `conftest.py`、`data_registry.py`、`e2e/*.spec.ts`、`ci.yml`、`.pre-commit-config.yaml` |
| 工程契约层 | `backend/__files`、`frontend/__files`、`__root/__files` | 依赖锁定、环境变量面、lint/coverage 阈值、入库边界、许可 | `pyproject.toml`、`uv.lock`、`.env.example`、`vite.config.ts`、`biome.json`、`.gitignore` |
| 外部依赖与流程层 | `agent_hub-main*`、`.claude/*`、`.opencode/*` | vendored Bitget Agent Hub（装环境不跑交易）；OpenSpec 命令/技能（规划工件编辑通道） | `installer/cli.mjs`、`docs/architecture.md`、`commands/opsx/*`、skills `SKILL.md` |

## 模块边界规则

- 前后端唯一接缝是 `backend/src` 的 HTTP/WS 契约；前端 MUST NOT 直连 Bitget 或 BlockBeats，一律经后端代理。（来源: `frontend/src`、`openspec/specs/blockbeats-news/spec.md`）
- `backend/src` 是单一包，层与层靠「通道 / 闸门」两个概念解耦：通道（ingestion/realtime/streamhub/news）只搬数据，闸门（risk→execution）唯一出口，分析层为纯函数无 I/O。
- `frontend/vendor/klinecharts-pro` = 可改 fork（改 src 后必须重建 `dist/`）；`tradingview-pro` = 只读参考，禁止 import、禁止就地编辑；外壳级改动一律落在 `frontend/src`。
- `agent_hub-main` 整体是 vendored 上游（含 installer/docs/assets/根清单），只读；`agent_hub-main/installer` 只改用户机器的全局 npm 包与宿主 skills 目录，绝不参与本仓库运行时。
- `.claude/commands`、`.claude/skills`、`.opencode/commands`、`.opencode/skills` 是同一套 OpenSpec 流程的多宿主镜像，四端文案必须同步，斜杠命名差异：Claude `/opsx:<verb>`（冒号）↔ OpenCode `/opsx-<verb>`（连字符）。
- `backend/scripts` 与 `frontend/scripts` 都是手工一次性脚本层：可 import 生产代码，禁止被生产代码反向 import，禁止新建第二个同类脚本。

## 核心数据流

1. **历史入库**：`/candles` 左翻或 `run_incremental_pull_rest` → `KlineIngestor.backfill_before_rest / fetch_range`（MCP / v2 REST / v3 history-candles 三通道）→ `ParquetStore.save`（UTC 日分片 + `open_time` 去重）→ `ParquetStore.read` → 前端 `getHistoryKLineData/applyMoreData`。
2. **实时推送**：Bitget 公共 WS → `realtime.py`/`streamhub.py` 内存镜像（引用计数订阅）→ `webapi.py` `/ws` 帧（水位 `candle_sent_open_time` 保序）→ `frontend/src` `bitgetWs.deliver`（丢弃更旧 bar）→ `klinecharts-pro` 渲染 → `frontend/scripts` 诊断脚本只读对账。
3. **决策与下单**：`indicators/structure/smc/levels`（确定性 S/R）+ `news_broker` 摘要 → `llm.py`/`agent.py` 产出 `{action, side, symbol, reference_price, reason, confidence}` → `orchestration.py` → `ExecutionEngine.place` → `RiskEngine.check` → `PaperBroker`/`LiveBroker(MCP order)` → `TradeJournal`/`EventLog` → `memory.py` 反思回注。
4. **量化研究**：`/dl/features` 因子 DSL 安全求值 → `dlquant.run_pipeline`（train_ratio 0.7、固定随机种子）→ vectorbt 回测 → `/backtest` 作业轮询 → `backtest_history`（MAX_RUNS 20、曲线降采样 500）→ QUANT LAB 面板图形化。
5. **质量回路**：L1 `pytest -m integrity` 判定缺口 → 类型 B 登记 `KNOWN_GAPS` → `backend/scripts/backfill_micro_gaps.py` 回填 → 门禁转绿并清空白名单。

## 系统架构约束

- [跨模块禁忌] 任何下单路径 MUST 经 `ExecutionEngine` → `RiskEngine` → broker，禁止直连 Bitget API 或 `McpDataClient.call_tool("order")` → 绕过风控即资金损失（来源: openspec/specs/execution-core、system-architecture）
- [跨模块禁忌] 实盘 MUST 同时满足「显式开启 live」AND「二次确认通过」，且默认纸面、默认不自动交易（`MD_AGENT_SCHEDULE_ENABLED=false`）→ 任一不满足必须拒单不下交易所（来源: openspec/specs/live-safety、run-control）
- [跨模块禁忌] 熔断保护性平仓 MUST 始终注册且 MUST NOT 被 kill-switch 阻断 → 关掉它等于关掉风控（来源: openspec/specs/circuit-breaker-enforcement）
- [跨模块禁忌] UI 层（frontend/src）MUST NOT 计算权威数值；风险判定、撮合、回测、新闻清洗全在后端 → 双端不一致时以服务端为准
- [数据流方向] 行情只能 Bitget → backend/src 通道层 → store/内存镜像 → webapi → frontend；前端从不反向写行情 → 逆流向会造成多端数据不同步
- [数据流方向] 时间级别与品类枚举真值只在 `backend/src/market_data/models.py`；`1M`=月、`1m`=分钟靠别名表消歧，调用方禁止内联字面量 → 内联会导致月线被当分钟线（来源: openspec/specs/timeframe-identifier-scheme）
- [数据流方向] `open_time` MUST UTC 严格升序、无重复、OHLC 合法、间隔等于 timeframe step；仅 `1s` 级别 MUST NOT 落盘/回灌/进缺口校验（来源: openspec/specs/e2e-data-integrity、realtime-only-timeframe）
- [数据流方向] `earliest_reached` 只能在可无限回溯的 v3 通道空页且重试一次后置真；近端窗口上限造成的空页不得判定为「已到最早」→ 误判会让该 series 本会话永久停更（来源: openspec/specs/v3-history-channel、history-backfill）
- [边界约束] 回测与分析 MUST NOT 引用未来 bar：指标只用截至当前、特征只用过去、标签取下一根、末行丢弃、训练索引早于测试、模型固定随机种子；回测 MUST 走 vectorbt 标准语义不得自研等价实现（来源: openspec/specs/feature-engineering、walk-forward-training、quant-engine-vectorbt）
- [边界约束] Agent 的 S/R 与态势 MUST 来自确定性算法，LLM MUST NOT 臆造价位；新增价位来源只能接进 `levels._collect()`（来源: openspec/specs/ai-agent-strategy、agent-decision）
- [边界约束] 密钥只存在于后端：`BB_API_KEY`/`BITGET_*` 只从环境变量读取，MUST 永不进浏览器；未配置时返回可见错误（400）而非静默空列表（来源: openspec/specs/blockbeats-news）
- [性能红线] `/candles` limit ≤ 500、v3 单页 ≤ 100 行、回灌并发 `min(8, max(1, max_pages))` 且同 series 加锁、全局同时最多 2 个 series 回灌、`candle_update` 节流 1.0s/series、快照循环 5.0s → 超阈值改的是权威配置而非临时参数
- [性能红线] 内存镜像有硬上限：实时 candle 200 bar/series、成交 200/symbol、深度 400 档、作业表 `MAX_JOBS=200`（只淘汰已完成者）→ 无上限会造成内存单调增长
- [门禁红线] 覆盖率阈值是只升不降的棘轮：后端 `fail_under=80`（基线 81%）、前端 lines/statements=55；数值只能改其权威配置文件，禁止在 `ci.yml` 用命令行参数临时覆盖（来源: openspec/specs/ci-quality-gates）
- [门禁红线] `online`（外网）与 Playwright L3 MUST NOT 进 CI；L2 以独立 job 跑 `pytest -m live --run-live`；依赖安装 MUST `uv sync --frozen` 用提交的 lock → 破坏即「CI 绿而本地装不出来」
- [门禁红线] 新增/改动 REST 端点 MUST 同步补进 L2 端点清单，并同步 README 接口表与 `backend/.env.example`（三处同源，Settings 字段 ↔ .env.example ↔ README 环境表）（来源: openspec/specs/e2e-live-api、repo-hygiene）
- [跨模块禁忌] 新增诊断/修复能力只能扩写既有单文件脚本（`diagnose-kline-realtime.mjs`、`backfill_micro_gaps.py`、`installer/cli.mjs`），禁止新建第二个同类脚本或让生产代码 import `scripts/`
- [跨模块禁忌] 规划工件（proposal/design/tasks/spec）只能经 OpenSpec CLI 返回的 `artifactPaths.<id>.existingOutputPaths` 写；禁止硬编码工件名、禁止写 glob 的 `resolvedOutputPath`、禁止自动挑选 change
- [边界约束] vendored 文件的处置策略互斥：`klinecharts-pro` 改完必须 `dist/` 重建（否则改动静默失效），`tradingview-pro` 必须 pristine；两者都不进 lint/coverage 作用域
- [边界约束] `frontend/src/index.css` 是主题 token 的唯一归属，`tailwind.config.js` 不承载 token；`tests/e2e` 不在 `npm run typecheck` 作用域内 → 「改了没反应」类问题的第一排查点

## 外部接口规范（OpenSpec 摘要）

> 📋 本节内容来源于 OpenSpec：`openspec/`（131 个 capability spec，仅提炼契约要点，非完整转录）

- **Web 门面**（`backend/src/market_data/webapi.py`）：REST `/candles`、`/candles/recent`、`/analyze`、`/structure`、`/backtest`、`/sweep`、`/walkforward`、`/dl/features`、`/backtest/history`、`/agent/*`、`/order` + `/order/confirm`、`/control`、`/alerts`、`/instruments`、`/tickers`、`/api/blockbeats/*`、`/api/news/stream`(SSE)；WS `/ws` 频道 `candle / ticker / books / trade / mark-price / funding-time`（`mark-price`、`funding-time` 归一化为 `ticker`）。规格枚举 33 端点为 L2 回归基线，实际路由多于该清单，缺口须补。
- **错误语义**：参数越界 422、资源不存在 404、上游/密钥问题 400 或 502；`/order` 预览令牌 TTL 300s 且不可复用。
- **持久化面**（`data_dir` 下）：`config/app.json`、`config/chart.json`、`alerts/alerts.json`、`backtest_history/history.json`（schema=vectorbt）、`memory/trades.jsonl`、`events/circuit_breaker.jsonl`；Parquet 列 = `open_time, open, high, low, close, volume`，文件 = `<YYYY-MM-DD>.parquet`（UTC 自然日）。
- **上游 Bitget Agent Hub 契约**（`agent_hub-main/docs/architecture.md`）：MCP 只加载 `account/trade/market` 模块；写/高危操作受 `readOnly / confirm / paperTrading / dryRun` 四道门控；实盘下单走 `order` 工具（`orderType=market`、`size=notional/price`、平仓 `reduceOnly=true`）。
