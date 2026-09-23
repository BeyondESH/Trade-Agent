## 1. 数据层：求值、启停与重置

- [x] 1.1 在 `frontend/src/lib/alertsStore.ts` 新增纯函数 `evaluateAlerts(alerts, priceMap)`：遍历告警，复用 `evalAlert` 判定，短路 `enabled=false`/`triggered=true`/非有限价，返回命中项（含 `id` 与 `triggerTime`）
- [x] 1.2 新增 `resetAlert(id)`（`triggered=false`、清除 `triggerTime`，持久化并通知订阅者）与 `setAlertEnabled(id, enabled)` helper
- [x] 1.3 在 `frontend/src/types/trading.ts` 的 `AlertItem` 增加 `enabled: boolean`；`App.tsx` 的 `alertToItem` 透传 `enabled` 与 `triggerTime`

## 2. 触发运行时（通知 / toast / effect）

- [x] 2.1 新增轻量 toast 机制（`ToastHost` + `useToasts`）：自动消隐、按 id 去重、`role="status"`/`aria-live="polite"`
- [x] 2.2 新增通知模块：`requestNotifyPermission()` 仅在用户手势内调用 `Notification.requestPermission()`；`notifyAlert()` 仅当用户开关开启且权限为 `granted` 时 `new Notification(...)`；localStorage 持久化开关；`Notification` 缺失时安全降级
- [x] 2.3 `App.tsx` 顶层挂载 `ToastHost`
- [x] 2.4 `App.tsx` 新增 effect 监听 `useRealSymbols().priceMap`，调用 `evaluateAlerts`；对命中项执行 `updateAlert(id, { triggered: true, triggerTime })` + `mirrorAlertUpdate`，并弹出 toast／发送浏览器通知（按 id 去重，兼容 StrictMode 双调用）
- [x] 2.5 对未被实时行情覆盖的告警符号，增加低频 `api.tickers()` 轮询兜底（建议 15–30s，或仅在 WS 不可用时启用）
- [x] 2.6 `App.tsx` 接线 `onToggleAlert` / `onResetAlert` / `onToggleNotifications`（启停与重置均本地持久化 + `mirrorAlertUpdate`）

## 3. 提醒面板与停靠栏 UI

- [x] 3.1 `frontend/src/components/sidebar/AlertsPanel.tsx` 每条告警增加启用/停用开关（`data-testid` 约定）
- [x] 3.2 `AlertsPanel` 增加"重置"操作（仅 `triggered=true` 时可见）与触发态高亮样式
- [x] 3.3 `AlertsPanel` 展示触发时间（复用 `formatRelativeTime`）并新增浏览器通知授权开关
- [x] 3.4 `frontend/src/components/sidebar/RightDock.tsx` 透传 `onToggleAlert`/`onResetAlert`/`onToggleNotifications` 新 props

## 4. 测试

- [x] 4.1 `frontend/src/lib/alertsStore.test.ts` 新增 `evaluateAlerts` 用例：above/below 命中、disabled/triggered 短路、非有限价不触发
- [x] 4.2 新增 `resetAlert`/`setAlertEnabled` 用例：持久化、订阅通知、镜像调用
- [x] 4.3 通知模块单测：未授权/不支持时降级为 toast、加载时不调用 `requestPermission`、授权后发送通知
- [x] 4.4 toast 单测：按 id 去重、自动消隐
- [x] 4.5 `AlertsPanel` 交互单测：启停切换、重置、触发态高亮与触发时间
- [x] 4.6 `frontend/tests/e2e/user-journeys.spec.ts` 风格补充"创建 → 触发 → 高亮 → 重置"e2e（触发价可注入/mock）

## 5. 验证

- [x] 5.1 运行 `cd frontend && npm run test` 全部通过
- [x] 5.2 运行 `cd frontend && npm run typecheck` 通过
- [x] 5.3 运行 `cd frontend && npm run test:e2e`（告警旅程）通过
