---
type: "Module"
id: trade
title: "核心子系统与关键流程"
description: "把 19 个知识库模块切分为可独立理解的业务子系统，给出职责、核心入口、上游触发与下游影响，并描述五条关键流程。"
repo_name: trade
last_updated: 2026-09-28
---

# trade 核心子系统

## 子系统列表

| 子系统 | 职责 | 核心入口 | 上游触发 | 下游影响 |
|--------|------|---------|---------|---------|
| 行情数据地基 | 时间级别/品类真值 + Parquet 落地 + 读取裁剪限量 | `models.py`、`store.py:ParquetStore.save/read` | 回灌请求、`run_incremental_pull_rest` 调度、测试播种 | `/candles` 全部读链路、量化回测、L1 门禁；列存格式错则全系统停更 |
| 历史拉取与深度回灌 | MCP / v2 REST / v3 history-candles 三通道补洞与向左深挖 | `ingestion.py:KlineIngestor.fetch_range/backfill_before_rest` | 前端左翻页、`scheduled-ingestion`、`/candles` 越界探测 | store 内容与 `earliest_reached` 语义；误判「已到最早」会永久停更 |
| 实时行情流 | Bitget 公共 WS → 内存镜像 → `/ws` 分发，保序与重连 | `realtime.py`、`streamhub.py`、`webapi.py` `/ws` 水位 | 前端订阅帧、`vite` 代理的连接建立 | 图表最后一根 bar 正确性；乱序会画出重复/回退 bar |
| 多品类镜像 Hub | ticker/books/trade/mark-price/funding-time 归一化与引用计数订阅 | `streamhub.py:MarketStream` | `/ws` 订阅与退订帧 | 盘口档位、成交流水、自选行情；残留旧 symbol 数据是高发 bug |
| 技术分析与 S/R 聚合 | 确定性指标、swing/箱体/趋势线结构、SMC、统一支撑压力候选 | `indicators.py`、`structure.py`、`smc.py`、`levels.py:build_levels` | `/analyze`、`/structure`、Agent 决策前的上下文构建 | Agent 入场依据、图表标注、量化特征；LLM 不得另算一套 S/R |
| 量化实验室（QUANT LAB） | 因子 DSL 安全求值 → 特征 → 模型训练 → vectorbt 回测 → 历史留存 | `factors.py`、`dlquant.py:run_pipeline`、`backtest_history.py` | `/dl/features`、`/backtest`、`/sweep`、`/walkforward`、前端 QUANT LAB | 信号 K 线标记、模型诊断、回测历史列表；无前视是硬约束 |
| AI Agent 决策循环 | LLMProvider 抽象、结构化决策、决策周期与端点 | `llm.py`、`agent.py:build_agent_context`、`agent.py:decide` | `/agent/decide`、`/agent/cycle`、`agent_cycle` 调度任务 | 下单意图（经闸门）、AI 页面展示；默认 hold，缺 30 根 bar 返回 422 |
| 记忆与反思 | 交易日志、相似历史检索、低胜率参数建议、规则蒸馏 | `memory.py:MemoryStore/Reflector`、`orchestration.py` | 平仓写日志、`retrain` 任务、Agent 上下文注入 | 后续决策的 few-shot 注入；记忆污染会放大错误策略 |
| 风控与执行闸门 | 全系统唯一合法下单/平仓出口：熔断 → 风控 → Paper/Live broker | `risk.py:RiskEngine`、`execution.py:ExecutionEngine.place/close` | `/order` + `/order/confirm`、Agent、编排任务、熔断平仓 | 持仓、权益、已实现 PnL、事件日志；绕过即资金损失 |
| 熔断与运行控制 | 回撤熔断强制平仓、kill-switch、纸面/实盘切换 | `risk.py:enforce_circuit_breaker`、`webapi.py` `/control` | 权益回撤越过 `max_drawdown_pct=0.15`、用户开关 | 全部待平持仓；熔断平仓不得被 kill-switch 阻断 |
| 告警、图表与配置存储 | 手绘/价格线/告警持久化、应用与图表偏好 | `chartstore.py`、`alertstore.py`、`appconfig.py` | `/alerts` CRUD、前端绘图与设置保存 | 前端重启后状态恢复；单 series 手绘上限 100 |
| 资讯管线 | AKShare 4 源快讯聚合分类 + BlockBeats 快讯/链上数据代理与每日本地缓存 | `newsfeed.py`、`news_broker.py`、`blockbeats.py`、`blockbeats_cache.py` | `MD_NEWS_POLL_SECONDS=60` 轮询、`/api/news/stream` SSE、BlockBeats 定时刷新 | 新闻面板、市场视图、Agent 摘要上下文；密钥缺失须 400 而非静默空表 |
| 前端终端外壳 | 多标签工作区路由、导航/右栏/底栏骨架、主题与中文文案 | `frontend/src/App.tsx` + `components/views/**` | 浏览器用户动作、URL/标签状态 | 所有视图挂载点；路由错则整屏内容错 |
| 前端图表与叠加层 | klinecharts-pro 实例唯一持有者、周期栏、价格线与信号标记 overlay | `lib/chartController.ts`、`components/views/Chart*` | 外壳挂载、用户改周期/绘线/切 symbol | 图表正确性与叠加层回收；裸调 createOverlay 会脱离 id/groupId 簿记 |
| 前端数据接入 | K 线历史按 series 取回与回填、ticker/盘口/成交 WS 路由与重连重订阅 | `api/client.ts`、`api/bitgetWs.ts:deliver` | 图表挂载、`/ws` 帧、SSE 事件 | 图表数据源与状态栏「实时/重连/断开」；stale 帧必须丢弃 |
| 前端 QUANT LAB / AI 页 | 回测参数装配、作业轮询、结果图形化（薄客户端） | `components/views/agent/*` | 用户点击、`/backtest`、`/jobs/{id}` | 研究结论呈现；前端只做装配与投影，不做指标计算 |
| 图表引擎 vendor | vendored klinecharts-pro（本地 fork）+ tradingview-pro（只读模板）与构建解析边界 | `frontend/vendor/klinecharts-pro/src/**`、`dist/klinecharts-pro.js` | `vite.config.ts` alias、`tsconfig.json`、`file:` 依赖 | 图表运行时行为；改 tsx 不重建 dist 会静默无效 |
| 测试门禁金字塔 | L1 数据完整性 / L2 真实进程 API+WS / L3 浏览器旅程 + 手工诊断脚本 | `test_data_integrity.py`、`test_live_api.py`、`e2e/*.spec.ts`、`diagnose-kline-realtime.mjs` | 开发者命令、`ci.yml`、AGENTS.md 命令矩阵 | 能否合并；L1 缺口输出是回填脚本的任务清单 |
| CI 与本地门禁 | 三个 job 编排、覆盖率棘轮、lint/format 版本同源、pre-commit 镜像 | `.github/workflows/ci.yml`、`.pre-commit-config.yaml` | push / pull_request、本地 commit | 阻断未达标改动；阈值只能改权威配置文件 |
| OpenSpec 流程 | change 生命周期六动作（explore/propose/update/apply/sync/archive）的命令与技能 | `.claude/commands/opsx/*`、`.opencode/commands/opsx-*.md`、两端 skills | 用户斜杠命令或自然语言 | 规划工件与主 spec 的一致性；产物只落 `openspec/**` |
| Bitget Agent Hub 装配 | 受管包的一次性安装与升级/回滚，并把技能部署到 AI 宿主 | `agent_hub-main/installer/cli.mjs` | 终端用户执行 npx bitget-agent-installer | 用户全局 npm 包与 `~/.claude`、`~/.codex`、`~/.openclaw` 技能目录；与仓库运行时完全隔离 |

