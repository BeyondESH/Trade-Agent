## Why

控制台出现 React 警告 `Encountered two children with the same key, 'ARIAUSDT'`。同一 `instId` 在 `SPOT` 与 `USDT-FUTURES` 两个产品线都发行时，后端 `/tickers`（合并视图按 `category:instId` 区分，见 `streamhub.py`）会返回两条记录，前端 `useRealSymbols` 将它们都转成 `id === instId` 的 `SymbolInfo`，导致 `symbols` 数组出现重复 id，凡以 `key={s.id}` 渲染的列表（Watchlist、Hotlists、Agent 下拉等）全部触发重复 key 警告，且重复项出现在下拉选单里。

## What Changes

- `frontend/src/hooks/useRealSymbols.ts`：市场符号列表按 `instId` 去重，同一 `instId` 跨品类出现时只保留一条，优先 `USDT-FUTURES`，其次 `SPOT`，其余品类兜底。
- REST 快照与 WS 增量两条数据源统一采用相同的去重与优先级规则，保证列表内 `id`/`ticker` 全局唯一。
- 保持 `SymbolInfo.id`/`ticker` 仍为纯 `instId`，不改动任何消费组件与图表请求（图表/订单簿/告警已硬编码 `USDT-FUTURES`，与"期货优先"一致）。
- 不触碰 `market-symbol-search` 能力：基于 `/instruments` 的跨品类符号检索仍保持 `category:instId` 独立可选项，两个链路互不影响。
- 新增单测覆盖"同一 instId 跨品类去重、期货优先"与"仅单一品类时保留"。

## Capabilities

### New Capabilities
- `symbol-list-unique-ids`: 市场符号列表（watchlist/screener/agent 下拉所依赖的 `useRealSymbols` 输出）SHALL 保证每个 `instId` 仅出现一次，`id`/`ticker` 全局唯一，跨品类同名符号按固定优先级收敛为单一条目。

### Modified Capabilities
- (none)

## Impact

- **代码**：`frontend/src/hooks/useRealSymbols.ts`（去重逻辑）、`frontend/src/hooks/useRealSymbols.test.ts`（新增用例）。
- **API**：无变化，后端 `/tickers` 与 `/ws` 帧结构不动。
- **行为**：watchlist/热榜/agent 下拉中同一币种不再重复；图表、订单簿、告警继续走 `USDT-FUTURES` 品类数据，与现状一致。
- **风险**：低。仅影响列表层面的条目收敛，不改变任何下游请求参数。
