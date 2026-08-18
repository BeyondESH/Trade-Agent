## 1. 挂载守卫实现

- [x] 1.1 `KLineChartProView.tsx`:新增 `mountedRef = useRef(false)`;挂载 effect 开头检查已挂载则 return,否则 `new KLineChartPro` 后置 `mountedRef.current = true`
- [x] 1.2 `KLineChartProView.tsx`:cleanup 完善——注销 `datafeed.unsubscribe`、清空容器 `innerHTML`、置 `mountedRef.current = false`,并清空 `proRef.current`
- [x] 1.3 `KLineChartProView.tsx`:确认 symbol/period 驱动 effect 在实例复用后仍正确工作(不重复触发 setSymbol/setPeriod 死循环)

## 2. 生命周期测试

- [x] 2.1 新增/更新 `KLineChartProView` 或 `NativeChart` 生命周期测试:连续挂载两次(模拟 StrictMode 双挂载),断言最终只有一个 pro 实例/图表容器
- [x] 2.2 新增卸载后重挂载测试:断言重挂载干净重建、无订阅泄漏、datafeed 订阅被正确注销
- [x] 2.3 断言实时更新绑定可见实例:模拟 `last_candle` 到达,可见实例蜡烛数据更新,不存在第二个实例抢占

## 3. 验证与收尾

- [x] 3.1 前端 `tsc --noEmit` 通过
- [x] 3.2 前端 `vitest run` 全部通过
- [x] 3.3 本地联调(headless 或浏览器):确认 `klinecharts-pro-content/widget` 数量为 1、主图蜡烛随现价每秒更新、`__getChart()` 指向可见实例
- [x] 3.4 运行 `openspec validate --all` 通过
