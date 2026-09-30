---
type: "Module"
id: trade
title: "业务概念 → 模块/子文档速查表"
description: "把需求语言（K 线、下单、回测、缺口、门禁……）直接映射到 module_id、子文档路径与关键符号，解决关键词与目录名不匹配的检索失败。"
repo_name: trade
last_updated: 2026-09-28
---

# trade 业务概念索引

> 按需求关键词直查，找到 module_id 后再读对应 `_overview.md` / 子文档。
> **每行都是独立可检索的业务映射**，避免跨行拼读；符号级定位由 Codemap MCP 实时提供。

| 业务概念/需求关键词 | module_id | 子文档 | 关键符号 | 一句话说明 |
|------------------|-----------|--------|---------|-----------|
| K线/历史数据/取更早页/回填 | `backend/src` | `backend/src/src_ingestion.md` | `KlineIngestor.backfill_before_rest`, `earliest_reached` | MCP/v2/v3 三通道深度回灌；`earliest_reached` 误判会让系列永久停更 |
| 落盘/Parquet/按日分片/存储布局 | `backend/src` | `backend/src/src_data_store.md` | `ParquetStore.save`, `_TIMEFRAME_STEP_MS` | UTC 自然日一文件 + `open_time` 去重，是「升序无重复」承诺的落地点 |
| 时间级别/周期标识/1M 与 1m | `backend/src` | `backend/src/src_data_store.md` | `_TIMEFRAME_ALIASES`, `_REALTIME_ONLY_TIMEFRAMES` | 月/分靠别名表消歧，`1s` 仅实时不落盘；枚举真值只在 `models.py` |
| 实时行情/WS推送/bar 乱序回退 | `backend/src` | `backend/src/src_realtime.md` | `BitgetWsStream`, `MAX_BARS_PER_SERIES` | 公共 WS → 内存镜像 → `/ws` 分发；每 series 环形缓冲 200 根 |
| 盘口/深度/成交流水/多品类 | `backend/src` | `backend/src/src_realtime.md` | `MarketStream`, `MAX_DEPTH_LEVELS`, `CHANNEL_ALIASES` | ticker/books/trade 归一化订阅；`mark-price`、`funding-time` 并入 `ticker` |
| 下单/买卖/纸面撮合/加仓 | `backend/src` | `backend/src/src_risk_execution.md` | `ExecutionEngine.place`, `PaperBroker` | 全系统唯一合法下单出口，首仓 adds=1，加仓按 notional 加权均价 |
| 实盘/风控/保证金/杠杆/二次确认 | `backend/src` | `backend/src/src_risk_execution.md` | `RiskEngine`, `LiveBroker`, `RiskConfig.margin_pct` | margin 5%、leverage 100、max_adds 3；实盘需 live 开关 AND 令牌确认 |
| 熔断/回撤/一键停机/kill-switch | `backend/src` | `backend/src/src_risk_execution.md` | `enforce_circuit_breaker`, `max_drawdown_pct` | 回撤超 15% 强制平仓；保护性平仓不得被 kill-switch 阻断 |
| 支撑压力/S-R/结构/SMC/指标 | `backend/src` | `backend/src/src_analysis.md` | `build_levels`, `find_swings`, `FIB_RATIOS` | 确定性纯函数层，多来源聚合成一条候选并给 strength |
| 因子/自定义公式/表达式注入 | `backend/src` | `backend/src/src_quant.md` | `FACTOR_CATALOG`, `_EXPR_FUNC_NAMES`, `_INJECTION_PATTERNS` | 白名单 DSL 求值，禁 `__`/`import`/方法链，防止代码注入 |
| 回测/参数扫描/walk-forward/未来函数 | `backend/src` | `backend/src/src_quant.md` | `dlquant.run_pipeline`, `train_ratio`, `thresh` | vectorbt 标准语义；特征只用过去、标签取下一根、末行丢弃、固定随机种子 |
| AI Agent/决策循环/大模型/记忆反思 | `backend/src` | `backend/src/src_agent_orchestration.md` | `build_agent_context`, `Reflector`, `MemoryStore.retrieve` | 结构化决策（默认 hold），相似历史注入 k=3，胜率<40% 且样本≥5 才给参数建议 |
| 新闻/快讯/BlockBeats/资讯代理 | `backend/src` | `backend/src/src_news.md` | `newsfeed.SOURCES`, `DATA_ENDPOINTS`, `sha1(source+content)` | AKShare 4 源免密钥 + BlockBeats 带密钥；内容哈希给稳定 id |
| REST接口/端点/告警存储/手绘上限 | `backend/src` | `backend/src/src_api_stores.md` | `create_app`, `PENDING_TOKEN_TTL_SECONDS`, `MAX_CANDLE_LIMIT` | 唯一对外契约层：422/400/404 语义、job 表 200 上限、手绘 100 上限 |
| 数据缺口/完整性门禁/L1 | `backend/tests` | `backend/tests/tests_l1_integrity.md` | `KNOWN_GAPS`, `STRUCTURAL_EXEMPTIONS`, `is_exempt` | 类型 A 结构性豁免、B 微缺口硬失败、C 新鲜度需活后端 |
| 三层测试/L2真实进程/pytest marker | `backend/tests` | `backend/tests/tests_l2_live.md` | `live_server`, `--run-live`, `--run-online` | 真实 uvicorn 子进程打 HTTP/WS；外网用例默认 skip 不失败 |
| 后端起不来/fixture/种子数据/隔离 | `backend/tests` | `backend/tests/tests_infra.md` | `seed_store`, `MD_TEST_SERVER_START_TIMEOUT`, `SEED_BASE` | 临时数据目录 + 关闭增量落盘调度，保证离线可复现 |
| 接口回归断言/TestClient | `backend/tests` | `backend/tests/tests_webapi_contract.md` | `test_candles_limit_bounds`, `test_max_jobs_evicts_oldest` | 不启进程验证令牌复用/过期、WS 帧路由、限流与 SSE 截断 |
| 补数据/回填脚本/微缺口修复 | `backend/scripts` | `backend/scripts/scripts_micro_gap_backfill.md` | `backfill_micro_gaps.py`, `TYPE_A_MIN_STEPS` | 一次性 CLI，必须在 `backend/` 下执行；禁止被生产代码 import |
| 白名单维护/回填收尾/stale 条目 | `backend/scripts` | `backend/scripts/scripts_gap_contract.md` | `test_gap_classification_consistent` | 回填后必须清空 `KNOWN_GAPS`，残留即门禁失败 |
| 前端界面/标签页/导航栏/主题中文 | `frontend/src` | `frontend/src/frontend_src_app_shell.md` | `App.tsx`, `CommandPaletteModal` | 外壳只持挂载点与 i18n 字典；品牌名 BeyondEther，禁止 TradingView 字样 |
| 图表渲染/周期栏/价格线/overlay | `frontend/src` | `frontend/src/frontend_src_chart.md` | `chartController`, `NATIVE_PERIODS`, `syncPriceLineOverlays` | 图表实例唯一持有者；新 overlay 必须登记 id + groupId 否则无法回收 |
| 前端取数/datafeed/重连/订阅路由 | `frontend/src` | `frontend/src/frontend_src_data_access.md` | `getHistoryKLineData`, `BitgetWsClient.deliver`, `connectSnapshot` | 重连必须整体重订阅，比当前 bar 更旧的桶必须丢弃 |
| 市场概览/财经日历/瀑布流/分类chip | `frontend/src` | `frontend/src/frontend_src_market_views.md` | `marketPulse`, `useMasonry` | 真实源优先、无数据源的 surface 必须显式声明为示例内容 |
| 右侧面板/下单按钮/警报实体 | `frontend/src` | `frontend/src/frontend_src_terminal_panels.md` | `alertsStore.Alert`, `asAlert` | 新增警报字段必须同时改实体与 `AlertRecord` 映射，只改一侧会静默丢字段 |
| QUANT LAB 页面/回测 UI/热力图 | `frontend/src` | `frontend/src/frontend_src_quant_lab.md` | `QuantLabPanel`, `ui.tsx` | 薄客户端：只做参数装配、轮询与结果图形化，不做任何计算 |
| 图表引擎/vendor/预构建 dist | `frontend/vendor` | `frontend/vendor/frontend_vendor_klinecharts_pro_patch.md` | `adjustFromTo`, `customApi.formatDate`, `period-bar/index.tsx` | 改 `src/**` 后必须重建 `dist/`，否则改动在页面上静默无效 |
| 引擎契约/Pro 参数/getChart | `frontend/vendor` | `frontend/vendor/frontend_vendor_klinecharts_pro_api.md` | `ChartProOptions`, `getChart()` | 宿主与外部引擎的唯一接口面；类型有两份需同步 |
| TV 模板/tradingview-pro/外壳参考 | `frontend/vendor` | `frontend/vendor/frontend_vendor_tradingview_template.md` | `DesktopTitleBar`, `RightDock` | 只读 pristine 副本，禁止被宿主 import；Pine/Brokers 已整体移除 |
| alias 解析/构建边界/@klinecharts/pro | `frontend/vendor` | `frontend/vendor/frontend_vendor_import_boundary.md` | `vite.config.ts` alias, `tsconfig paths`, `file:` 依赖 | 三条解析路径与 dist 提交策略共同决定 vendor 是否真正参与构建 |
| 浏览器旅程/L3/E2E/无 mock | `frontend/tests` | `frontend/tests/frontend_tests_e2e_journeys.md` | `kline-realtime.spec.ts`, `__kline_chart__` | 真实 Chromium 证明首屏有柱、下单闭环、派生行情无空值 |
| e2e 选择器/data-testid/起服务 | `frontend/tests` | `frontend/tests/frontend_tests_e2e_infra.md` | `playwright.config.ts`, `reuseExistingServer` | 依赖 `frontend/src` 的定位契约与 5173/8000 双服务拉起 |
| 实时诊断/REPLACE/APPEND/STALE | `frontend/scripts` | `frontend/scripts/scripts_kline_realtime_diagnose.md` | `diagnose-kline-realtime.mjs` | 只读采样对账并留证，bare script，不进 CI |
| npm scripts/vite proxy/覆盖率阈值 | `frontend/__files` | `frontend/__files/__files_build_runtime.md` | `test:coverage`, `server.proxy` | 脚本名一旦被 CI 或 AGENTS.md 引用即成契约，改名要先改消费方 |
| 类型报错没被抓/lint 作用域/tailwind token | `frontend/__files` | `frontend/__files/__files_static_gates.md` | `biome.json` includes, `tsconfig` include, `@theme` | `vendor` 与 `tests/e2e` 刻意不在 tsc/Biome 覆盖内；主题 token 只写 `index.css` |
| Python 版本/依赖锁定/plotly 上限 | `backend/__files` | `backend/__files/__files_deps.md` | `PLOTLY_PIN`, `REQUIRES_PYTHON`, `uv.lock` | `uv sync --frozen` 保证可复现；新增依赖必须同变更重生成 lock |
| 环境变量/MD_*/API Key 放哪 | `backend/__files` | `backend/__files/__files_env.md` | `MD_DATA_DIR`, `BB_API_KEY`, `MD_AGENT_SCHEDULE_ENABLED` | Settings ↔ `.env.example` ↔ README 环境表三处必须同集合 |
| ruff/覆盖率棘轮/pytest marker 注册 | `backend/__files` | `backend/__files/__files_gates.md` | `COVERAGE_FAIL_UNDER`, `RUFF_SELECT`, `MARKER_LIVE` | 门禁数值只写 `pyproject.toml`，禁止旁路配置文件与 CI 参数覆盖 |
| CI 跑什么/为什么 PR 红了 | `.github/workflows` | `.github/workflows/workflows_ci.md` | `ci.yml` jobs: backend / backend-l2 / frontend | 编排而非实现检查；`online` 与 Playwright 永不进 CI |
| 本地与 CI 不一致/pre-commit 版本钉 | `.github/workflows` | `.github/workflows/workflows_local_parity.md` | `fail_under`, `rev v0.16.8`, `biome 2.5.14` | pre-commit 工具版本必须与 `uv.lock` / `package.json` 同源 |
| 测试命令矩阵/AGENTS/README 双语同步 | `__root/__files` | `__root/__files/__files_agent_contract.md` | `L1/L2/L3` 命令行, `<!-- codemap:start -->` | 跨层命令口径与工具版本钉只写 AGENTS.md + pre-commit 注释，不新建指南文件 |
| 免责声明/接口清单/许可证边界 | `__root/__files` | `__root/__files/__files_portal.md` | README 环境变量表, GPL-3.0 | README 是唯一对外门面，双语文档与代码事实的同步责任方 |
| 哪些文件不许入库/忽略规则 | `__root/__files` | `__root/__files/__files_repo_boundary.md` | `.gitignore`, `.codemaker/codeindex/` | 构建产物与工具目录一律忽略（repo-hygiene 规格要求） |
| OpenSpec 立项/proposal/design/tasks | `.claude/commands` | `.claude/commands/.claude_commands_workflow.md` | `/opsx:propose`, `openspec new change` | 变更生命周期推进，禁止代替人工做范围决策 |
| delta spec 合并/主规格同步 | `.opencode/commands` | `.opencode/commands/.opencode_commands_artifacts.md` | `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`, `existingOutputPaths` | 只改已存在工件；MODIFIED 下只补新 scenario，不整节替换 |
| opsx 命令四端镜像/跨宿主同步 | `.opencode/skills` | `.opencode/skills/skills_workflow_actions.md` | `OPSX_ACTION_SET`, `/opsx-<verb>` vs `/opsx:<verb>` | 命令与技能多宿主同构，改一处必须四处同步否则规格漂移 |
| 流程护栏/禁止自动选 change | `.opencode/skills` | `.opencode/skills/skills_guardrails.md` | `CHANGE_SELECTION_POLICY`, `SYNC_IDEMPOTENT` | 必须由用户选择 change；sync 幂等；归档冲突即失败不覆盖 |
| 怎么建知识库/codeindex 产物契约 | `.claude/skills` | `.claude/skills/skills_kb_builder.md` | `MODULE_COUNT_MIN`, `CONCEPT_INDEX_MIN_ENTRIES` | 本知识库自身的生成规程与质量门槛定义处 |
| 影响面分析/调用链/Cypher 统计 | `.claude/skills` | `.claude/skills/skills_codemap.md` | `CYPHER_TRAVERSAL_MAX_HOPS`, `IMPACT_RISK_MEDIUM_MAX_CALLERS` | 先图检索后读文件的纪律与风险分级阈值 |
| Bitget 选包/凭证/安全门控口径 | `agent_hub-main` | `agent_hub-main/__files/__files_ecosystem.md` | `README`/`llms.txt` 门面, `readOnly`, `paperTrading` | 对外宣称的操作数与 verb 数是门户口径，不能当字段级接口契约引用 |
| agent hub 装包/升级/回滚 | `agent_hub-main/installer` | `agent_hub-main/installer/agent_hub-main_installer_cli_commands.md` | `bitget-agent-installer`, `upgrade-all`, `--dry-run` | 先 uninstall 再 install 指定版本；只装环境不跑交易逻辑 |
| 技能部署到 Claude/Codex/OpenClaw | `agent_hub-main/installer` | `agent_hub-main/installer/agent_hub-main_installer_skill_deploy.md` | `DEPLOY_TARGETS`, `deploySkills`, `--target all` | 目标宿主目录映射只写在 `cli.mjs` 的常量表里 |
| 上游能力面/catalog/riskLevel | `agent_hub-main/docs` | `agent_hub-main/docs/agent_hub-main_docs_architecture.md` | intent surface / full surface, `safeInvoke` | 外购依赖的只读契约镜像，文档失真即契约漂移 |
| 上游接入前置/Node 版本/凭证来源 | `agent_hub-main/docs` | `agent_hub-main/docs/agent_hub-main_docs_getting_started.md` | 环境变量三件套凭证, Demo 演练 | 无密钥可用公开行情；凭证只能来自环境变量，不得写进配置文件 |

