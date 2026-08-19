# Design: Chart Context Menu Price Lines

## Context

当前图表栈为 `App.tsx → NativeChart → KLineChartProView → vendored KLineChartPro → klinecharts core v9.8.10`。探索阶段的源码级验证确认：

- klinecharts 核心**没有内置右键菜单 API**，需要 DOM 层自建菜单浮层；核心提供 `chart.convertFromPixel(coords, { paneId, absolute: true })` 可将容器内坐标换算为 `{ value }` 价格（源码中 `absolute` 会减去 pane bounding.top），`chart.createOverlay({ name: "priceLine", points: [{ value }] })` 可绘制带价格标签的水平线，overlay 默认可拖动并支持 `onClick` / `onPressedMoveEnd` 等事件回调。
- `alertsStore.ts` 已有完整 CRUD + localStorage + 后端镜像 + `subscribeAlerts` 通知；`transform.ts: priceLineToOverlay` 与 `chartController.ts: AutoLayerController` 已存在但只被测试引用。
- `alerts-local` spec 已规定警报线画图与拖动调阈值，但代码未实现；当前没有任何代码消费 `evalAlert`/`subscribeAlerts` 去画线或触发。
- App 持有 `isAlertOpen` 状态与 `CreateAlertModal`，但 `CreateAlertModal` 的初始价格只来自 `symbol.price`，无法预填右键价格。

## Goals / Non-Goals

**Goals:**
- 蜡烛主图右键菜单：按光标处价格提供「添加价格线」「设置价格警报」。
- 统一价格线实体：参考线与警报线共用 `Alert` 模型，颜色区分语义。
- 左键点线打开设置弹窗：改价、改色、改类型、改条件、删除。
- 拖动改阈值并持久化；按品种重绘与过滤。
- 全部使用现有依赖（klinecharts、alertsStore），不引入新库。

**Non-Goals:**
- 不做右键菜单的更多项（如清空所有线、坐标轴比例切换等），留给后续迭代。
- 不做警报的实时触发评估循环（`evalAlert` 接线）——本变更只负责「线」的创建/展示/编辑/持久化，触发提醒属于既有 `alerts-local` 的另一部分，若已存在评估入口则保持原样。
- 不改 klinecharts-pro vendor 源码。

## Decisions

### D1: 菜单/弹窗浮层放 NativeChart 层，事件回调上抛给 App

`NativeChart` 内部持有 chart（通过 `KLineChartProView` 的 `getChart()`），右键菜单与设置弹窗都在该层渲染（绝对定位浮层），通过新 props 与 App 通信：

```
NativeChart 新增 props:
  onCreateAlertAt(price: number)  → App 打开预填价格的 CreateAlertModal
  onLineChanged()                 → 通知 App 刷新 alerts 列表（可选）
```

**理由**：符合 NativeChart「声明式封装」的既有风格；Chart 实例、坐标换算、overlay 生命周期都在该层内聚，App 无需持有 chart ref。**备选方案**：全部上提到 App 持 ref——多一层桥接，且会把 canvas 交互细节泄漏给 App，放弃。

### D2: 右键捕获与价格换算

在 `KLineChartProView` 的容器 div 上监听 `contextmenu`（React `onContextMenu`），过滤条件：
- `event.target` 为 canvas 元素（排除 pro 工具栏/周期条等 DOM 组件）；
- 换算后价格落在蜡烛主图 pane 范围内（用 `chart.getDom("candle_pane", "main")` 的 `getBoundingClientRect()` 做 hit-test；只对 `candle_pane` 开放，副图 Y 轴是量非价）。

换算：`chart.convertFromPixel([{ x: e.clientX - rect.left, y: e.clientY - rect.top }], { paneId: "candle_pane", absolute: true })` → `point.value`。

菜单浮层：受控组件，`{ x, y, price }` 状态，定位在光标处，点击外部/Escape 关闭，`preventDefault()` 屏蔽浏览器原生菜单。

### D3: 统一实体模型 = Alert，enabled 区分参考线/警报线

```
Alert {
  id, symbol, condition: "above"|"below", threshold: number,
  enabled: boolean,   // false = 纯参考线（只画不触发），true = 警报线
  triggered, createdAt
}
```

- 颜色派生函数 `priceLineColor(alert, theme)`：`enabled ? "#ff9800" : theme==="dark" ? "#787b86" : "#5d606b"`。
- 「添加价格线」→ 创建 `enabled:false` 参考线；「设置价格警报」→ 走 `CreateAlertModal`，提交后 `enabled:true`。
- 复用 `priceLineToOverlay`（补充 `extendData` 存 `alertId` 用于 overlay→实体关联）。