## 关键流程描述

1. **首屏出图（前端冷启动）**：`App` 挂载 → 外壳选视图 → 图表组件 `chartController` 建实例 → `data_access` 拉 `/candles/recent` 快照 → datafeed `getHistoryKLineData` 拉更早页 → `/ws` 订阅 candle → `bitgetWs.deliver` 单调性守卫 → 引擎渲染；证据链由 L3 的「首屏必须真画出柱子」断言与诊断脚本 REPLACE/APPEND/STALE 对账共同覆盖。
2. **行情入库与缺口治理**：`/candles` 越界或调度任务触发 → 三通道拉取（v3 专责可无限回溯）→ `ParquetStore.save` 按 UTC 日分片去重合并 → L1 `pytest -m integrity` 分类缺口（类型 A 结构性豁免 / B 微缺口硬门禁 / C 新鲜度）→ B 类登记 `KNOWN_GAPS` → `backfill_micro_gaps.py` 回填 → 白名单清空且门禁转绿（残留即为 `stale KNOWN_GAPS` 失败）。
3. **决策 → 下单 → 复盘闭环**：`/agent/cycle` 或定时 `agent_cycle` → `build_agent_context`（确定性 S/R + 新闻摘要 + 记忆检索 k=3）→ LLM/规则 Provider 产出结构化决策（默认 hold，强度低于 `min_strength=2.0` 不入场）→ `ExecutionEngine.place` → 熔断检查 → `RiskEngine` 校验（margin 5%、max_leverage 100、max_adds 3）→ `PaperBroker` 撮合成 `LiveBroker`（MCP `order`，实盘需 live + 二次确认）→ 平仓结算 PnL → `TradeJournal` 落 `trades.jsonl` → `Reflector` 在样本 ≥5 且胜率 <40% 时产出参数建议。
4. **量化研究闭环**：因子表达式经白名单 DSL 求值（禁 `__`/`import`/`lambda`/方法链）→ 特征列（末行丢弃、标签取下一根）→ `train_ratio=0.7` 训练（固定随机种子）→ 阈值 `thresh=0.55` 产出信号 → vectorbt 回测（fee 0.0004 / slippage 0.0005）→ 作业轮询 → `/backtest/history` 留存 20 条、曲线降采样 500 点 → 前端 QUANT LAB 绘制权益/回撤/月度热力图。
5. **CI 与交付一致性**：push/PR → 后端 job（`uv sync --frozen` + ruff + `pytest -q` + `pytest -m integrity` + 覆盖率 `fail_under=80`）∥ L2 job（`pytest -m live --run-live`，独立进程）∥ 前端 job（Biome + tsc + vitest + coverage 55）→ 任一红即阻断；`online` 与 Playwright 永远不跑；本地 pre-commit 用同版本 ruff/Biome 做更小范围镜像（不含 typecheck/coverage）。
