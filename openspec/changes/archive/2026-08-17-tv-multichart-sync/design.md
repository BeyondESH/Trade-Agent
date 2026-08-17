## Context

档位 3 全同步 + 活动图。现状：

- `ChartGrid.tsx` 写死 cell 0 为受控主图（接 `ref`/`onReady`/受控 symbol&period），其余格 `ChartCell` 只拿初始值、各自独立 datafeed。
- `ChartCell.tsx:34` 硬编码 `theme="dark"`；App 的 `setTheme` 只作用于 cell 0（通过 `chartRef.current?.setTheme`）。
- `App.tsx` 顶栏操作直接打到 `chartRef`（cell 0）。
- 绘图：`AutoLayerController` + `drawingPersistence`（localStorage，按 seriesKey）已存在；`transform.ts` 已有 time↔index 能力。
- `handleSaveTemplate` 目前发送 `indicators:[], drawings:[]` 是桩；`/chart-config` PUT/GET 后端已实现。
- klinecharts 每个 Chart 实例独立，overlay/crosshair 不共享——同步必须靠外部总线。

## Goals / Non-Goals

**Goals:** 活动图路由；ChartSyncBus 五类同步（独立开关，防回声）；绘图按数据坐标跨周期镜像（仅同 symbol）；每格主题跟随；布局+每格状态持久化。

**Non-Goals:** 不做回放/警报（下个 change）；不改 `/chart-config` 契约（仅扩展 state 结构）；不引入状态管理库（用 App state + 轻量总线）。

## Decisions

### D1. 活动图：App 持有 `activeCell` index，ChartGrid 上抛点击
每格容器 `onMouseDown` 上抛 `onActivate(i)`；活动格加高亮边框 class。App 的所有顶栏 handler（symbol/period/type/indicator）改为作用于 `chartHandles[activeCell]`，而非单一 `chartRef`。因此 `ChartGrid` 需要为每格暴露 handle（`ref` 数组），不再只 cell 0。

### D2. ChartSyncBus：轻量事件总线（`lib/chartSyncBus.ts`）
`type SyncEvent = {kind:'symbol'|'period'|'crosshair'|'range'|'draw', payload, origin:number, syncOrigin?:boolean}`。每个 cell 注册 `{index, chart, getSeries}`；发出者带 `origin`；接收者跳过 `origin===self` 与 `syncOrigin` 标记。开关是 `Record<kind,boolean>`（App state，默认全开）。crosshair/range 用 rAF 合并节流。

### D3. 绘图同步：按数据坐标，仅同 symbol
监听每格 overlay 的 create/modify/remove（复用 bitget-connectivity 里已注入的 `onSelected/onRemoved` 钩子，扩展 onDrawEnd/onModify）；广播 `{overlayType, points:[{timestamp,value}], styleRef, opId}`。接收方按目标格时间轴 `convertToPixel/convert` 重投影后 `createOverlay/override/removeOverlay`；镜像 overlay 打 `syncOrigin` 防回声。跨 symbol 直接丢弃事件。用 `opId` 关联多格同一逻辑绘图，实现修改/删除同步。

### D4. 每格主题：ChartCell 接收 `theme` prop
移除 `ChartCell.tsx` 硬编码 `theme="dark"`，由 ChartGrid 透传 App 主题；主题变化时对所有 handle 调 `setTheme`。

### D5. 持久化：扩展 ChartConfig.state 结构
`state = { layoutCount, activeCell, syncFlags, cells:[{category,symbol,timeframe,indicators,drawings:[{type,points:[{timestamp,value}],styles,opId}]}] }`。保存时遍历每格收集；恢复时按格重建。series key 统一 `category:instId`。沿用 `/chart-config` PUT/GET，不改后端签名（state 是自由 dict）。

## Risks / Trade-offs

- **重写 ChartGrid 影响面大**：现有 `App.tsx` 大量依赖单 `chartRef`；改为 handle 数组需仔细迁移 onReady/legend/axis controls/context menu（这些当前也只绑 cell 0）。分步：先活动格 + 多 handle，再逐类接同步，最后持久化。
- **绘图重投影精度**：不同周期下同一 timestamp 未必有 bar，需最近 bar 对齐；klinecharts overlay 以 dataIndex 定位，重投影要先 timestamp→最近 index。
- **同步风暴/性能**：crosshair/range 高频，必须 rAF 合并 + origin 去重；绘图 modify 拖动时去抖。
- **回声循环**：`syncOrigin` 标记 + `origin` 双重防护；镜像创建走 controller 时要跳过重新广播。
- **旧持久化数据失配**：旧 `instId` key 与新 `category:instId` 不兼容，接受一次性丢失（首次保存即写新格式）。

## Implementation Notes（落地后补充）

- **十字线定位无公共 API**：klinecharts v9.8 没有 `setCrosshair`（仅内部 `TooltipStore.setCrosshair`）。跨格十字线同步改为**合成 mousemove**：`convertToPixel({timestamp})` 反推像素坐标后在目标格主面板 DOM 上派发 `MouseEvent('mousemove')`，由 klinecharts 自身的指针管线落位。`chartSyncActions.applyRemoteCrosshair` 实现，配合 suppress 守卫避免回声。
- **无 overlay 枚举 API**：v9.8 无 `getOverlayList`。绘图追踪沿用既有注入式方案（`cellChartSetup` 包装 `createOverlay`，记录 id 并在 `onDrawEnd/onPressedMoving/onRemoved` 钩子发事件）。
- **DomPosition 枚举坑**：klinecharts 的 CJS/UMD 入口在 vitest 下运行时枚举值为 undefined，凡代码中需要 DomPosition 值处一律用字符串字面量 + type-only 导入（见 `chartSyncActions.ts` 头部注释）。
- **回声防护三重**：① 总线永不回发 origin 自身；② 接收方应用远端事件时包裹 `guarded(suppress)`，其间本地事件（crosshair/visibleRange/overlay 删除）不再外发；③ symbol/period 接收有等值去重守卫，阻断 handle 回调可能引发的镜像乒乓。
- **指标恢复为"缺啥补啥"**：`getIndicatorByPaneId()` 可枚举指标名；恢复时只补目标格缺失的指标。已删除的默认指标（如 MA）会被默认初始化补回，属已知限制。
- **布局恢复时序**：chart-config 异步读取完成后，对已挂载 cell 通过 `commitCellSymbol/commitCellPeriod` 命令式应用（pro 实例仅在构造时读取初始 symbol/period）。
