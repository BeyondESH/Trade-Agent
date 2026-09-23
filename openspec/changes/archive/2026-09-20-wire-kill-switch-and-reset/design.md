## Context

后端运行控制已完整：`RunControl`（`orchestration.py:39`，`paper_only`/`kill_switch`/`enabled`）经 `PUT /control`（`webapi.py:896`）读写，`GET /health`（`webapi.py:347`）返回 `{status, kill_switch, live_enabled}`，且 `can_trade()` 被 `POST /order`（`webapi.py:906`）与 `POST /order/confirm`（`webapi.py:919`）用作全局闸门。前端 `api.control()`（`client.ts:188`）已存在，但全仓库无调用点。

同时存在两处死代码（grep 验证零调用点）：`App.tsx:651` 的 `handleResetPaperAccount`（重置本地模拟 `account`/`positions`/`orders`）与 `App.tsx:668` 的 `handleRunStrategy`（`POST /backtest` + `GET /jobs/{id}` 轮询）；i18n `Reset Funds`（`i18n.ts:195`）亦未使用。

相关规格：`trading-ui`「交易面板与控制」（kill-switch + 实盘二次确认）、`run-control`（后端 kill-switch 语义）、`bottom-dock`「交易面板」（面板展示）与「回测面板」（回测链路保留）、`live-control`（后端拒单）。物理容器方面，`TradingPanel` 由 `BottomDock.tsx:154` 渲染，`CyclePanel` 位于 AI Agent 页，`StrategyTester` 仅接收 `result` 展示、无运行控件。

## Goals / Non-Goals

**Goals:**
- kill-switch 有可见 UI，状态与后端一致，可开可关。
- `Reset Funds` 接入 `handleResetPaperAccount`，重置本地模拟账户。
- 清理死代码 `handleRunStrategy`。
- 用组件测试 + e2e 锁定，且不污染其它串行用例。

**Non-Goals:**
- 不改后端 `PUT /control`/`GET /health` 行为，不改 `run-control`/`live-control` 的后端语义。
- 不提供「开启实盘」入口：`live_enabled` 仅只读展示（默认纸面安全）。
- 不把 `StrategyTester` 扩展成完整策略运行配置界面。

## Decisions

**决策 1：kill-switch 放置于底部交易面板账户摘要条（`TradingPanel` header）**

- 理由：`PUT /control` 是全局闸门，影响 `POST /order`、`POST /order/confirm`、`/agent/cycle`；底部交易面板在图表工作区常驻且与下单入口同屏，最贴近「下单前检查 / 一键停机」。
- 备选：放 Agent 页 `CyclePanel`——仅在 AI Agent 页可见，手动下单/图表场景无法随手停机，弃用。
- 备选：放顶部 title bar / 命令面板——改动面大且需联动 `topbar-controls`，超出本次范围，弃用。

**决策 2：状态源用 `GET /health`，切换以后端为准**

- 初始化 `useEffect` 拉 `/health`；切换时 `await api.control({ kill_switch: next })`，用返回体（必要时重取 `/health`）刷新本地状态，避免乐观更新与后端不一致。
- `api.health()` 类型扩展为 `{ status: string; kill_switch: boolean; live_enabled: boolean }`（后端 `webapi.py:347` 已返回）。
- 关闭通过 `PUT /control { kill_switch: false }`；`live_enabled` 只读展示，不提供切换入口（实盘开关属高风险，规格只要求默认纸面 + 下单二次确认）。

**决策 3：`Reset Funds` 用回调 prop 下传**

- `App.handleResetPaperAccount` 重置本地 `account`/`positions`/`orders`（`App.tsx:651`），经 `BottomDock` 透传为 `TradingPanel` 新 prop `onResetAccount`；按钮复用既有 i18n `Reset Funds`。
- 不做二次确认：仅重置本地模拟账户，无资金/下单副作用；与实盘下单的 `confirm token` 二次确认（`/order`→`/order/confirm`）区分。
- 备选：`TradingPanel` 自管模拟账户——与现状（App 持有 account/positions/orders）冲突，改动过大，弃用。

**决策 4：`handleRunStrategy` 判定为删除**

- 现状：`StrategyTester` 只接收 `result` 展示，无脚本输入/运行控件；`handleRunStrategy(scriptCode, scriptName)` 需脚本与命名参数才有意义，接入需新增策略配置 UI，超出本 change。
- 后端回测链路未丢失：Agent 页 `BacktestControls`/QuantLab 经 `api.backtest()` 调用 `POST /backtest` + `GET /jobs/{id}`，满足 `bottom-dock`「回测面板」需求。
- 结论：删除 App 内无引用重复函数，避免死代码漂移；未来若需在图表页直接跑回测，另立 change 引入策略配置 UI。
- 备选：保留待用——与「清理死代码」目标相悖，弃用。

**决策 5：测试策略**

- 组件测试：`vi.mock('../../api/client')`，覆盖 kill-switch 初值渲染（`health.kill_switch=true` 显示停机）、点击调用 `api.control({ kill_switch: true })`、`Reset Funds` 点击触发 `onResetAccount`、history/positions 分支回归。
- e2e：在 `user-journeys.spec.ts`（`mode: "serial"`）新增用例——打开交易面板 → 断言 kill-switch 控件可见 → 打开后断言停机态 → **关闭并断言恢复**；Reset Funds 点击后断言模拟余额回到初始值（可选）。
- 注意与既有 `paper order flow` 用例的串行顺序：kill-switch 用例结束必须复位，否则后续下单用例会被拒。

## Risks / Trade-offs

- [kill-switch 是全局状态，e2e 失败可能遗留停机导致后续用例失败] → 用例内使用 `try/finally` 或在末尾显式关闭；`user-journeys.spec.ts` 串行执行。
- [`Reset Funds` 会清空本地持仓，可能与视觉预期不符] → 仅作用于模拟账户，按钮文案明确为「重置资金」。
- [`handleRunStrategy` 删除后若未来需要] → 由后续 change 新增策略配置 UI，复用 `BacktestControls` 模式。
- [`health()` 类型收紧可能影响既有调用方] → 仅新增字段（原有 `status` 保留），既有 `api.health()` 调用兼容。

## Open Questions

- kill-switch 是否需要二次确认（防误触停机/恢复）？本期决定不做，可在实现评审时再定。
