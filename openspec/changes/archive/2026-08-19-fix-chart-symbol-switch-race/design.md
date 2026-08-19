## Context

**Bug(实测复现)**:点击 watchlist 快速切换币种后,K 线图停留在旧币种/无蜡烛。单次切换正常(等待加载完成再点),快速连续切换(150ms 间隔)复现:ETH→XAU→SOL 后图表停在 ETH。

**根因**:`klinecharts-pro` vendor 内部 symbol/period 加载用 SolidJS `createEffect`(dist `a1` 包装),逻辑为:

```
a1((h) => {
  if (!a) {                      // a = loading 标志(初始 false)
    h && e.datafeed.unsubscribe(h.symbol, h.period);
    const f = d(), v = L();      // ← 依赖读取在锁判断之后
    return a = !0, k(!0), (async () => {
      const X = await e.datafeed.getHistoryKLineData(f, v, ...);
      n.applyNewData(X, ...); e.datafeed.subscribe(...);
      a = !1, k(!1);
    })(), { symbol: f, period: v };
  }
  return h;                      // a=true 时跳过,返回旧值
})
```

两个叠加缺陷:
1. **依赖追踪丢失**:Solid 通过 effect 执行时读取响应式信号建立依赖。`a=true` 时提前 return、未读 `d()/L()` → 该 effect 依赖集为空 → 后续 `setSymbol` 不再触发它。
2. **无"最后请求优先"**:即使依赖修复,加载完成也不检查目标是否已变,旧 symbol 数据被展示。

快速切换时序:ETH 加载中(a=true)→ setSymbol(XAU) 不触发 effect → setSymbol(SOL) 不触发 → ETH 加载完展示,用户选的 SOL 永不加载。

## Goals / Non-Goals

**Goals:**
- 快速连续切换 symbol/period 时,最终呈现**最后选择的目标**。
- 加载期间保持对 symbol/period 的依赖追踪,切换不被静默丢弃。
- 改动集中在 vendor 一个 effect,不扩散。

**Non-Goals:**
- 不改后端、datafeed、`/ws`、watchlist 逻辑(竞态在 vendor 内部)。
- 不做前端轮询/强制 remount 的规避(丢失图表状态)。
- 不改其他 vendor effect。

## Decisions

### D1: 依赖读取移到锁判断之前
将 `const f = d(), v = L()` 移到 `if (!a)` 之前,使 effect 每次运行都读取 symbol/period 信号,Solid 据此建立依赖。这样即使 `a=true` 提前 return,effect 仍追踪 symbol/period,后续 `setSymbol`/`setPeriod` 会再次触发该 effect。

- **备选**:不移动,依赖丢失。被否——后续切换完全不触发,是根因之一。
- 注意:Solid 依赖在每次运行时重建,移动后即使加载中也会读取,副作用是加载中每次切换都会"运行"该 effect 一次(但 `a=true` 时仍 return,不重复请求)。

### D2: 加载完成后目标对比并主动重载
在 `a = !1` 之后,读取当前 `d()/L()` 与本次加载目标 `f/v` 对比;若不同,调用 `p({ ...d() })`(setSymbol 浅拷贝触发响应)使 effect 因 symbol 变化再次运行,从而加载最新目标。实现"最后请求优先"。

- **备选**:不做对比,仅依赖 D1。被否——ETH 加载完成后 a=false,但此刻无新的 signal 变化触发 effect(用户最后的 setSymbol 已在加载中被吞掉),SOL 仍不加载;必须主动重载。
- 对比方式:比较 `d().ticker !== f.ticker || L().text !== v.text || L().multiplier !== v.multiplier`。
- `p({...d()})` 用浅拷贝保证响应式触发(Solid setter 对相同引用可能判等跳过)。

### D3: 改动范围限定 vendor 单个 effect
只改 `dist/klinecharts-pro.js` 的 a1 effect(约 3544-3559),不碰 `KLineChartProView`/`NativeChart`/datafeed。vendor 已 vendored 且此前改过 N1 窗口,属既有模式。

- **备选**:前端规避(轮询/remount)。被否——无法可靠感知 vendor 内部 loading;remount 丢图表状态。

## Risks / Trade-offs

- [vendor 被升级覆盖] → 该项目 dist 已 vendored 且手工改过,N1 同样处理;改动可持久。
- [移动依赖读取后加载中每次切换多跑一次 effect] → `a=true` 时仅 return,无副作用;依赖追踪正确性是修复核心。
- [`p({...d()})` 触发重载可能造成额外一次请求] → 仅在"加载完成且目标已变"时发生,即快速切换场景;正常单次切换不触发。
- [Solid 依赖语义差异] → 改动基于"读取即追踪"的标准 Solid 行为,并在测试中固化快速切换回归用例。
- [dist 与 src 不一致] → 该项目直接改 dist(构建产物),src 无对应 TS;保持现状(与 N1 一致)。

## Migration Plan

1. patch `dist/klinecharts-pro.js` a1 effect:D1 移动依赖读取 + D2 完成对比重载。
2. 前端 `tsc --noEmit` 通过;新增快速切换回归测试(模拟连续 setSymbol,断言最终数据为最后目标)。
3. `vitest run` 通过。
4. 本地联调:watchlist 快速连续点击多个币种,确认每个都正确加载、最终停在最后选择。
5. `openspec validate --all` 通过。
6. 回滚:单文件 vendor 改动,revert 即可。

## Open Questions

- 快速切换的"最终目标"判定:以最后一次 `setSymbol` 为准,还是以 `applyNewData` 完成时 `d()` 为准?——设计采用后者(Solid 响应式保证 `d()` 是当前值),与用户感知一致。
- 是否需要同类修复 `setPeriod`?——D1/D2 同时覆盖 symbol 与 period(`L()` 同样移前 + 对比),一并修复。
