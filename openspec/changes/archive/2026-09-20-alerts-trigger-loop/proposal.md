## Why

价格提醒当前是"断头"的：`frontend/src/lib/alertsStore.ts:90` 已实现 `evalAlert(alert, price)`，但全仓库零调用点（grep 验证），既无轮询也无 WS 驱动的求值，`AlertItem.triggered` 在 `App.tsx:943` 与 `CreateAlertModal.tsx:40` 永远被写成 `false`，`AlertsPanel.tsx` 只支持删除——用户创建的提醒永远不会触发、无法启停、无法重置，`openspec/specs/alerts-local/spec.md` 中"价格触发"需求形同虚设。

## What Changes

- **接通触发求值**：在实时行情（`useRealSymbols` 的 `priceMap` / WS ticker 推送）与低频轮询兜底之上运行 `evalAlert`，对每条 `enabled && !triggered` 的提醒判定，命中后标记 `triggered=true` 并在本地持久化。
- **镜像后端**：触发状态通过现有 `mirrorAlertUpdate(id, { triggered: true })`（`api.updateAlert` → `PUT /alerts/{id}`）同步到后端，保持跨设备一致；后端镜像与 `/alerts` 端点已存在（`alerts-backend`），无需改后端。
- **应用内 toast**：新增轻量 toast（无第三方依赖），触发时弹出应用内提醒，自动消隐，`role="status"` / `aria-live="polite"` 可访问。
- **可选浏览器通知**：用户显式开启时才调用 `Notification.requestPermission()`（绝不在加载时自动弹权限），授权后触发时发送浏览器通知；未授权/不支持时仅保留 toast。
- **启用/停用开关**：`AlertsPanel` 每条提醒提供 enable/disable 开关，停用后不参与判定（图表线同步降级为参考线语义，由现有 `priceLineColor` 处理）。
- **重置**：已触发提醒提供"重置"操作，恢复 `triggered=false` 并重新参与判定。
- **触发态 UI**：`AlertsPanel` 对 `triggered` 提醒高亮（含 `triggerTime`）。
- **类型补全**：`AlertItem`（`frontend/src/types/trading.ts:201`）补 `enabled` 字段，`App.tsx` 的 `alertToItem` 透传 `enabled`/`triggerTime`。
- **测试**：求值/重置纯函数单测，AlertsPanel 开关与重置交互单测，`frontend/tests/e2e/user-journeys.spec.ts` 风格补充触发→重置 e2e。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `alerts-local`: "价格触发"需求细化求值数据源（实时推送优先、轮询兜底）、触发态本地+后端双写持久化、浏览器通知的显式授权时机，并新增"启停与重置"与"触发态展示"的规格化行为。

## Impact

- **代码**：
  - `frontend/src/lib/alertsStore.ts`（求值纯函数 / 重置 helper）
  - `frontend/src/hooks/useRealSymbols.ts`（暴露 `priceMap` 已有，不改）
  - `frontend/src/App.tsx`（求值 effect、toast 宿主、告警状态映射与回调）
  - `frontend/src/components/sidebar/AlertsPanel.tsx`（开关 / 重置 / 高亮）
  - `frontend/src/components/sidebar/RightDock.tsx`（透传新回调）
  - `frontend/src/types/trading.ts`（`AlertItem.enabled`）
  - 新增 toast 组件/hook（`frontend/src/components/…` 或 `frontend/src/lib/…`）
- **API**：无新增。复用 `GET /alerts`、`POST /alerts`、`PUT /alerts/{id}`、`DELETE /alerts/{id}`；后端不改。
- **行为**：提醒可被实时价格触发并高亮，用户可启停与重置；未授权浏览器通知时降级为应用内 toast。
- **风险**：低—中。主要风险为高频行情下的重复触发/性能，通过"已触发短路 + rAF/低频节流"控制；通知权限仅在用户操作时申请，避免打扰。
