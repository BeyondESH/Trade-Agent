# 移除 AI Agent 与量化全部内容，保留交易平台，后续接入 agent harness 重建

## Why

项目定位发生根本调整：**卸掉现有自研的 AI Agent 与量化研究全部实现，只保留行情数据底座、交易终端 UI 与新闻管线，作为后续 agent harness 框架的落地平台。**

现有仓库里有两套与"平台"无关的自研垂直链路：

1. **量化研究链路**：`dlquant.py` / `factors.py` / `backtest_history.py` + QUANT LAB 一整套前端面板 + 底部策略回测。这是面向"人肉量化研究"的能力，与未来 harness 无关。
2. **自定义 AI Agent 链路**：`agent.py` / `llm.py` / `memory.py` / `orchestration.py` / `execution.py` / `risk.py` + `/agent/*` `/order` `/portfolio` `/control` 等端点 + 前端 Agent 页面与交易面板。这套自研编排/记忆/执行/风控将被外部 **agent harness 框架**取代。

两条链路都不是平台底座，却占据大量代码、依赖（`scikit-learn` / `quantstats`）、端点、测试与规格。把它们整体清空，可以让仓库回到一个干净的"行情 + 终端 + 新闻"平台，等待 harness 接入。

## What Changes

### 删除 — 量化研究层

- **BREAKING** 删除 `dlquant.py`、`factors.py`、`backtest_history.py` 与 7 条量化 REST 路由（`/backtest`、`/jobs/{id}`、`/backtest/sweep`、`/backtest/walkforward`、`/backtest/history*`、`/dl/features`）及启动期 warmup / 回测历史存储初始化 / `_model_from_params` / 请求体 `factors` 字段。
- **BREAKING** 删除 CLI `backtest` 子命令与 QUANT LAB 前端整套组件；删除底部「策略回测」tab（`StrategyTester`）与 `utils/pineEngine.ts`、`utils/indicators.ts`。

### 删除 — 自定义 AI Agent 层

- **BREAKING** 删除 `agent.py`、`llm.py`、`memory.py`、`orchestration.py` 及 CLI `agent` / `memory` / `orchestrate` 子命令。
- **BREAKING** 删除执行与风控层 `execution.py`、`risk.py`、`appconfig.py` 及 CLI `trade` / `risk-check`，删除 `orchestration` 在 FastAPI 启动期的编排任务注册。
- **BREAKING** 删除端点：`/agent/decide`、`/agent/cycle`、`/portfolio`、`/journal`、`/control`、`/order`、`/order/confirm`、`/config`（provider 配置；`/chart-config` 保留）。
- **BREAKING** 删除前端 Agent 页面（`AgentView` 及 `components/views/agent/**` 全部组件）、底部「交易面板」（`TradingPanel`）、手动下单（`OrderModal`），以及导航栏/标签栏/命令面板中的 Agent 与下单入口。
- **BREAKING** `DesktopViewMode` 收敛去除 `'agent'`；`BottomTab` 收敛为 筛选器 / 文本备注。

### 依赖

- 移除仅量化使用的 `scikit-learn`、`quantstats`。
- **保留** `vectorbt`（`indicators.py` 运行时依赖，非量化专属）。

### 保留（平台底座）

- 行情数据底座：`ingestion` / `realtime` / `streamhub` / `store` / `scheduler` / `mcp_client` / `models` / `discover` / `excel_export` / `events`。
- 指标与结构底座：`indicators.py` / `levels.py` / `smc.py` / `structure.py`。
- 新闻管线：`newsfeed` / `news_broker` / `blockbeats` / `blockbeats_cache`。
- 终端与存储：图表 / 市场 / 筛单 / 热力 / 社区 / 新闻 / 告警 / 自选股 / 盘口 / `chartstore` / `alertstore`。
- `agent_hub-main/`（独立 MIT 参考项目）。

### 规格

- 同步清理 52 个 capability 的规格：18 个量化 + 26 个 agent 整条 REMOVED，`ai-agent-page` / `trading-ui` 整条 REMOVED，`quant-indicators` 部分 REMOVED，`bottom-dock` / `reskinned-panels` MODIFIED+REMOVED，`api-client` / `ui-i18n-zh` / `e2e-live-api` MODIFIED。

## Capabilities

### New Capabilities

无。本变更为纯移除，不引入新能力。

### Removed Capabilities（整条移除，46）

> 实现方式：直接删除 `openspec/specs/<capability>/` 目录。OpenSpec 不支持把 capability 清空（重建后无 requirement 会校验失败），故整条移除以目录删除表达，不产生 delta 文件。

