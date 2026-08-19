## 1. useOrderBook 状态生命周期修复

- [x] 1.1 `useOrderBook.ts`:新增 effect 监听 `symbol`/`category`,变化时 `setBook(EMPTY_BOOK)` 立即清空
- [x] 1.2 `useOrderBook.ts`:`apply` 改为接收 `action`;`action === "snapshot"` 时以帧内容整体替换(asks/bids/seq/spread),不再基于 prev merge
- [x] 1.3 `useOrderBook.ts`:`action === "update"` 保持增量 merge;两者统一保留 `sameBook` 节流(替换/合并后与当前状态完全一致仍返回 prev)
- [x] 1.4 确认订阅帧投递:listener 仅收到当前 symbol 的帧,切换后无跨 symbol 数据混入

## 2. 订单簿面板价差接入真实数据

- [x] 2.1 `App.tsx`:useMemo 组装 `OrderBookEntry` 时从 `rawBook` 取出 `spread` 并传递给 RightDock/OrderBookPanel
- [x] 2.2 `OrderBookPanel.tsx`:价差展示使用传入的 `spread`(无数据显示占位),移除硬编码 `0.02 (0.01%)`
- [x] 2.3 `RightDock.tsx`:类型与透传更新(若需)

## 3. 回归测试

- [x] 3.1 `useOrderBook.test.tsx`:新增用例——symbol 变化后状态立即清空;snapshot 帧整体替换(含清理 prev 残留价位)
- [x] 3.2 `useOrderBook.test.tsx`:新增用例——update 帧仍增量 merge;snapshot 与 update 混合场景无残留
- [x] 3.3 前端 `npx tsc --noEmit` 通过

## 4. 验证

- [x] 4.1 前端全量 `vitest run` 通过(21 files / 129 tests)
- [x] 4.2 headless Chrome 联调复现脚本:ETH → XAU → BTC 各停留后,订单簿 asks/bids 均与后端 `/books/{symbol}` 一致,无旧币残留
- [x] 4.3 快速连点(≤150ms)切换后,最终盘口稳定在最后 symbol
- [x] 4.4 `openspec validate` 通过
