## Why

TradingView 1:1 重建的第四个（收尾）change：补齐两个标志性交互——**回放模式（含模拟下单）**与**警报画线/触发/后端持久化**。这是很多用户判断"像不像 TradingView"的第一测试动作，也是探索阶段拍板要做到的深度。

现状缺口：

1. **回放完全缺失**：无 bar-replay 引擎、无回放条 UI、无回放中模拟下单能力。
2. **警报未画线、触发无提醒**：`AlertsPanel` + `alertsStore` + priceMap 评估链路在，但图上不画警报水平线、触发时无 toast/声音；且数据仅存 localStorage，无跨设备。

后端 `/alerts` 接口形状已在 `api/client.ts` 预留（列表/创建/删除），但后端未实现。本 change 落地后端持久化并前端切换数据源。

## What Changes

- **回放引擎**：选择回放起点 bar → 逐 bar 播放（可暂停/单步前进/调速）；回放时图表只展示到"当前回放时刻"的数据，实时推送在回放期间挂起。
- **回放条 UI**：进入回放模式后于图表底部/顶部显示控制条（播放/暂停/单步/速度/退出、当前回放时间）。
- **回放中模拟下单**：回放时钟驱动的纸面持仓——按回放当前价开/平多空，实时计算浮盈、已实现盈亏，回放结束或退出时给出小结。与真实 `/order` 隔离（纯前端纸面账户）。
- **警报图上画线**：每条启用的警报在图表对应价位画一条水平警报线（可从线上拖动改阈值），跟随品种切换显隐。
- **警报触发提醒**：满足条件时除标记"已触发"外，SHALL 弹出应用内 toast，并在已授权时发浏览器通知（复用 alerts-local 已有通知能力）。
- **警报后端持久化 + 跨设备**：实现后端 `/alerts`（列表/创建/更新/删除，落库），前端数据源从 localStorage 切换到服务端，结构与本地版一致（无缝切换，离线回退本地）。

## Capabilities

### New Capabilities
- `chart-replay`: bar 回放引擎与回放条（起点选择、播放/暂停/单步/调速、数据裁剪到回放时刻）。
- `replay-paper-trading`: 回放时钟驱动的模拟下单（纸面持仓、浮盈/已实现盈亏、小结）。
- `alerts-backend`: 后端 `/alerts` 持久化（列表/创建/更新/删除）与跨设备同步。

### Modified Capabilities
- `alerts-local`: 警报在图表画水平线并可拖动改阈值；触发时弹 toast/通知；数据源默认切换到后端 `/alerts`，离线回退本地。

## Impact

- **前端**：新增 `lib/replayEngine.ts`、`components/chart/ReplayBar.tsx`、`lib/paperAccount.ts`、`components/chart/AlertLines.tsx`、`components/ui/Toast.tsx`；改 `App.tsx`（回放模式状态、进入/退出、暂停实时）、`components/panels/AlertsPanel.tsx`（画线/拖动/toast、数据源切换）、`lib/alertsStore.ts`（服务端/本地双源）、`api/client.ts`（`/alerts` 落实调用）。
- **后端**：`webapi.py` 实现 `/alerts` GET/POST/PUT/DELETE，新增 `alertstore`（JSON/parquet 落 `data_dir`）；沿用现有存储风格，不破坏其他端点。
- **数据源**：回放使用已回灌的历史 K 线（`bitget-connectivity` 保证深度）；模拟下单不触达真实 `/order`。
- **非破坏性**：真实交易 `/order` 两阶段流不变；警报后端为新增端点，前端离线回退保证不依赖后端可用性。
