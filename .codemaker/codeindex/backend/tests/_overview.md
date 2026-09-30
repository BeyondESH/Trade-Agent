---
type: "Module"
id: backend/tests
title: "全栈 E2E 测试门禁层"
description: "以三层测试金字塔（L1 数据完整性 / L2 真实进程 API+WS / L3 浏览器旅程）把行情数据链路、交易风控与 Agent 行为固化为可执行规格，是本仓库合并前唯一可信的回归门禁。"
module_id: backend/tests
architectural_role: "质量门禁层（无生产代码依赖它，但它定义生产代码的可接受行为）"
world_model_hints:
  - "位于三层测试金字塔的第 1、2 层：L1 直读 Parquet 数据本体，L2 拉起真实 uvicorn 进程打 HTTP/WS，L3（Playwright）在 `frontend/tests/e2e`"
  - "上游是开发者手工命令、`AGENTS.md` 命令矩阵与 CI（`.github/workflows/ci.yml`）"
  - "下游影响的是「能否合并」：门禁红即阻断 PR；L1 白名单的失败输出同时是 `backend/scripts` 回填脚本的任务清单来源"
  - "它不产出运行时能力，只产出结论（pass/fail/skip）与诊断明细，因此禁止为「让测试变绿」而改动 `backend/src`"
upstream_modules:
  - module: repo-root（AGENTS.md「Test Suite」命令矩阵、frontend 侧 L3 命令）
    confidence: extracted
  - module: .github/workflows（CI 后端主 job / L2 独立 job / ruff / 覆盖率门禁）
    confidence: extracted
downstream_modules:
  - module: backend/src（测试是 market_data 包行为的可执行契约；覆盖率 source=market_data，fail_under=80）
    confidence: extracted
  - module: backend/scripts（`data_registry.KNOWN_GAPS` 是微缺口回填脚本的唯一任务清单）
    confidence: extracted
  - module: frontend/tests（L3 浏览器旅程与 L1/L2 构成同一金字塔，文档命令需一致）
    confidence: inferred
  - module: backend/data/parquet（L1 门禁直读真实数据目录；CWD=backend/ 时解析为 ./data/parquet，MD_DATA_DIR 可重定向；其余测试一律落临时目录，绝不写生产 parquet）
    confidence: extracted
---

## Files

### 源代码路径

- `backend/tests/`（唯一实体：27 个顶层 Python 文件，无子目录；`testpaths = ["tests"]`）

### 同级散落代码文件（全部纳入本模块知识库）

- 基础设施：`conftest.py`（fixture / marker 门控 / CLI 开关）、`data_registry.py`（缺口白名单注册表）
- L1 数据完整性：`test_data_integrity.py`
- L2 真实进程：`test_live_api.py`、`test_live_ws.py`
- TestClient 层 Web API/WS 契约：`test_webapi.py`
- 行情/实时/新闻离线单测：`test_models.py`、`test_store.py`、`test_chartstore.py`、`test_events.py`、
  `test_ingestion_rest.py`、`test_offline.py`、`test_realtime.py`、`test_streamhub.py`、
  `test_blockbeats.py`、`test_blockbeats_cache.py`、`test_newsfeed.py`、`test_news_broker.py`
- 量化/交易/Agent 离线单测：`test_analysis.py`、`test_dlquant.py`、`test_factors.py`、
  `test_backtest_history.py`、`test_risk.py`、`test_execution.py`、`test_agent.py`、
  `test_memory.py`、`test_orchestration.py`

### 关联契约文件（改动需联动，不在本模块目录内）

