# Tasks — 移除 AI Agent 与量化全部内容

> 顺序：后端引擎 → 后端入口/启动期 → 依赖与后端回归 → 前端类型收敛 → 前端组件 → 客户端/文案 → 规格文档 → 全局复核。
> 保留红线：`indicators.py` / `levels.py` / `smc.py` / `structure.py` / `vectorbt` / 行情底座 / 新闻管线 / 终端 UI / `agent_hub-main` 一律不动。

## 1. 后端：删除自研 Agent 与量化模块

- [x] 1.1 删除 `backend/src/market_data/agent.py`
- [x] 1.2 删除 `backend/src/market_data/llm.py`
- [x] 1.3 删除 `backend/src/market_data/memory.py`
- [x] 1.4 删除 `backend/src/market_data/orchestration.py`
- [x] 1.5 删除 `backend/src/market_data/execution.py`
- [x] 1.6 删除 `backend/src/market_data/risk.py`
- [x] 1.7 删除 `backend/src/market_data/appconfig.py`
- [x] 1.8 删除 `backend/src/market_data/dlquant.py`
- [x] 1.9 删除 `backend/src/market_data/factors.py`
- [x] 1.10 删除 `backend/src/market_data/backtest_history.py`

## 2. 后端：清理入口与启动期注入

- [x] 2.1 `webapi.py`：移除已删模块的 import（`dlquant` / `factors` / `BacktestHistoryStore` / agent / execution / risk / appconfig / orchestration）
- [x] 2.2 `webapi.py`：删除 7 条量化路由（`/backtest`、`/jobs/{job_id}`、`/backtest/sweep`、`/backtest/walkforward`、`/backtest/history`、`GET/DELETE /backtest/history/{run_id}`、`/dl/features`）及 `_model_from_params` 助手
- [x] 2.3 `webapi.py`：删除 agent/执行路由（`/agent/decide`、`/agent/cycle`、`/portfolio`、`/journal`、`/control`、`/order`、`/order/confirm`）
- [x] 2.4 `webapi.py`：删除 `/config`（provider/risk 配置）端点；**保留** `/chart-config`
- [x] 2.5 `webapi.py`：删除启动期 `dlquant.warmup()`、`BacktestHistoryStore` 初始化、`build_orchestrator(...)` 编排任务注册
- [x] 2.6 `webapi.py`：确认 `GET /health` 不再依赖已删的 run-control（移除 `kill_switch`/`live_enabled` 或改由常量返回；更新相关响应模型）
- [x] 2.7 `cli.py`：删除 `backtest` / `agent` / `memory` / `orchestrate` / `trade` / `risk-check` 子命令与对应 import
- [x] 2.8 `config.py`：移除 agent/编排相关配置项（`MD_AGENT_SCHEDULE_ENABLED` 等）；同步 `backend/.env.example`
- [x] 2.9 `__init__.py`：移除已删模块的导出（如有）

## 3. 后端：依赖与回归

- [x] 3.1 `backend/pyproject.toml`：移除 `scikit-learn`、`quantstats`（**保留** `vectorbt` 及其 plotly 注释）
- [x] 3.2 删除 `backend/tests/test_agent.py`、`test_memory.py`、`test_orchestration.py`、`test_execution.py`、`test_risk.py`、`test_dlquant.py`、`test_factors.py`、`test_backtest_history.py`
- [x] 3.3 `backend/tests/test_live_api.py`：移除 backtest / agent / order / portfolio / journal / control / config 用例与 helper
- [x] 3.4 `backend/tests/test_webapi.py`：移除 agent/order/quant 相关用例
- [x] 3.5 `backend/tests/test_offline.py` 与 `conftest.py`：移除依赖已删模块的用例与 fixture
- [x] 3.6 运行 `cd backend && python -m pytest -q`，确认全绿（重点：`create_app()` 可构造、`/health` 可用、`indicators`/`levels` 用例通过）
- [x] 3.7 运行 `cd backend && ruff check . && ruff format --check .`

## 4. 前端：收敛联合类型与工作区路由

