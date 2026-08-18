## Why

K 线图蜡烛现价不实时更新的根因(实测定位):`main.tsx` 使用 `<StrictMode>`,开发模式下 React 会 **double-mount** 组件。`KLineChartProView` 的挂载 effect 每次执行都 `new KLineChartPro(...)`,而 vendor pro 组件**没有 `dispose()`**,cleanup 仅做 `innerHTML=""` + `datafeed.unsubscribe`,导致 StrictMode 双挂载后页面上**残留两个 pro 图表实例**(同一根容器下,`y=109` 597px 主图 + `y=864` 194px 隐藏实例)。

两者共享同一个 `BitgetDatafeed`,后挂载的实例抢占订阅回调,用户可见的主图实例**没有绑定有效的实时更新**——字节级 canvas diff 为 0(完全不重绘),而隐藏实例在正常更新。这正是"蜡烛现价每秒不更新"的根源。

## What Changes

- **KLineChartProView 加挂载守卫**:挂载 effect 前检查实例是否已挂载(用 `useRef` 标记),StrictMode 双挂载时**第二次挂载直接复用第一次的 pro 实例**,不再重复 `new KLineChartPro`。
- **cleanup 彻底化**:卸载时不仅清空 `container` 的 `innerHTML`,还释放 datafeed 订阅与已挂载标记,确保组件卸载后无泄漏、重挂载干净。
- **移除/条件化 StrictMode 双挂载的影响**:核心修复在守卫层,StrictMode 保留(开发模式查 bug 仍有用),但图表实例不再被复制。
- 不动 `/ws` 路由、`bitgetWs`、datafeed 逻辑(这些已正确);不涉及后端。

## Capabilities

### New Capabilities
- `chart-mount-lifecycle`: K 线图表实例挂载生命周期管理——单实例守卫、卸载清理、重挂载安全。

### Modified Capabilities
- `klinecharts-pro-integration`: KLineChartPro 实例的生命周期从"每次挂载新建"改为"单实例守卫复用",确保 StrictMode/重挂载下不产生重复图表实例、实时订阅不被抢占。

## Impact

- `frontend/src/components/chart/KLineChartProView.tsx`:挂载 effect 增加已挂载守卫;cleanup 彻底化(释放订阅、清除标记)。
- `frontend/src/main.tsx`:无需改动(守卫层解决),但可评估是否保留 StrictMode。
- 测试:`frontend/src/components/chart/NativeChart.test.tsx` 或新增 `KLineChartProView` 生命周期测试——断言重复挂载不产生第二个实例、卸载后清理完成。
- 前端 `typecheck`(`tsc --noEmit`)与 `vitest run` 通过;本地联调确认主图蜡烛每秒更新、仅一个 pro 实例。
- 不涉及:后端、`bitgetWs`、datafeed、`/ws` 路由。
