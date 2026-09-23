## 1. API 与类型

- [x] 1.1 扩展 `frontend/src/api/client.ts` 的 `health()` 返回类型为 `{ status: string; kill_switch: boolean; live_enabled: boolean }`
- [x] 1.2 核对 `api.control()` 签名满足 `kill_switch` 开关调用（`PUT /control`），如无改动则确认

## 2. Kill-switch UI

- [x] 2.1 在 `TradingPanel.tsx` 账户摘要条新增 kill-switch 控件（开关/按钮 + 状态标识）
- [x] 2.2 进入面板时拉取 `GET /health` 初始化 `kill_switch`/`live_enabled` 状态
- [x] 2.3 切换时调用 `api.control({ kill_switch })` 并以返回/重取状态更新控件
- [x] 2.4 停机态显示明确视觉标识（红色 halt 文案/图标）
- [x] 2.5 `live_enabled` 只读展示，不提供实盘开启入口

## 3. Reset Funds 接线

- [x] 3.1 `App.tsx` 将 `handleResetPaperAccount` 经 `BottomDock` 下传至 `TradingPanel`（新增 `onResetAccount` prop）
- [x] 3.2 `TradingPanel` 新增 Reset Funds 按钮，使用既有 i18n 键并调用 `onResetAccount`
- [x] 3.3 `BottomDock.tsx` 透传 `onResetAccount` prop

## 4. 死代码清理

- [x] 4.1 删除 `App.tsx` 中无引用的 `handleRunStrategy`
- [x] 4.2 确认 Agent 页 `BacktestControls`/QuantLab 仍保留 `POST /backtest` + `GET /jobs/{id}` 链路（`bottom-dock` 回测面板需求）

## 5. i18n

- [x] 5.1 在 `frontend/src/lib/i18n.ts` 的 `zh` 中补齐 kill-switch 相关中文键（Kill Switch / Trading Halted / Live Enabled 等）

## 6. 单元测试

- [x] 6.1 新增/扩展 `frontend/src/components/bottom/TradingPanel.test.tsx`（`// @vitest-environment jsdom`，`vi.mock` `../../api/client`）
- [x] 6.2 用例：`health.kill_switch = true` 时显示停机态
- [x] 6.3 用例：点击 kill-switch 调用 `api.control({ kill_switch: true })`
- [x] 6.4 用例：点击 Reset Funds 触发 `onResetAccount`
- [x] 6.5 回归：positions/orders/history 分支仍正常

## 7. E2E

- [x] 7.1 在 `frontend/tests/e2e/user-journeys.spec.ts` 新增 kill-switch 用例（打开 → 停机 → 恢复，末尾**必须复位**）
- [x] 7.2 新增 Reset Funds 用例：点击后模拟账户余额回到初始值

## 8. 验证

- [x] 8.1 `cd frontend && npm run test` 全部通过
- [x] 8.2 `cd frontend && npm run typecheck` 通过
- [x] 8.3 `cd frontend && npm run test:e2e` 通过（含新增用例；注意串行复位 kill-switch）
