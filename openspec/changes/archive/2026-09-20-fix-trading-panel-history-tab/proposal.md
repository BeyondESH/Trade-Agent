## Why

底部抽屉交易面板的 "Trade History" tab 在类型中已声明（`TradingPanel.tsx:25` 的 `activeTab` 含 `'history'`）且按钮已渲染（`TradingPanel.tsx:91`），但内容区只有 `positions`（`TradingPanel.tsx:112`）、`orders`（`:168`）、`account`（`:212`）三个渲染分支，点击 Trade History 得到空白面板。后端已提供 `GET /journal`（持久化交易记录，含开/平仓价与盈亏、反思，见 `webapi.py:891`、`memory.py:19`），前端 `api.journal()`（`client.ts:186`）也已就绪，只差渲染接线。

## What Changes

- `frontend/src/components/bottom/TradingPanel.tsx`：为 `history` tab 增加渲染分支，数据来自 `GET /journal`（`api.journal()`），把 `TradeRecord` 映射为交易历史表格（品种/方向/开仓价/平仓价/盈亏/平仓原因/平仓时间）。
- 三态处理：拉取中显示加载态；记录为空显示空态文案；请求失败显示错误信息而非白屏。
- 进入该 tab 时按需拉取（首次点击触发）并提供手动刷新；视图为只读，不影响本地模拟账户/挂单。
- `frontend/src/lib/i18n.ts`：补齐交易历史所需中文文案键（沿用现有 `t()` 机制）。
- 新增共置单测 `frontend/src/components/bottom/TradingPanel.test.tsx`（vitest + Testing Library，mock `api.journal`），覆盖：历史渲染、空态、错误态、既有 tab 回归。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `bottom-dock`: 「交易面板」需求扩展——交易面板 tab SHALL 提供可用的交易历史子视图，经 `GET /journal` 展示持久化交易记录，并具备加载 / 空 / 错误状态，且 MUST 为只读。

## Impact

- **代码**：`frontend/src/components/bottom/TradingPanel.tsx`、新增 `frontend/src/components/bottom/TradingPanel.test.tsx`、`frontend/src/lib/i18n.ts`（新增文案键）。`BottomDock.tsx`/`App.tsx` 无需改动（TradingPanel 自行取数）。
- **API**：复用现有 `GET /journal` 与 `api.journal()`，无后端改动、无新增端点。
- **行为**：Trade History tab 不再空白；positions/orders/account 三个既有 tab 与本地模拟账户逻辑不受影响。
- **风险**：低。仅新增一个只读渲染分支与只读请求。