- **A. 量化研究层（18）**：`backtest-engine`、`backtest-analysis-ui`、`backtest-history`、`dl-quant-workbench`、`factor-workbench`、`feature-engineering`、`ml-model`、`quant-data-selection`、`quant-engine-vectorbt`、`quant-factor-ic`、`quant-lab-panel`、`quant-model-control`、`quant-model-diagnostics`、`quant-model-training`、`quant-parameter-sweep`、`quant-signal-kline`、`quant-walk-forward`、`walk-forward-training`。
- **B. 自定义 AI Agent / 执行 / 风控 / 记忆层（27）**：`agent-analysis-ui`、`agent-context`、`agent-cycle`、`agent-decision`、`agent-endpoints`、`agent-execution`、`ai-agent-page`、`ai-agent-strategy`、`circuit-breaker-enforcement`、`drawdown-circuit-breaker`、`execution-core`、`live-control`、`live-safety`、`llm-provider`、`memory-integration`、`memory-retrieval`、`orchestration-jobs`、`paper-broker`、`position-sizing`、`reflection-engine`、`risk-checks`、`risk-config`、`risk-position-model`、`run-control`、`strategy-config-ui`、`trade-journal`、`config-persistence`。
- **C. 终端交易面板（1）**：`trading-ui`（交易面板与控制、实时快照刷新整条移除）。

### Modified Capabilities（部分变更，6）

- **D. 终端交互（2）**：`bottom-dock`（Tab 栏收敛为 筛选器 / 文本备注；「回测面板」「交易面板」要求移除）；`reskinned-panels`（「底部 Tab 面板」收敛；「下单区与确认」要求移除）。
- **E. 客户端与文案（2）**：`api-client`（覆盖范围移除 回测/Agent/控制/下单/`/config`）；`ui-i18n-zh`（移除 `components/views/agent/**` 子树相关条款）。
- **F. 测试规格（1）**：`e2e-live-api`（端点成功路径覆盖收缩至保留的 21 个端点；「离线可运行」移除 agent 相关表述）。
- **G. 保留指标底座（1）**：`quant-indicators`（仅移除「因子目录适配」，保留「vectorbt 指标计算」「指标无前视与确定性」）。

## Impact

**后端删除文件**

- `agent.py`、`llm.py`、`memory.py`、`orchestration.py`
- `execution.py`、`risk.py`、`appconfig.py`
- `dlquant.py`、`factors.py`、`backtest_history.py`

**后端修改文件**

- `webapi.py`：移除上述模块 import；移除 7 条量化路由 + 8 条 agent/执行路由 + `/config`；移除启动期 `warmup` / `BacktestHistoryStore` / `build_orchestrator` 编排注册。
- `cli.py`：移除 `backtest` / `agent` / `memory` / `orchestrate` / `trade` / `risk-check` 子命令。
- `config.py`：移除 agent/编排相关配置项（如 `MD_AGENT_SCHEDULE_ENABLED`），同步 `backend/.env.example`。
- `__init__.py`：移除已删模块的导出（如有）。
- `pyproject.toml`：移除 `scikit-learn`、`quantstats`（保留 `vectorbt`）。

**前端删除文件**

- `components/views/AgentView.tsx` 与 `components/views/agent/**` 全部组件及测试。
- `components/bottom/StrategyTester.tsx`、`components/bottom/TradingPanel.tsx`（含测试）。
- `components/modals/OrderModal.tsx`。
- `lib/chartData.ts`、`lib/metricCards.ts`、`lib/signalMarks.ts`（含测试）。
- `utils/pineEngine.ts`、`utils/indicators.ts`。

**前端修改文件**

- `App.tsx`：移除 Agent 路由、OrderModal、模拟账户/持仓/挂单 state、`handlePlaceOrder` / `handleClosePosition` / `handleCancelOrder` / `handleResetPaperAccount`、mock `backtestResult`。
- `components/bottom/BottomDock.tsx`：Tab 收敛为筛选器/文本备注。
- `components/desktop/GlobalNavRail.tsx`、`DesktopTitleBar.tsx`、`components/modals/CommandPaletteModal.tsx`：移除 Agent 与下单入口。
- `types/trading.ts`：移除 `DesktopViewMode` 的 `'agent'`、`Backtest*`、`Position`、`Order`、`AccountState` 等类型。
- `api/client.ts` / `api/types.ts`：移除量化/agent/order/portfolio/control/config 方法与类型。
- `lib/i18n.ts`：移除相关文案，更新 `i18n.test.ts`。

**测试**

- 删除：`backend/tests/test_agent.py`、`test_memory.py`、`test_orchestration.py`、`test_execution.py`、`test_risk.py`、`test_dlquant.py`、`test_factors.py`、`test_backtest_history.py`；`frontend/tests/e2e/quant-lab.spec.ts` 及随组件删除的前端单测。
- 修改：`test_offline.py`、`test_live_api.py`、`test_webapi.py`、`conftest.py`（移除 agent/order/quant 相关用例与 fixture）。

**风险与验证**

- ⚠️ `indicators.py` 运行时 `import vectorbt`，`vectorbt` 依赖**必须保留**。
- ⚠️ 删除执行层后终端无手动下单入口；须确认 `OrderModal` / `TradingPanel` 的引用全部收敛，否则 typecheck 报错。
- ⚠️ 删除编排层后须确认 FastAPI 启动不再引用 `build_orchestrator` / `AgentCycle`。
- 验证：`cd backend && python -m pytest -q` 全绿；`cd frontend && npm run test && npm run typecheck && npm run build` 通过；全局 grep 无残留。