- `backend/pyproject.toml` — `[tool.pytest.ini_options]` markers（integrity/live/online）、`testpaths`、`[tool.coverage.report] fail_under = 80`
- `AGENTS.md` — 三层命令矩阵（本模块的对外运行契约文档）
- `.github/workflows/ci.yml` — 后端主 job（ruff lint → ruff format check → `pytest -q` → `pytest -m integrity` → 覆盖率独立 step）、L2 独立 job、严禁 `--run-online`；Playwright L3 故意不入 CI
- `.pre-commit-config.yaml` — 后端 ruff（lint + format）钩子，工具与版本 MUST 与 CI 一致（改测试文件同样受 lint 门禁约束）
- `frontend/tests/e2e/*.spec.ts` — L3 层（属于 `frontend/tests` 模块，但与本模块共享同一金字塔）
- `backend/data/parquet/**` — L1 门禁读取的数据本体（`Settings.parquet_dir` = `data_dir/parquet`，`data_dir` 默认 `./data`，故**必须在 `backend/` 下执行**；可用 `MD_DATA_DIR` 重定向）

### 测试规模与覆盖（实测）

- 源文件：27 个顶层 Python 文件（1 个 `conftest.py` + 1 个注册表 + 25 个测试模块），无子目录
- 用例数：`pytest --collect-only` 实收 **592 个用例**（含 L1 按 series 参数化展开；当前仓库有 27 个 series、4383 个 parquet 文件）
- 子文档源文件覆盖：infra（`conftest.py`）· l1_integrity（`test_data_integrity.py`、`data_registry.py`）· l2_live（`test_live_api.py`、`test_live_ws.py`）· webapi_contract（`test_webapi.py`）· offline_data_stream（12 个行情/实时/新闻文件）· offline_quant_trading（9 个量化/交易文件）——27/27 全覆盖

### 知识库文档

- `.codemaker/codeindex/backend/tests/_overview.md`（本文件）
- `.codemaker/codeindex/backend/tests/tests_infra.md`
- `.codemaker/codeindex/backend/tests/tests_l1_integrity.md`
- `.codemaker/codeindex/backend/tests/tests_l2_live.md`
- `.codemaker/codeindex/backend/tests/tests_webapi_contract.md`
- `.codemaker/codeindex/backend/tests/tests_offline_data_stream.md`
- `.codemaker/codeindex/backend/tests/tests_offline_quant_trading.md`

### 外部知识源（已摘抄入本知识库）

- `AGENTS.md`「Test Suite」 · `README.md`「三层测试 / 覆盖率」 · `backend/pyproject.toml`（markers + 覆盖率棘轮）
- `openspec/specs/`：`e2e-data-integrity`、`e2e-live-api`、`e2e-live-ws`、`e2e-test-infra`、`ci-quality-gates`、`global-news-pipeline` 等
- `openspec/changes/archive/`：`2026-08-20-full-stack-e2e-test-suite/design.md`（D1–D7 决策）、`2026-09-20-fix-live-test-order-flake/design.md`（抗抖动决策）、`2026-09-20-ci-lint-coverage/`（ruff/Biome/覆盖率棘轮与 pre-commit 一致性）
- 被各子文档引用的**被测侧规格**（用于判定「断言该跟实现还是跟规格」）：`realtime-ws`、`realtime-candle-push`、`kline-realtime-order-guard`、`ws-series-routing`、`timeframe-identifier-scheme`、`market-data-store`、`kline-ingestion`、`history-backfill`、`v3-history-channel`、`multi-market-hub`、`exchange-data-hub`、`market-endpoints`、`live-control`、`risk-checks`、`risk-position-model`、`live-safety`、`execution-core`、`circuit-breaker-enforcement`、`backtest-engine`、`quant-engine-vectorbt`、`memory-retrieval`、`reflection-engine`、`ai-agent-strategy`、`agent-context`、`global-news-pipeline`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）；入口符号 `backend.tests.conftest.live_server`、`backend.tests.data_registry.KNOWN_GAPS`、`backend.tests.test_data_integrity._classify_gaps`

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `tests_infra.md` | fixture 隔离与 `live_server` 生命周期、marker 选择策略、命令矩阵、覆盖率棘轮 | `tmp_settings`、`seed_store`、`live_server`、`pytest_collection_modifyitems`、`SEED_BASE=1_700_000_000_000`、`MD_TEST_SERVER_START_TIMEOUT=180` |
| `tests_l1_integrity.md` | 全量 Parquet 数据质量门禁、缺口三层分类（A/B/C）、白名单精确性契约 | `_classify_gaps`、`KNOWN_GAPS`、`STRUCTURAL_EXEMPTIONS`、`TYPE_A_MIN_STEPS=5` |
| `tests_l2_live.md` | 真实 uvicorn 进程的 REST 全端点成功/错误路径、`/ws` 协议矩阵、实测宽容语义 | `test_live_api.py`、`test_live_ws.py`、`_run_backtest_done`、`pytest.mark.live` |
| `tests_webapi_contract.md` | TestClient 层 Web API/WS 行为契约 + 假 stream/market/news/mcp 注入范式 | `_FakeStream`、`_FakeMarket`、`_FakeNewsBroker`、`MAX_JOBS=200`、`PENDING_TOKEN_TTL_SECONDS=300` |
| `tests_offline_data_stream.md` | 行情摄取/存储/时间周期 token/实时流/多通道 hub/新闻代理的不变式 | `timeframe_step_ms`、`ParquetStore`、`BitgetWsStream`、`MarketStream`、`RefCountSubscription` |
| `tests_offline_quant_trading.md` | 指标与结构引擎、DL 量化、因子 DSL、回测历史、风控、执行、Agent、记忆与编排 | `backtest`、`build_features`、`RiskEngine`、`LiveBroker`、`AgentCycle`、`run_circuit_breaker` |

