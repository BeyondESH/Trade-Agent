## Context

`useRealSymbols` 是 watchlist/screener/agent 下拉唯一的符号数据源。它内部用 `Record<string, SymbolInfo>` 存快照与 WS 增量：

- REST `/tickers` 快照：按 `category:instId` 写入。
- WS `ticker` 通配帧：同样按 `category:instId` 写入。

后端合并视图（`streamhub.tickers()`）有意让同一 `instId` 跨品类独立（如 `SPOT:BTCUSDT` 与 `USDT-FUTURES:BTCUSDT`）。但 `tickerToSymbolInfo` 只把 `instId` 塞进 `id`/`ticker`，于是两个品类会产出两个 id 相同的 `SymbolInfo`。App 把整个数组喂给以 `key={s.id}` 渲染的列表，触发重复 key 警告，且下拉里出现重复币种。

约束：`market-symbol-search` spec 要求基于 `/instruments` 的**检索**路径保持 `category:instId` 独立可选项——该链路与 `useRealSymbols`（基于 `/tickers`）完全独立，本次改动不得影响它。图表/订单簿/告警请求硬编码 `category: 'USDT-FUTURES'`，与"期货优先"的收敛规则一致。

## Goals / Non-Goals

**Goals:**
- `useRealSymbols` 输出的 `symbols` 数组满足 `id`/`ticker` 全局唯一。
- 同一 `instId` 跨品类时收敛为单条，优先级 `USDT-FUTURES` > `SPOT` > 其他品类。
- REST 快照与 WS 增量两条数据源遵守同一套去重/优先级规则，不互相覆盖出脏数据。
- 保持 `SymbolInfo.id` 为纯 `instId`，消费组件与图表请求零改动。

**Non-Goals:**
- 不改后端 `/tickers` 合并视图（跨品类区分对检索/图表仍有价值）。
- 不改 `market-symbol-search`（`/instruments` 检索路径）的独立可选项行为。
- 不在渲染层（各 list 组件）加防御式 key 拼接。

## Decisions

**决策 1：收敛点在 `symbols` useMemo，而不是写入 `byKey` 时**

在 `symbols` 的 useMemo 里做按 `instId` 的收敛，`byKey` 保持 `category:instId` 的原始镜像不动。

- 理由：`byKey` 同时被 priceMap 之外的逻辑复用风险低；收敛只需一次线性遍历，且不改变两条写入路径的既有节流/比较逻辑（`ui-live-data-sync` 的高频节流行为不受影响）。
- 备选：写入时按 `instId` 直接覆盖——会破坏现有"类别区分镜像"结构，且 WS 高频帧下要重复判断优先级，改动面更大。

**决策 2：优先级基于品类名，而非展示字段**

优先级排名 `{ "USDT-FUTURES": 0, "SPOT": 1 }`，未知品类统一排最后（`Infinity`）。注意 `SymbolInfo` 只暴露 `exchange`（品类中文 label）不暴露原始 category——因此收敛逻辑不能依赖 `SymbolInfo` 字段，须在遍历 `byKey` 时通过 key 前缀还原 category，或让 `tickerToSymbolInfo` 输出内部保留原始 category。

- 决定：在 `tickerToSymbolInfo` 返回对象中**增加非公开的 `_productCategory` 内部字段**（`SymbolInfo` 类型上以可选字段声明），收敛逻辑直接读它。相比解析 key 字符串，更稳、可测，且不污染展示字段。
- 备选：解析 `byKey` 的 `category:instId` key——字符串耦合、易错，弃用。
- 备选：给 `SymbolInfo` 增加公开 `category` 映射（即 product category）——会与现有 `category: 'crypto' | ...` 资产类别字段语义冲突，弃用。

**决策 3：去重 + 优先级 + 排序一体完成**

```ts
const CATEGORY_PRIORITY: Record<string, number> = { "USDT-FUTURES": 0, SPOT: 1 };

const symbols = useMemo(() => {
  const byId = new Map<string, SymbolInfo>();
  for (const s of Object.values(byKey)) {
    const prev = byId.get(s.id);
    if (!prev) { byId.set(s.id, s); continue; }
    const rankOf = (x: SymbolInfo) => CATEGORY_PRIORITY[x._productCategory] ?? Infinity;
    if (rankOf(s) < rankOf(prev)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}, [byKey]);
```

- 同 `instId` 多条时，`id` 相同所以 key 唯一；`rank` 相等时保留先到者（`<` 而非 `<=`），行为确定。
- 排序保持现有按 `a.id.localeCompare(b.id)` 的稳定序。

**决策 4：单测直接驱动，不依赖网络**

在 `useRealSymbols.test.ts` 中把收敛逻辑抽成纯函数（如 `dedupeSymbols(byKey)`）直接单测；跨品类用例喂 `SPOT:ARIAUSDT` + `USDT-FUTURES:ARIAUSDT`，断言输出仅一条且为期货条目；另覆盖"仅单一品类"与"同 instId 三品类"。

## Risks / Trade-offs

- [同一 instId 若 SPOT 与 USDT-FUTURES 报价差异显著，watchlist 只显示期货报价] → 与现有图表请求品类一致（全走 USDT-FUTURES），属预期行为，风险可接受。
- [`_productCategory` 内部字段泄漏到公共类型] → 类型上标注 `/** @internal */` 文档注释，避免外部误用。
- [收敛后 map 顺序依赖先到先得] → 优先级函数保证同品类重复帧不翻转条目，行为确定。
