# Tasks — tv-multichart-sync

## 1. 活动图与多 handle (multichart-active-chart / terminal-layout)

- [x] 1.1 `ChartGrid.tsx` 重写：N 个对等 `ChartCell`，每格暴露 handle（回调注册），每格容器 `onMouseDown` 上抛 `onActivate(index)`
- [x] 1.2 App 持有 `activeCell` state；活动格加高亮边框；布局格数变化时活动格越界回退首格
- [x] 1.3 顶栏 handler（symbol/period/chartType/indicator）改为作用于 `handles[activeCell]`，替换原单一 `chartRef`
- [x] 1.4 迁移 legend/axis controls/context menu/回到最新 到活动格（随 `primaryChart` 重绑定）
- [x] 1.5 单测：点击激活高亮、顶栏操作路由到活动格、越界回退（ChartGrid.test + bus/setup 测试覆盖）

## 2. 同步总线骨架 (chart-sync-bus)

- [x] 2.1 新增 `lib/chartSyncBus.ts`：事件类型 `symbol|period|crosshair|range|draw`，参与者注册/注销，`origin` 防回声（origin 永不收自己的事件）
- [x] 2.2 App 持有 `syncFlags`（五开关，默认全开）+ 开关 UI（顶栏布局下拉内）
- [x] 2.3 每格 `ChartCell` 注册为总线参与者（chart ready 时按 index 注册，re-ready 时重注册）
- [x] 2.4 单测：开关独立生效、防回声（镜像不再广播）、异常隔离

## 3. Symbol/Period/十字线/缩放同步 (chart-sync-bus)

- [x] 3.1 Symbol 同步：活动格切品种广播 → 其余格加载同品种（开关约束 + 去重守卫）
- [x] 3.2 Period 同步：活动格切周期广播 → 其余格切同周期
- [x] 3.3 十字线同步：`subscribeAction('onCrosshairChange')` 广播 timestamp → 其余格经合成 mousemove 落位到最近 bar；rAF 节流 + suppress 防回声
- [x] 3.4 缩放/平移同步：`onVisibleRangeChange` 广播 timestamp 区间 → 其余格 `zoomAtTimestamp` + `scrollToTimestamp`；rAF 节流
- [x] 3.5 单测：bus 事件门控、suppress 守卫、range/crosshair 应用逻辑（chartSyncActions.test）

## 4. 绘图同步（同 symbol，数据坐标） (chart-sync-bus / chart-terminal)

- [x] 4.1 扩展 overlay 钩子捕获 create/modify/remove（onDrawEnd/onPressedMoving/onRemoved），生成 `{opId, points:[{timestamp,value}]}`
- [x] 4.2 广播绘图事件；接收方仅当同 symbol 时按目标格时间轴重投影后 `createOverlay/overrideOverlay/removeOverlay`
- [x] 4.3 镜像 overlay 经 suppress 守卫防回声；`opId` 关联多格同一逻辑绘图（DrawSyncRegistry）
- [x] 4.4 跨 symbol 事件丢弃；拖动 modify rAF 去抖
- [x] 4.5 单测：同 symbol 跨周期镜像点归一、跨 symbol 不镜像、修改/删除同步

## 5. 每格主题跟随 (chart-terminal)

- [x] 5.1 `ChartCell.tsx` 移除硬编码 `theme="dark"`，改为接收 `theme` prop
- [x] 5.2 `ChartGrid` 透传 App 主题；`KLineChartProView` 随主题/语言变化对全部格调 `setTheme/setLocale`
- [x] 5.3 单测：切主题后全部格收到 theme prop（ChartGrid.test 透传断言）

## 6. 布局与每格状态持久化 (layout-persistence)

- [x] 6.1 `ChartConfig.state.grid` 扩展结构：`{layoutCount, activeCell, syncFlags, cells:[{category,symbol,timeframe,indicators}]}`
- [x] 6.2 `handleSaveTemplate` 收集每格状态 + `getIndicatorByPaneId` 枚举指标并 `PUT /chart-config`
- [x] 6.3 启动时 `GET /chart-config` 恢复布局格数、每格 symbol/period（命令式应用到已挂载 cell）、指标（缺啥补啥）、同步开关；绘图按既有 localStorage 机制按 series key 存取
- [x] 6.4 绘图持久化 series key 统一 `category:instId:timeframe` 规范

## 7. 校验与回归

- [x] 7.1 `openspec validate tv-multichart-sync` 通过
- [x] 7.2 前端 typecheck + vitest 全绿（148 passed）
- [ ] 7.3 手动验证：2×2 四格，activate 各格、五类同步逐个开关验证、跨周期绘图镜像、切主题全格跟随、保存重载复原