## 模块概述

**业务定位**：本模块解决的是「在一个依赖外部行情源（Bitget/BlockBeats）与重型科学计算栈（vectorbt/sklearn）的量化交易仓库里，如何在不联网、不依赖上次执行顺序的前提下，证明数据链路与交易决策没有被改坏」这一业务问题。它把「数据是否连续且合法」「真实进程的 REST/WS 协议是否仍成立」「风控与 Agent 的决策顺序是否仍正确」三件事分别固化成可执行的断言，并在缺口类问题上引入「白名单 + 逐条清空」机制，使历史遗留缺根被登记而不是被静默忽略，同时保证任何**新增**缺根/乱序/非法 OHLC 立即使门禁变红。
（来源: `openspec/specs/e2e-data-integrity/spec.md`、`openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D4「缺口三层分类」）

**业务上游**：没有生产代码调用本模块，触发者是开发者与 CI——`cd backend && python -m pytest -q`（单元回归 + 自动跳过 L2）、`python -m pytest -m integrity`（L1 全量数据门禁）、`python -m pytest -m live --run-live`（L2 独立运行）、`--run-online` 才启用外部网络子集；CI 后端主 job 执行前两条，L2 放在独立 job，且**禁止**传 `--run-online`。L1 的触发还有一个被动入口：门禁打印的未登记微缺口明细由人工登记进 `data_registry.KNOWN_GAPS`，再交给 `backend/scripts` 回填。
（来源: `AGENTS.md`「Test Suite」、`openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/e2e-test-infra/spec.md`）

**业务下游影响**：本模块的输出是「能否合并」与「失败原因」两类结论，因此改动它会直接影响三件事：①门禁判定口径（例如把合法断言降级为豁免会让真实数据缺陷流入生产）；②`backend/scripts/backfill_micro_gaps.py` 的任务清单（它逐条遍历 `KNOWN_GAPS`，白名单语义变化会让回填脚本空跑或误跑）；③覆盖率阈值（`fail_under = 80` 是「只升不降」棘轮的下界，删测试会直接让 CI 覆盖率步骤失败）。此外 L2 的选择策略（`live` marker + `--run-live`）决定 `pytest -q` 是否会隐式拉起重型 uvicorn 子进程——这是历史上真实发生过的抖动根因。
（来源: `openspec/specs/ci-quality-gates/spec.md`「双端覆盖率门禁」、`openspec/changes/archive/2026-09-20-fix-live-test-order-flake/design.md`「决策 4」、`backend/pyproject.toml` `[tool.coverage.report]`）

## 架构简析

模块采用「**基础设施层（conftest 契约）→ 三层门禁（L1/L2/L3）→ 离线单元层**」的组织方式，没有生产代码意义上的分层，但有三条清晰的责任边界：

- **基础设施层**：`conftest.py` 只做三件事——环境隔离（`MD_DATA_DIR` 指向 tmp + `MD_SCHEDULE_INTERVAL_SECONDS=0` 关闭增量落盘）、确定性播种（`seed_store` 直接调用 `ParquetStore.save`，不经 ingest API）、以及 collection 阶段的 marker 门控（未传 `--run-live` 时 `live` 用例在收集期就被 skip，重型 fixture 根本不实例化）。`data_registry.py` 是纯数据注册表，被 L1 门禁与 `backend/scripts` 共同消费。
- **三层门禁**：L1 `test_data_integrity.py` 参数化展开 Parquet store 中全部 series；L2 `test_live_api.py` / `test_live_ws.py` 共享单个 session 级 `live_server`，分别打 HTTP 与 WebSocket；L3 在 `frontend/tests/e2e`（本模块只承载文档与命令契约）。
- **离线单元层**：约 20 个 `test_*.py` 直接 import `market_data.*`，用假对象（`_FakeStream`/`_FakeMarket`/`_FakeNewsBroker`/`_FakeMcpClient`、假 `ak` 对象、假 websockets）把不确定性收敛为确定性输入。多数 `test_*.py` 还保留 `_run_all()` 入口，可直接 `python tests/test_x.py` 执行（依赖 `PYTHONPATH=src`）。

**核心文件**：`conftest.py`（隔离与选择策略，全模块唯一共享状态来源）、`data_registry.py`（缺口契约）、`test_data_integrity.py`（L1 门禁）、`test_webapi.py`（最大单体，84 个用例的 Web API/WS 行为契约）。

**关键数据流**：`pytest` 收集 → `pytest_addoption` 解析 `--run-live/--run-online` → `pytest_collection_modifyitems` 打 skip 标记 → `tmp_settings`（隔离 Settings）→ `seed_store`/`live_server` 播种 Parquet → 断言。L2 的进程链路为 `live_server` → `_spawn_live`（`python -m uvicorn market_data.webapi:create_app --factory`，cwd=`backend/`）→ `_wait_for_ready`（`/health` 权威信号 + `Uvicorn running on` 日志加速信号）→ yield base URL → teardown `terminate → wait(5) → kill`。

**扩展点**：新增测试的规范做法是「在既有 `test_*.py` 内按主题追加用例」或「新建 `test_<domain>.py` 复用 conftest fixture」。新增需要外部网络或真实进程的用例，必须分别打 `@pytest.mark.online` / `pytest.mark.live` 并声明对应模块级 `pytestmark`——不打标记会让 `pytest -q` 变慢且不稳定。新增子目录会破坏 `testpaths = ["tests"]` 下的扁平结构假设与本文档的覆盖声明，需同步更新本节与 `AGENTS.md`。

## 上下游关系

> `extracted` = 静态分析/import 关系可验证；`inferred` = Agent 推断待复核

**上游（谁触发/驱动本模块）**

| 上游 | 方式 | 依据 | confidence |
|------|------|------|------------|
| 开发者手工执行 | `cd backend && python -m pytest -q` / `-m integrity` / `-m live --run-live` | `AGENTS.md`「Test Suite」命令矩阵 | extracted |
| CI（`.github/workflows/ci.yml`） | 后端主 job（`ruff check` → `ruff format --check` → `pytest -q` → `pytest -m integrity` → `pytest -q --cov`）+ L2 独立 job（`--run-live`），`uv sync --frozen` 安装依赖；L3 Playwright 故意不入 CI；`--run-online` 明令禁止 | `openspec/specs/ci-quality-gates/spec.md`、`.github/workflows/ci.yml` | extracted |
| `backend/pyproject.toml` | 提供 markers 定义、`testpaths`、覆盖率 `fail_under`（覆盖率不达标即失败） | 配置文件本身 | extracted |
| L1 失败输出（间接） | 门禁打印未登记微缺口 → 人工登记 `KNOWN_GAPS` → 运行 `backend/scripts` 回填 | `backend/tests/data_registry.py` docstring | inferred |

**下游（本模块影响谁）**

| 下游 | 影响 | confidence |
|------|------|------------|
| PR 合并门禁 | 任一断言失败即阻断合并；覆盖率低于 `fail_under=80` 同样失败 | extracted |
| `backend/src/market_data` | 测试是该包各模块行为的可执行契约（如 timeframe token 规则、风控闸门、WS 路由）；测试通过不代表行为不可变，而是当前行为被冻结 | extracted |
| `backend/scripts/backfill_micro_gaps.py` | 逐条遍历 `KNOWN_GAPS`；白名单为空时脚本是 no-op，语义变化会让回填空跑 | extracted |
| `data/parquet` 真实数据目录 | L1 只读校验，绝不写入；`tmp_settings` 保证其余测试不触碰生产数据 | extracted |
| `frontend/tests/e2e` | L3 浏览器旅程与本模块组成同一金字塔，命令矩阵需保持一致 | inferred |

## 变更风险速览（详见子文档）

- **降级合法断言换取「变绿」**：把 `open_time` 严格递增 / OHLC 合法性接入豁免机制，或把 `test_adjacent_spacing_equals_step` 的未登记微缺口从失败改为告警 → 真实数据缺陷（乱序、负 volume、缺根）将不再被拦截，且 `backend/scripts` 的白名单也失去意义。
- **白名单语义被改**：`KNOWN_GAPS` 条目以「已登记即已修复」处理，或删除 `test_gap_classification_consistent` 的 stale 断言 → 白名单无限膨胀，将来同区间的新缺根被旧条目掩盖。
- **L2 选择策略被破坏**：删除 `test_live_api.py`/`test_live_ws.py` 的 `pytestmark = pytest.mark.live`，或让 `pytest_collection_modifyitems` 不再在收集期跳过 → 普通 `pytest -q` 隐式拉起重型 uvicorn，复现曾经的「332 passed, 47 errors / 固定 45s 超时抖动」。
- **就绪判定退化为固定超时**：把 `_wait_for_ready` 的自适应上限改回固定值，或移除 `MD_TEST_SERVER_START_TIMEOUT` 覆盖能力 → 机器负载高时 L2 假失败，并失去「进程是否存活 vs 是否监听」的诊断能力。
- **在 session 级 live_server 上做顺序敏感断言**：新用例假定 `/portfolio` 为空或某告警不存在 → 与 Agent/订单用例互相污染（既有用例用 `pytest.skip` 与「先清理/后断言」显式规避此风险）。
- **修改 `_seed` 的价格形态**：价格被刻意停在支撑位附近（`closes[-1] = min + 0.01`）以驱动规则 Agent 决策；改动会让 `/agent/decide` 相关断言失效。
- **把「CI 绿」当「数据已验证」**：CI 的 checkout 不含 `backend/data/parquet`（该目录从未被 git 跟踪），L1 步骤在 CI 上必然整体 skip；把 L1 当成 CI 已覆盖的门禁，会让真实数据退化只在个别开发机上暴露（来源: `.github/workflows/ci.yml` L1 步骤注释「skips w/o data」+ `git ls-files backend/data` 为空）。
- **按规格文字收窄类型 B 判定**：`e2e-data-integrity` 规格与 `data_registry.py` docstring 都写「类型 B = 1~2 步」，但实现判定是 `1 < mult < TYPE_A_MIN_STEPS(5)`（2/3/4 步全算 B）。以字面描述为准改代码，会让 3~4 步缺口被划成类型 A 而**永久豁免**，等价于删掉一条硬门禁（详见 `tests_l1_integrity.md`）。
