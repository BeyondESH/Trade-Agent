## 1. vendor effect 竞态修复

- [x] 1.1 `dist/klinecharts-pro.js`:将 a1 effect(约 3544-3559)中 `const f = d(), v = L()` 移到 `if (!a)` 之前,使 effect 始终追踪 symbol/period 依赖
- [x] 1.2 `dist/klinecharts-pro.js`:在加载完成回调(`a = !1` 后)对比当前 `d()/L()` 与本次加载目标 `f/v`(ticker/text/multiplier),不同则 `p({ ...d() })` 触发重载,实现"最后请求优先"
- [x] 1.3 确认改动仅影响 symbol/period 加载 effect,不触碰其他 effect 与行为

## 2. 回归测试

- [x] 2.1 新增快速切换回归测试:模拟连续 `setSymbol`(ETH→XAU→SOL,前一次加载未完成),断言最终 chart 数据为最后选择的 SOL
- [x] 2.2 新增加载中切换测试:断言加载进行中再次 `setSymbol` 不被丢弃,加载完成后最终生效
- [x] 2.3 前端 `tsc --noEmit` 通过

## 3. 验证与收尾

- [x] 3.1 前端全量 `vitest run` 通过(21 files / 125 tests)
- [x] 3.2 本地联调验证:headless Chrome 快速连点 ETH→XAU→SOL,等待后图表数据与 SOL 实时价一致(76.91≈76.97),最终正确显示最后选择的币种;单次切换行为不变
- [x] 3.3 `openspec validate fix-chart-symbol-switch-race` 通过
