## 1. 收敛逻辑实现

- [x] 1.1 在 `frontend/src/hooks/useRealSymbols.ts` 定义 `CATEGORY_PRIORITY` 常量（`USDT-FUTURES` > `SPOT` > 未知）
- [x] 1.2 在 `tickerToSymbolInfo` 返回对象中增加内部字段 `_productCategory`（值为 `t.category`），在 `SymbolInfo` 类型上以可选字段声明并标注 `@internal`
- [x] 1.3 在 `useRealSymbols` 中实现纯函数 `dedupeSymbols(byKey)`：按 `id` 去重，同 id 多条时按 `_productCategory` 优先级保留最高者，输出按 `id` 字典序排序
- [x] 1.4 将 `symbols` useMemo 改为调用 `dedupeSymbols(byKey)`，并确认 `priceMap` 仍基于收敛后的 `symbols` 生成

## 2. 单元测试

- [x] 2.1 在 `frontend/src/hooks/useRealSymbols.test.ts` 中新增用例：`SPOT:ARIAUSDT` 与 `USDT-FUTURES:ARIAUSDT` 收敛为一条且为期货条目
- [x] 2.2 新增用例：仅单一品类时原样保留
- [x] 2.3 新增用例：同 instId 三品类（含未知品类）按优先级收敛
- [x] 2.4 新增用例：快照与增量按同一规则收敛（模拟先 SPOT 后 USDT-FUTURES 的写入顺序）

## 3. 验证

- [x] 3.1 运行 `cd frontend && npm run test` 通过全部单测
- [x] 3.2 运行 `cd frontend && npm run typecheck` 通过
- [ ] 3.3 启动前端连接后端，确认控制台不再出现 `Encountered two children with the same key` 警告，且 watchlist/agent 下拉无重复币种（需真实后端 + 双品类实时数据；数据层已由集成测试覆盖）
