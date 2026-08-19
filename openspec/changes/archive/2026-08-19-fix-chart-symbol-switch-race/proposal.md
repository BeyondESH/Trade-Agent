## Why

点击右侧自选表(watchlist)快速切换币种后,K 线图停留在旧币种或显示无蜡烛,用户选择的 symbol 永不加载。实测定位根因在 `klinecharts-pro` vendor 组件内部的 **加载锁竞态**(`dist/klinecharts-pro.js:3544-3559` 的 a1/Solid createEffect):

1. **依赖追踪丢失**:effect 里 `const f = d(), v = L()` 位于 `if (!a)` 之后。当 `a=true`(上一次加载未完成)时 effect 提前 return,**不读取 `d()`/`L()`**——Solid 无法建立对 symbol/period 的依赖,后续 `setSymbol` 根本不触发此 effect。
2. **无"最后请求优先"**:即使依赖正确,加载完成回调也不检查 symbol 是否已变化,旧 symbol 数据被 `applyNewData` 展示。

快速点击 ETH→XAU→SOL 时:ETH 加载中(a=true)→ XAU/SOL 的 `setSymbol` 不触发 effect → ETH 加载完成后展示,用户选的 SOL 无响应。

## What Changes

- **patch vendor `klinecharts-pro`**:修改 `dist/klinecharts-pro.js` 中 symbol/period 加载 effect:
  - 将 `const f = d(), v = L()` **移到 `if (!a)` 之前**,使 effect 始终保持对 symbol/period 的依赖追踪(即使加载中提前返回也建立依赖);
  - 加载完成回调(`a = !1` 后)检查当前 `d()/L()` 是否与本次加载目标不同,若不同则**主动触发一次重新加载**(`p({...d()})`),实现"最后请求优先"——用户最后选择的 symbol 一定被加载。
- 前端 `KLineChartProView`/`NativeChart`/watchlist 逻辑不变(竞态在 vendor 内部,外部无法规避)。

## Capabilities

### New Capabilities
- `chart-symbol-switch-race`: K 线图 symbol/period 切换的加载竞态防护——vendor effect 依赖追踪修复 + 最后请求优先重载。

### Modified Capabilities
- `klinecharts-pro-integration`: vendor `KLineChartPro` 的 symbol/period 加载逻辑从"首次加载锁+可丢失切换"修复为"最后请求优先+始终追踪依赖",确保快速切换时用户最终选择的 symbol 正确加载。

## Impact

- `frontend/vendor/klinecharts-pro/dist/klinecharts-pro.js`:仅修改 a1 effect(3544-3559 区域)的依赖读取位置与加载完成后的重载检查;为 vendor 改动(此前已改过 N1 窗口)。
- 测试:前端新增回归测试,模拟快速连续 symbol 切换,断言最终图表数据为最后选择的 symbol(可基于 datafeed mock 或 vendor effect 行为)。
- 前端 `tsc --noEmit` 与 `vitest run` 通过;本地联调确认 watchlist 快速点击各币种均正确加载。
- 不涉及:后端、datafeed、bitgetWs、`/ws` 路由。