**理由**：用户明确「警报线也是价格线，仅颜色区分」；避免两套数据模型。`alerts-local` 的拖动调阈值自然覆盖参考线与警报线。**备选**：价格线独立于 Alert——被用户否掉。

### D4: overlay ↔ Alert 双向同步

`alertsStore` 是唯一事实来源；overlay 是瞬态投影：

- 时机：`subscribeAlerts` 回调、symbol 变化、chart ready、首次挂载。
- 重绘逻辑：`removeAllPriceLines()` 清除本图所有 `priceLine` overlay → 从 store 取当前 symbol 的 alerts（含 `enabled:false`）逐一 `createOverlay`。
- overlay 创建时挂事件：
  - `onClick` → 打开 `PriceLineSettingsModal`（带 alertId）；
  - `onPressedMoveEnd` → `mirrorAlertUpdate(alertId, { threshold: 新价格 })` + 更新本地 store + 重绘该线颜色/价格。
- overlay 通过 `extendData.alertId` 与 Alert 关联；`AutoLayerController` 负责记录 overlay id 以支持删除（`removeOverlay({ id })`）。

### D5: 价格线设置弹窗

左键点击线 → 弹 `PriceLineSettingsModal`（复用现有 Modal 视觉样式，dark/light 主题）。字段：
- 价格（数字输入，`threshold`）
- 颜色（预设色板：黄 `#ff9800`、灰 `#787b86`/`#5d606b` + 若干自定义色）
- 类型（参考线/警报线 → `enabled`）
- 条件（高于/低于 → `condition`，仅警报线显示）
- 删除（`removeAlert` + `mirrorAlertDelete` + 移除 overlay）

保存动作统一走 `saveAlerts`/`mirrorAlertUpdate`，随后 `subscribeAlerts` 触发重绘。

### D6: CreateAlertModal 预填价格

`App.tsx` 增加 `alertPrefillPrice` 状态（或 `alertPrefill` 对象），`onCreateAlertAt(price)` 设置后打开 Modal；`CreateAlertModal` 增加可选 `initialPrice` prop，默认回退到 `symbol.price`。不改变 Modal 现有创建逻辑。

## Risks / Trade-offs

- **右键命中范围**：pro 的 DOM 组件可能拦截右键 → 用「target 为 canvas」过滤，并在设置弹窗/菜单关闭时恢复 `preventDefault`；仍有未知边界由 NativeChart 层统一 `contextmenu` 兜底。→ 测试覆盖右键发生在周期条/工具栏时不弹菜单。
- **StrictMode 双挂载**：`KLineChartProView` 已有挂载复用保护；overlay 重绘的 `subscribeAlerts` 订阅需在 effect cleanup 中退订，避免重复画线/泄漏。→ 用测试断言重复挂载只存在一条线。
- **拖动与左键点击冲突**：klinecharts overlay 的 `onClick` 与拖动天然并存（按住移动是拖，点击是触发）；`onPressedMoveEnd` 可能在无位移时也触发 → 记录拖动位移阈值，位移过小视为点击而非拖动。
- **价格换算精度**：`convertFromPixel` 依赖 pane bounding 与当前可见范围；若图表未就绪（`chart === null`）时右键 → 直接不弹菜单。→ 菜单仅在 chart ready 后启用。
- **旧数据兼容**：既有 `enabled:true` 的 Alert 无 `extendData.alertId` 等字段 → 以 `threshold` 重建 overlay 并回填关联，不迁移存储结构。

## Migration Plan

1. 纯前端变更，无后端/数据迁移；`Alert` 结构不新增必填字段，向后兼容。
2. 部署顺序：先落地 store 辅助函数与颜色派生（纯函数，含测试）→ overlay 同步层 → 右键菜单 → 设置弹窗 → Modal 预填。
3. 回滚：移除 NativeChart 上的菜单/弹窗层与相关 props 即可，不影响既有警报 CRUD。

## Open Questions

- 设置弹窗中自定义颜色是否持久化到 `Alert`（新增 `color?: string` 字段）？——默认：持久化，颜色派生函数优先用 `alert.color`，缺省时按 D3 规则。可在实现时确认。
- 是否需要在右键菜单同步提供「清除当前品种所有价格线」？——默认不加，删除走设置弹窗。
