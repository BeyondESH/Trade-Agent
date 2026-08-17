## Context

收尾 change。现状：

- 无回放能力；历史深度由 `bitget-connectivity` 的全周期回灌保证，回放可用已存历史。
- `AlertsPanel`/`alertsStore`（localStorage）/`priceMap` 评估链路在；`api/client.ts` 已预留 `/alerts`（列表/创建/删除）但后端未实现。
- 图表 overlay 能力（`AutoLayerController`/`createOverlay`/priceLine）已具备，可用于画警报线。
- 真实下单走 `/order` + `/order/confirm` 两阶段——模拟下单必须与之隔离。
- klinecharts 支持 `applyNewData`（回放裁剪数据）与 `overrideOverlay`（拖动改线）。

## Goals / Non-Goals

**Goals:** 回放引擎 + 回放条；回放纸面下单（隔离真实交易）；警报画线/拖动改阈值；触发 toast + 通知；后端 `/alerts` 持久化 + 前端切源（离线回退）。

**Non-Goals:** 不改真实交易 `/order` 流；回放不接实时（回放期间挂起推送）；不做多用户鉴权（单机自用，`/alerts` 无租户维度）。

## Decisions

### D1. 回放引擎：前端裁剪 + 定时器推进（`lib/replayEngine.ts`）
持有完整历史数组 + `cursor`（当前回放到的 index）。进入回放：`applyNewData(all.slice(0, cursor))`；播放用 `setInterval`（速度档决定间隔），每 tick `cursor++` 并 `updateData/applyMore`；单步=cursor+1。回放模式下 App 忽略 datafeed 的实时 `callback`（用 `replaying` 标志门控）。退出：恢复完整数据 + 重新 `scrollToRealTime` + 解除门控。

### D2. 回放条：`ReplayBar.tsx`，仅回放模式挂载
播放/暂停/单步/速度(1x/3x/10x)/退出 + 当前回放时间戳。进入回放由左侧工具栏或顶栏"回放"按钮触发；选起点用图表点击拾取最近 bar 的 timestamp。

### D3. 纸面账户：`lib/paperAccount.ts`，纯前端
`{positions:[{side,qty,entry}], realized}`；开仓按回放当前价，浮盈=`(cur-entry)*qty*dir`；平仓累加 realized。UI 复用 BrokerPanel 风格但独立组件，明确标注"回放模拟"。绝不调用 `/order`。

### D4. 警报画线：priceLine overlay + 拖动回写
当前品种的启用警报 → 每条画 `priceLine` overlay（组 `alert-lines`），`onDrawEnd/onPressedMove` 拿到新 value → 更新 alertsStore（防抖持久化）。切品种时 `removeOverlay({groupId:'alert-lines'})` 重画。

### D5. 触发提醒：Toast 组件 + Notification
`components/ui/Toast.tsx`（应用内浮层，自动消失）；触发时 push toast + （已授权）`new Notification`。复用 alerts-local 已有通知授权逻辑。

### D6. 后端 `/alerts`：新 `alertstore` + webapi 路由
`alertstore.py`（JSON 落 `data_dir/alerts/alerts.json`，读改写）；`webapi.py` 加 `GET/POST /alerts`、`PUT/DELETE /alerts/{id}`。前端 `alertsStore` 抽象 `AlertsSource`：默认 server，失败 catch → local；结构一致（现有 `Alert` 类型）。

## Risks / Trade-offs

- **回放与实时门控**：必须确保回放期间 datafeed 回调不写图；用单一 `replaying` ref 门控，退出时清干净避免卡在旧数据。
- **拖动改阈值回声**：拖警报线 → 更新 store → 重画线，需防重画打断拖动；用"拖动中不重画、松手才 sync"。
- **纸面 vs 真实混淆**：UI 强标"回放模拟"，纸面账户与 BrokerPanel 真实账户物理分离，杜绝误下真实单。
- **/alerts 无鉴权**：单机自用可接受；若将来多用户需加 owner 维度（超范围）。
- **回放大历史性能**：slice 大数组 + 频繁 applyData 可能卡；按需只维护可视窗口 + 增量 updateData。

## Implementation Notes（落地后补充）

- **回放作用域**：回放仅作用于 **cell 0**（进入时若活动格非 0 会自动激活回 0）。原因：实时挂走 `BitgetDatafeed.suspendUpdates` 门控，而只有 cell 0 注入的是 App 的共享 datafeed；其余格各自持有私有 datafeed，本期不做逐格门控。多格同时回放留作后续扩展。
- **回放数据驱动**：每次 cursor 变化即 `chart.applyNewData(engine.slice())`（整段替换）；500ms/speed 节奏下对千根以内无性能问题。进入回放拉取上限 1000 根（`api.candles` limit=1000）。
- **警报数据源最终形态**：落地为"服务端优先合并读 + 尽力镜像写"（`syncAlertsFromServer` 合并：server 权威、本地孤儿保留；`mirrorAlert*` 写入失败静默回退本地）。与 spec "数据源默认 server"的语义等价：有后端时，静止态列表即服务端数据；离线完全回退本地；结构一致、无缝切换。
- **警报线重画防回声**：`alert-lines` 通过 `subscribeAlerts` 通知链随 store 变化统一重画（removeOverlay by groupId + 重建）；拖动仅在 `onPressedMoveEnd` 松手后回写阈值，拖动过程中不触发重画。
- **exitReplay 自动平仓结算**：退出回放时以最后回放价平掉全部纸面仓位，产出已实现盈亏/笔数/胜率 toast 小结。
- **Windows PowerShell 编码教训**：含 Unicode（· ≥ ≤ ↓）的源文件严禁用 PS `Get-Content/Set-Content` 往返（ANSI 误读导致乱码）；一律使用 .NET UTF-8 API 或 IDE 工具编辑。
