## Context

`alertsStore.ts` 已经具备完整的告警数据层：`Alert` 模型（含 `enabled`/`triggered`）、`evalAlert` 纯判定、localStorage 持久化（`loadAlerts`/`saveAlerts`/`updateAlert`）、变更订阅（`subscribeAlerts`）、后端镜像（`mirrorAlertCreate/Update/Delete`）与 `syncAlertsFromServer`。但**求值环节从未被调用**（`evalAlert` 零调用点），UI 侧 `AlertsPanel` 只有删除，`AlertItem` 缺 `enabled` 字段，仓库内也无 toast 或 `Notification` 使用。

可用实时数据：`useRealSymbols` 通过 `useExchangeSocket("ticker","default",…,{category:"*"})` 订阅全域 ticker，并用 rAF 合并高频帧后产出 `priceMap: Record<instId, number>`（`useRealSymbols.ts:143-149`），App 已在消费 `symbols`/`activeSymbol`。图表价格线通过 `subscribeAlerts` 读取同一条 `alertsStore`，以 `priceLineColor` 区分"启用=黄色警报线 / 停用=灰色参考线"。

约束：后端 `/alerts` 与镜像已就绪，不改后端；不新增 WS 通道；不改图表画线语义；浏览器通知申请必须发生在用户手势内。

## Goals / Non-Goals

**Goals:**
- 对 `enabled && !triggered` 的告警，用最新价持续判定，命中即标记 `triggered`。
- 触发态本地持久化 + 经 `mirrorAlertUpdate` 同步后端，跨设备一致。
- 触发即弹应用内 toast；用户显式授权后额外发浏览器通知。
- `AlertsPanel` 提供启停开关、重置、触发态高亮；`AlertItem` 透传 `enabled`/`triggerTime`。
- 求值/重置可单测；补 e2e 触发→重置旅程。

**Non-Goals:**
- 不新增后端端点、不做服务端求值、不新增 WS 通道。
- 不为每条告警单独高频轮询 REST。
- 不改变图表价格线渲染语义与 `alertsStore` 既有持久化结构。
- 不实现 `frequency: 'Every Time'` 的自动重新武装（见 Open Questions）。
- 不做多语言；不改 `alerts-backend` 规格。

## Decisions

**决策 1：数据源 = WS 实时价为主 + 低频 REST 兜底，而非逐告警轮询**

求值触发源以 `useRealSymbols().priceMap` 为准（WS 全域 ticker 已 rAF 合并），仅当某告警的 `symbol` 不在 `priceMap`（WS 断流/该品种无推送）时，才以低频（建议 15–30s）`api.tickers()` 刷新兜底。

- 理由：复用既有单一共享 socket，延迟低、零新增订阅；逐告警轮询会产生 N 倍请求且延迟高于推送。规格原文"轮询判定"据此细化为"实时推送优先、轮询兜底"。
- 备选：统一 N 秒轮询 `api.tickers`——实现简单但与 WS 重复、延迟更高，作为兜底而非主路径。

**决策 2：纯函数求值 + App 层 effect 落库**

在 `alertsStore.ts` 新增纯函数 `evaluateAlerts(alerts, priceMap): Array<{ id; triggerTime }>`（内部复用 `evalAlert`，短路 disabled/triggered/非有限价），App 用 effect 监听 `priceMap` 调用它；对每个命中项执行 `updateAlert(id,{triggered:true,triggerTime})` 并 `mirrorAlertUpdate(id,{triggered:true,triggerTime})`。

- 理由：与现有 `subscribeAlerts` 单向数据流一致，逻辑可脱离 React 单测；避免在 store 内耦合 React。
- 备选：在 `useRealSymbols` 内直接触发——会污染行情 hook 职责，弃用。

**决策 3：一次性触发语义 + 显式重置**

沿用 `evalAlert` 已有的 `triggered` 短路：命中一次后不再判定，直至用户重置。`AlertItem.frequency` 仅展示，不驱动自动重触发。

- 理由：与 `alerts-local` 规格"可重置重新启用"一致；避免同一价位反复轰炸通知。
- 备选：`Every Time` 自动重新武装——需要边界/去抖设计，列为后续项。

**决策 4：通知授权仅在用户手势内申请**

新增持久化开关（如 `localStorage["raibro.alerts.notify"]`）。`Notification.requestPermission()` 只在用户点击 AlertsPanel 通知开关时调用，绝不在挂载时调用；判定前 `typeof window !== "undefined" && "Notification" in window`。

- 触发时始终弹应用内 toast；仅当开关开启且 `Notification.permission === "granted"` 时额外 `new Notification(...)`。
- 理由：浏览器要求用户手势，且自动弹权限可能被浏览器永久拒绝，严重影响体验。备选：创建告警时自动申请——弃用。

**决策 5：轻量自研 toast，不引第三方依赖**

新增 `ToastHost` + `useToasts`（模块级订阅或 Context），自动消隐、按 id 去重、`role="status"` / `aria-live="polite"`，由 App 顶层挂载。

- 理由：需求仅为"触发提醒"，引入 sonner/react-toastify 等新增依赖收益低；本项目已有自研 store 模式可复用。

**决策 6：类型与映射补全**

`AlertItem` 增加 `enabled: boolean`（`triggerTime` 已存在）；`App.tsx` 的 `alertToItem` 映射 `enabled` 与 `triggerTime`；`AlertsPanel` 新增 `onToggleAlert(id, enabled)`、`onResetAlert(id)`、`onToggleNotifications()` 回调，由 `RightDock` 透传。

- 启停：`updateAlert(id,{enabled:next})` + `mirrorAlertUpdate`；重置：`updateAlert(id,{triggered:false,triggerTime:undefined})` + `mirrorAlertUpdate`。

**决策 7：触发时间格式**

`Alert.triggerTime` 存 ISO 字符串（与 `createdAt` 数值字段并存），UI 用既有 `formatRelativeTime` 展示；`AlertItem.triggerTime` 复用可选 string。

## Risks / Trade-offs

- [高频 `priceMap` 触发 effect 反复执行] → 纯函数短路 disabled/triggered 且仅在命中时落库；WS 侧已 rAF 合并，写放大受控。
- [React StrictMode 开发期双重效应导致重复 toast] → 按告警 id 在同一批次去重，并按 id 记录已通知集合。
- [用户拒绝通知权限] → 开关状态仍保存，仅降级为 toast，不重复打扰。
- [`priceMap` 按 instId 收敛（期货优先）与 `alert.symbol` 不一致] → 两者均为纯 instId/ticker，键一致；缺失时走轮询兜底。
- [兜底轮询与 WS 并用造成重复] → 仅在符号不在 `priceMap` 时启用兜底；命中去重依赖 `triggered` 短路。
- [localStorage 不可用] → store 既有 try/catch 兜底，toast 不受影响。

## Migration Plan

无数据迁移。历史告警 `enabled` 默认 true（`createAlert`/`asAlert` 均如此），首次接入求值后按当前价判定即可。回滚：本变更为增量接入，撤销代码即可；持久化的 `triggered` 标记无害（不影响图表与 CRUD）。

## Open Questions

- `frequency: 'Every Time'` 是否需要"触发后可再次武装"（含冷却/去抖）？本变更先按一次性 + 手动重置。
- 浏览器通知授权入口是否还需在 `DesktopTitleBar` 通知铃处再提供一个？
- 兜底轮询周期与触发条件：是否仅在 WS 未连接时启用（而非符号缺失）？