- [x] 4.1 `types/trading.ts`：`DesktopViewMode` 移除 `'agent'`；`BottomTab` 移除 `'trading'` / `'strategy'`
- [x] 4.2 运行 `cd frontend && npm run typecheck`，记录所有报错点作为清理清单
- [x] 4.3 `App.tsx`：移除 `AgentView` / `OrderModal` 路由与 import、工作区 `activeView === 'agent'` 分支
- [x] 4.4 `App.tsx`：移除模拟账户/持仓/挂单 state 与 `handlePlaceOrder` / `handleClosePosition` / `handleCancelOrder` / `handleResetPaperAccount`、mock `backtestResult`
- [x] 4.5 `components/desktop/GlobalNavRail.tsx`：移除 Agent 导航项与下单按钮（`onOpenOrderModal`）
- [x] 4.6 `components/desktop/DesktopTitleBar.tsx`：移除 `getTabIcon` 的 `'agent'` 分支与新建标签菜单中的 Agent 项
- [x] 4.7 `components/modals/CommandPaletteModal.tsx`：移除 Agent 与下单相关命令
- [x] 4.8 `components/bottom/BottomDock.tsx`：Tab 收敛为 筛选器 / 文本备注；移除 `StrategyTester` / `TradingPanel` import、渲染分支、`backtestResult` 与交易相关 props

## 5. 前端：删除组件与死代码

- [x] 5.1 删除 `components/views/AgentView.tsx`
- [x] 5.2 删除 `components/views/agent/` 整个目录（QUANT LAB + AI Agent 面板及全部 `.test.tsx`）
- [x] 5.3 删除 `components/bottom/StrategyTester.tsx`、`components/bottom/TradingPanel.tsx`（含 `TradingPanel.test.tsx`）
- [x] 5.4 删除 `components/modals/OrderModal.tsx`
- [x] 5.5 删除 `lib/chartData.ts`、`lib/metricCards.ts`、`lib/signalMarks.ts` 及 `.test.ts`
- [x] 5.6 删除 `utils/pineEngine.ts`、`utils/indicators.ts`

## 6. 前端：清理 API 客户端、类型与文案

- [x] 6.1 `api/client.ts`：移除 `backtest` / `backtestHistory*` / `dlFeatures` / `sweep` / `walkforward` / `decide` / `cycle` / `portfolio` / `journal` / `control` / `order` / `orderConfirm` / `config` 方法与 import
- [x] 6.2 `api/types.ts`：移除 `Backtest*` / `Sweep*` / `WalkForward*` / `DlFeatures*` / `FactorDef` / `Agent*` / `Portfolio*` / `Order*` 等类型
- [x] 6.3 `types/trading.ts`：移除 `BacktestResult` / `Position` / `Order` / `AccountState` 等类型
- [x] 6.4 `lib/i18n.ts`：移除 agent/量化/下单相关文案；同步更新 `lib/i18n.test.ts`

## 7. 前端：验证

- [x] 7.1 删除 `frontend/tests/e2e/quant-lab.spec.ts`；检查 `panels.spec.ts` / `user-journeys.spec.ts` 中对 Agent/交易面板/策略回测的引用并同步
- [x] 7.2 运行 `cd frontend && npm run typecheck`，通过
- [x] 7.3 运行 `cd frontend && npm run test`，通过
- [x] 7.4 运行 `cd frontend && npm run lint && npm run build`，通过

## 8. 规格与文档

- [x] 8.1 确认本变更 delta 覆盖全部受影响 capability（46 整条 REMOVED + 6 部分变更）
- [x] 8.2 `README.md` / `README.en.md`：移除量化与 AI Agent 段落（简介/特性/技术栈/环境变量/CLI/API/结构图），定位改为「行情交易平台，待接入 agent harness」
- [x] 8.3 `AGENTS.md`：更新测试/结构与描述，删除对已移除能力的引用

## 9. 全局复核

- [x] 9.1 全局 grep 无残留：`dlquant`、`factors`、`backtest`、`QUANT LAB`、`QuantLabPanel`、`TradingAgent`、`ExecutionEngine`、`MemoryStore`、`RunControl`、`/agent/`、`/order`、`/portfolio`、`/control`、`StrategyTester`、`TradingPanel`
- [x] 9.2 保留红线复核：`indicators.py`/`levels.py`/`smc.py`/`structure.py` 均在；`pyproject.toml` 仍有 `vectorbt`；新闻与终端组件均在
- [x] 9.3 `create_app()` 冒烟：启动 uvicorn 后 `GET /health`、`GET /candles`、`GET /news/categories`、`GET /chart-config` 返回 2xx
- [x] 9.4 运行 `openspec validate remove-agent-and-quant --strict`，通过