## 跨层系统速查（Step 6b 聚合）

> 一个业务系统横跨多个目录模块时，先查本表直达聚合文档，不必逐层检索。

| 业务概念/需求关键词 | module_id | 子文档 | 关键符号 | 一句话说明 |
|------------------|-----------|--------|---------|-----------|
| K线全链路/bar 正确性/实时保序 | `_systems` | `_systems/kline_pipeline.md` | `KlineIngestor.fetch_range`, `ParquetStore.save`, `BitgetWsClient.deliver` | 后端接入落盘 → 前端取数投递 → 引擎渲染 → 端到端保序诊断的跨 6 模块聚合 |
| 下单全链路/决策闭环/交易安全 | `_systems` | `_systems/trading_loop.md` | `ExecutionEngine.place`, `enforce_circuit_breaker`, `/order/confirm` | 分析 → LLM 决策 → 风控执行两层闸门 → 前端两阶段确认的跨 4 模块聚合 |
| 质量门禁/覆盖率棘轮/本地与 CI 一致 | `_systems` | `_systems/quality_gates.md` | `fail_under`, `pre-commit`, `ci.yml` jobs | CI 编排 + pre-commit + 两端阈值 + 测试分层的同源约束聚合 |

> **增量维护要求**：需求实现完成后，若发现新的「关键词 → 模块」映射（本次靠 grep 或多轮试错才找到的路径），必须补进本表。
