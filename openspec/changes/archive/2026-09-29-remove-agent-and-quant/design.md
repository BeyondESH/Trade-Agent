# Design — 移除 AI Agent 与量化全部内容

## Context

这是一次**大规模纯删除型**变更（"平台归零"），不新增行为。核心挑战不是删文件，而是**在删除自研 Agent/执行层的同时，保住平台底座与终端接线不被连带击穿**。

两条被删的垂直链路与平台的依赖关系：

```
                        平台底座（保留）
        ┌───────────────────────────────────────────────┐
        │ 行情: ingestion realtime streamhub store        │
        │       scheduler mcp_client models               │
        │ 指标: indicators levels smc structure           │
        │ 新闻: newsfeed news_broker blockbeats*          │
        │ 终端: chart markets screener heatmaps news ...  │
        └───────┬───────────────────────────────┬────────┘
                │                               │
   自研 Agent 链路（删）              量化研究链路（删）
   agent llm memory orchestration     dlquant factors
   execution risk appconfig           backtest_history
   /agent/* /order /portfolio         /backtest /sweep
   /journal /control /config          /walkforward /dl/features
   AgentView / TradingPanel           QUANT LAB / StrategyTester
```

**两处隐藏缠绕**决定了删除顺序：

1. `orchestration.py` 被 **FastAPI 启动期**引用（`build_orchestrator` 注册 data_pull / agent_cycle / retrain / circuit_breaker 定时任务）。
2. `execution.py` / `risk.py` 被**终端手动下单**引用（`OrderModal` → `POST /order` → 风控闸门）。

## Goals / Non-Goals

**Goals**
- 自研 Agent / LLM / 记忆 / 编排 / 执行 / 风控模块与其全部端点、CLI、前端、测试、规格彻底移除。
- 量化研究层彻底移除。
- 平台底座（行情 / 指标 / 新闻 / 终端）**功能零变化**。
- 仓库回到可接入 agent harness 的干净状态。

**Non-Goals**
- 不实现 agent harness 接入（后续独立变更）。
- 不改 `indicators.py` / `levels.py` / `smc.py` / `structure.py` 实现。
- 不删 `vectorbt` 依赖。
- 不删新闻管线与交易终端。
- 不删 `agent_hub-main/`。

## Decisions

### 决策 1：执行/风控层整体删除，终端手动下单链路一并移除

用户明确："执行与风控层算 AI agent 内容，一并删除（含手动下单链路）"。理由：这套 `ExecutionEngine` / `RiskGate` / `PaperBroker` 是为自研 Agent 交易循环设计的，未来 harness 会自带或重建执行语义，保留只会留下与 harness 不一致的旧契约。

代价是终端失去手动下单：

```
删除前： OrderModal ─► /order ─► risk gate ─► PaperBroker
删除后： OrderModal ✗   /order ✗   risk.py ✗   execution.py ✗
         → OrderModal 组件、/order /order/confirm 端点、相关 state 全删
```

终端仍保留**只读**的交易观察能力（盘口、成交、K 线、资金费率），只是不能下单。

### 决策 2：剪断 Agent 在 FastAPI 启动期的编排注入

`webapi.py` 启动期构造 `build_orchestrator(...)` 并注册 4 类定时任务。删除自研 Agent 后：

| 定时任务 | 处置 |
|---|---|
| `data_pull`（定时增量抓数） | 由 `scheduler.py`（平台调度）承担，**保留数据抓取链路**，但不再经 `orchestration` |
| `agent_cycle` | 删除 |
| `retrain`（DL 重训） | 删除 |
| `circuit_breaker`（熔断保护平仓） | 删除（属执行/风控层） |

须确认启动不再 import `orchestration` / `AgentCycle` / `RunControl`，否则应用工厂导入即崩。

### 决策 3：`vectorbt` 保留，`scikit-learn` / `quantstats` 删除

同上一版判断，按"是否有保留代码 import"判定：

| 依赖 | 保留代码是否使用 | 结论 |
|---|---|---|
| `vectorbt` | `indicators.py` 运行时 `vbt.MACD/BBANDS/RSI/ATR` | **保留** |
| `scikit-learn` | 仅 `dlquant.py` | 删除 |
| `quantstats` | 全库无真实 import | 删除 |

### 决策 4：前端联合类型收敛用编译器定位残留

`DesktopViewMode` 去 `'agent'`、`BottomTab` 去 `'trading'` / `'strategy'` 后，跑 `npm run typecheck` 让 TS 精确报出所有比较/赋值点，再逐处收敛。涉及入口：`GlobalNavRail`（导航项）、`DesktopTitleBar`（`getTabIcon` + 新建标签菜单）、`CommandPaletteModal`（命令项）、`App.tsx`（工作区路由 + 传参）。

### 决策 5：规格用 REMOVED/MODIFIED delta，混合规格只摘除相关 requirement

- **整条移除（46 个）**：delta 内 `## REMOVED Requirements` 列出该 capability 全部 requirement（含 Reason / Migration）。
- **混合规格** `quant-indicators`：只 REMOVE「因子目录适配」，保留指标计算要求（`indicators.py` 保留）。
- **部分修改** `bottom-dock` / `reskinned-panels` / `api-client` / `ui-i18n-zh` / `e2e-live-api`：`## MODIFIED Requirements` 给出完整新内容；`bottom-dock` / `reskinned-panels` 另有 `## REMOVED Requirements`。

### 决策 6：删除顺序 = 后端引擎 → 后端入口 → 依赖回归 → 前端类型收敛 → 前端组件 → 规格文档

先让后端能 import、测试全绿，再动前端；前端先删类型成员让编译器指路。避免"半删"状态长时间存在。

## Risks / Trade-offs

- **风险：启动期编排注入漏删 → 应用导入崩溃。** 缓解：决策 2 的清单 + 后端 `pytest -q` 验证 `create_app()` 可构造。
- **风险：误删 `vectorbt` → `indicators` 崩溃。** 缓解：决策 3 + 保留红线复核。
- **风险：终端手动下单删除后遗留死引用 → typecheck 失败。** 缓解：决策 4 的编译器定位。
- **风险：`i18n.test.ts`、`panels.spec.ts`、`user-journeys.spec.ts` 断言被删文案/组件。** 缓解：随删随改，纳入验证清单。
- **权衡：平台暂时失去自动交易与手动下单能力。** 接受——这正是"归零待 harness"的预期状态。
- **权衡：46 个 capability 规格被清空。** 接受——规格须反映"这些能力当前不存在"这一事实；harness 接入时另立新规格。

## Migration Plan

无数据迁移需求（删除的是代码能力，非持久数据格式；`data/` 下的 parquet 行情数据保留）。单次变更，按决策 6 顺序执行。

## Open Questions

无。范围（agent+quant 全删）、执行/风控归属（一并删）、终端保留（保留 UI）、`agent_hub-main`（保留）均已与用户确认。
