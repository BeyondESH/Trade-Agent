## 1. 数据与映射

- [x] 1.1 在 `TradingPanel.tsx` 定义 journal 记录行类型并实现 `TradeRecord` → 行的映射（null → `—` 占位，`long/short` → 多/空，`pnl` 正负着色）
- [x] 1.2 实现基于 `activeTab === 'history'` 的按需拉取（`useEffect` + `api.journal()`），维护 `trades`/`loading`/`error` 状态
- [x] 1.3 提供手动刷新入口（刷新时重新拉取并更新状态）

## 2. 渲染与状态

- [x] 2.1 在 `TradingPanel.tsx` 内容区新增 `activeTab === 'history'` 渲染分支（表头：品种/方向/开仓价/平仓价/盈亏/平仓原因/平仓时间）
- [x] 2.2 实现加载态、空态、错误态三种渲染
- [x] 2.3 在 `frontend/src/lib/i18n.ts` 的 `zh` 中补齐历史相关中文键（Trade History / No trade history yet. / Loading trade history... / Trade History unavailable: / Close Time / Reason / Profit/Loss）

## 3. 单元测试

- [x] 3.1 新增 `frontend/src/components/bottom/TradingPanel.test.tsx`（`// @vitest-environment jsdom`，`vi.mock` `../../api/client` 的 `api.journal`）
- [x] 3.2 用例：切到 Trade History 渲染记录行（含方向与盈亏）
- [x] 3.3 用例：空记录集显示空态
- [x] 3.4 用例：`api.journal` reject 显示错误信息
- [x] 3.5 用例：positions/orders 既有分支仍正常（回归）

## 4. 验证

- [x] 4.1 `cd frontend && npm run test` 全部通过
- [x] 4.2 `cd frontend && npm run typecheck` 通过
- [x] 4.3 （可选，需真实后端）`cd frontend && npm run test:e2e` 通过，或手动确认点击 Trade History 不再空白
