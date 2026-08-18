## Context

实测定位:K 线图蜡烛现价不实时更新的根因是**前端图表实例被 StrictMode 双挂载复制**。

- `main.tsx` 用 `<StrictMode>`(React 18 开发模式 double-mount:mount→cleanup→mount)。
- `KLineChartProView` 的挂载 effect 每次执行都 `new KLineChartPro(...)`;vendor pro **无 `dispose()`**,cleanup 只做 `container.innerHTML=""` + `datafeed.unsubscribe`。
- 结果:双挂载后同一根容器下残留**两个 pro 实例**(实测:2 个 `klinecharts-pro-content/widget`;主图 `y=109` 597px、隐藏实例 `y=864` 194px)。
- 两个实例共享同一 `BitgetDatafeed`;pro 内部在 symbol/period 变化时调 `datafeed.subscribe(f, v, cb)`,每次 subscribe 先 `unsubscribe` 再注册。后挂载实例的订阅回调抢占了 datafeed,先挂载的主图实例收不到实时 bar → 用户可见主图 canvas 字节级 diff=0(不重绘)。

后端 `/ws` 路由、`bitgetWs` 4 元组匹配、datafeed 均验证正确,问题完全在图表组件挂载生命周期。

## Goals / Non-Goals

**Goals:**
- 页面始终只有一个 pro 图表实例,StrictMode 双挂载不复制。
- 实时订阅回调绑定到用户可见实例,主图蜡烛随现价更新。
- 卸载彻底释放订阅、清除挂载标记,重挂载干净重建。
- 保留 StrictMode(开发查 bug 价值),不改 `main.tsx`。

**Non-Goals:**
- 不改后端、`/ws` 路由、`bitgetWs`、datafeed 逻辑。
- 不 upgrade/修改 vendor pro 组件本身(不做 `dispose()` 补丁,避免 vendor diff 扩大)。
- 不改变图表交互/样式/UI。

## Decisions

### D1: 用 `useRef` 挂载守卫实现单例复用
在 `KLineChartProView` 内维护 `mountedRef`(`useRef(false)`)。挂载 effect 中:
- 若 `mountedRef.current === true` 则直接 return(不重复 `new KLineChartPro`);
- 否则创建实例、置 `mountedRef.current = true`;
- cleanup 中注销订阅、清空容器、置 `mountedRef.current = false`。

StrictMode 时序下:首次 mount 创建实例 A;cleanup 置 false(StrictMode 模拟卸载);二次 mount 重新创建实例 B。由于第一次 cleanup 已清空容器,**最终只有一个实例**,且 datafeed 订阅只注册一次到可见实例。

- **备选 1**:把 pro 实例提升到 `NativeChart` 层(父组件),`useMemo` 创建一次,`useEffect` 仅驱动 symbol/period。被否——`KLineChartProView` 已 forwardRef 暴露 handle,提升会改变组件边界与 ref 语义,且父组件重渲染时同样要处理实例复用,改动面更大。
- **备选 2**:移除 `<StrictMode>`。被否——掩盖问题,且不解决生产环境可能的快速重挂载(如 tab 切换、组件回收)。
- **备选 3**:给 vendor pro 补 `dispose()`。被否——vendor 改动大,且"是否清除正确"取决于 pro 内部 DOM 结构,守卫方案更稳健、更贴近业务层。

### D2: 依赖 datafeed 的 `subscribe` 先退订语义(不动 datafeed)
`BitgetDatafeed.subscribe` 已保证同一 series 只保留一份订阅(`this.unsubscribe` + 重新注册)。守卫层保证只有一个实例调 subscribe,因此 datafeed 无需改动。
- 风险:若未来有多个可见图表(多图),守卫按"每组件单实例"仍成立;datafeed 的 series 级去重已兼容。

### D3: 保留 StrictMode,不条件化
核心修复在守卫层,StrictMode 保留即可;若仍需在开发模式减少噪声,可后续单独评估。不纳入本 change。

## Risks / Trade-offs

- [StrictMode cleanup 在 effect 执行前异步] → `mountedRef` 在 effect 内同步置位,StrictMode 的 mount→cleanup→mount 顺序严格,守卫可正确覆盖。
- [pro 实例持有 DOM 引用,仅 `innerHTML=""` 未必释放全部事件] → pro 内部 listener 挂在 chart 上,`innerHTML` 清空容器后 chart 对象随 ref 释放;datafeed 订阅在 cleanup 注销,无外部泄漏。
- [守卫使 StrictMode 下第二次挂载仍会重建实例] → 目标正是"最终仅一个";重建是 React 语义,不是 bug。测试断言"挂载完成后只有一个实例"。
- [React 19 若改变 double-mount 语义] → 守卫语义与"挂载态"解耦,未来仍成立;测试固化行为。

## Migration Plan

1. `KLineChartProView.tsx`:加 `mountedRef` 守卫 + cleanup 完善,`tsc --noEmit` 通过。
2. 新增/更新 `KLineChartProView` 生命周期测试:模拟连续挂载,断言仅一个实例;卸载后重挂载可重建。
3. `vitest run` + 本地联调(headless 或浏览器):确认 `klinecharts-pro-content/widget` 数量为 1、主图蜡烛每秒更新、`__getChart()` 指向可见实例。
4. 回滚:单文件改动,revert 即可;无前后端协议变化。

## Open Questions

- 是否需要暴露实例计数(如 `data-pro-instances` 属性)便于测试/调试?默认测试通过 DOM 查询断言即可。
- 生产构建(无 StrictMode)是否需要额外防御(如 HMR 热替换导致的组件重建)?守卫已覆盖"重复挂载复用"场景,预计无需额外处理。
