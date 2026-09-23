## Why

后端已实现 `PUT /control`（`kill_switch` / `live_enabled`，见 `webapi.py:896`）与 `GET /health` 状态回报（`webapi.py:347`），前端 `api.control()`（`client.ts:188`）也已就绪，但**没有任何组件调用它**——`trading-ui` 规格要求提供 kill-switch 运行控制，实际 UI 缺失，用户在异常行情或 agent 失控时无法一键停机。同时 `App.tsx` 的 `handleResetPaperAccount`（`App.tsx:651`）与 i18n `Reset Funds`（`i18n.ts:195`）均无调用点，模拟账户无法重置；`handleRunStrategy`（`App.tsx:668`）同为无引用死代码。

## What Changes

- 新增 kill-switch 运行控制 UI（置于底部交易面板账户摘要条）：从 `GET /health` 读取并展示 `kill_switch`/`live_enabled` 当前状态，切换时调用 `PUT /control` 并以后端返回/重取的状态为准，停机态有明确视觉标识。
- 将 `Reset Funds` 按钮接入 `handleResetPaperAccount`：由 `App` 经 `BottomDock` 下传回调到 `TradingPanel`，点击后重置本地模拟账户余额/持仓/挂单。
- `api.health()` 返回类型扩展为 `{ status; kill_switch; live_enabled }`（后端已返回这些字段，仅补类型）。
- 删除死代码 `handleRunStrategy`（无法低成本接入只读展示型 `StrategyTester`；后端回测链路仍由 Agent 页 `BacktestControls`/QuantLab 经 `api.backtest()` 保留）。
- i18n：补齐 kill-switch 相关中文键（Kill Switch / Trading Halted / Live Enabled 等）。
- 测试：新增/扩展 `TradingPanel` 组件测试（mock `api.health`/`api.control`/`api.journal`）；在 `frontend/tests/e2e/user-journeys.spec.ts` 增加 kill-switch 与 Reset Funds 断言（用例末尾必须复位，避免污染串行用例）。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `trading-ui`: 「交易面板与控制」需求扩展——明确 kill-switch SHALL 有可见 UI 控件、其状态取自 `GET /health`、切换调用 `PUT /control`；并新增「Reset Funds」控制 SHALL 重置本地模拟账户。

## Impact

- **代码**：`frontend/src/App.tsx`（下传 handler、删除死代码）、`frontend/src/components/bottom/BottomDock.tsx`（透传 prop）、`frontend/src/components/bottom/TradingPanel.tsx`（kill-switch + reset 控件）、`frontend/src/api/client.ts`（`health()` 类型）、`frontend/src/lib/i18n.ts`、新增/扩展 `frontend/src/components/bottom/TradingPanel.test.tsx`、`frontend/tests/e2e/user-journeys.spec.ts`。
- **API**：复用 `GET /health`、`PUT /control`，无后端改动。
- **行为**：可一键停机、可重置模拟账户；移除一个无引用函数（无用户可见行为变化）。
- **风险**：中。kill-switch 是全局闸门，立即影响 `POST /order`、`POST /order/confirm`、`/agent/cycle`（后端 `run_control.can_trade()`，`webapi.py:906/919`）；e2e 必须在结束前恢复为未停机，否则污染串行用例。
