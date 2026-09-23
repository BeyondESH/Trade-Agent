## Context

交易面板 `TradingPanel.tsx` 是底部抽屉 `BottomDock.tsx:154` 渲染的交易 tab 内容，接收 App（`App.tsx:238` 起）持有的**本地模拟** `account`/`positions`/`orders` 三个 prop。它有一个 `activeTab` 状态，类型为 `'positions' | 'orders' | 'history' | 'account'`，但内容区缺少 `history` 分支 → 点击 "Trade History" 空白。

真实交易历史在后端：`GET /journal` 返回 `{"trades": [asdict(TradeRecord)...]}`（`webapi.py:891`），`TradeRecord` 定义于 `memory.py:19`，字段为 `id, symbol, timeframe, side, entry_price, exit_price, notional, margin, leverage, pnl, opened_at, closed_at, strategy, reason, reflection, features`。前端已封装 `api.journal()`（`client.ts:186`）。同页 Agent 的 `PortfolioPanel.tsx:31` 已用 `Promise.all([api.portfolio(), api.journal()])` 拉取并渲染过日志表，可作为字段与容错参照。

## Goals / Non-Goals

**Goals:**
- Trade History 子 tab 渲染真实 `GET /journal` 记录，含加载 / 空 / 错误三态。
- 复用现有 `api.journal()`，不改后端、不动 App 本地模拟账户与其余 tab。
- 以共置 vitest 单测锁定渲染与三态行为。

**Non-Goals:**
- 不改后端 journal 数据结构或端点，不新增 API。
- 不把本地模拟挂单/成交并入历史（本地 `orders` 是 `WORKING` 挂单，`App.tsx:278`）。
- 不做分页 / 筛选 / 导出 UI（`trade-journal` 的筛选由后端 `closed()` 承载，本期不暴露）。
- 不重构 `positions`/`orders`/`account` 三个既有分支。

## Decisions

**决策 1：数据源选 `GET /journal`，而非本地 order history**

`journal` 是持久化的交易记录，含 `exit_price`/`pnl`/`reflection`，符合 "Trade History" 语义（`memory.py:19`）；本地 `orders`（`App.tsx:278`）是模拟挂单，多为 `filled: 0`，不构成历史。

- 备选：把本地平仓事件在前端重建为历史——只覆盖前端会话、刷新即失、无后端权威数据，弃用。

**决策 2：取数位置在 `TradingPanel` 内部，按需拉取**

`useEffect` 依赖 `activeTab === 'history'`，首次进入时调用 `api.journal()`，维护 `trades/loading/error` 状态并提供手动刷新。

- 理由：与 `PortfolioPanel.tsx:31` 的组件自治模式一致，`Blast radius` 最小，`BottomDock`/`App` 无需新增 prop，未打开历史时不影响首屏。
- 备选：App 层拉取后作为 prop 下传——把 journal 状态泄漏进 App，且无论是否打开历史都拖累首屏，弃用。

**决策 3：字段映射（`TradeRecord` → 表格行）**

| 表格列 | journal 字段 | 缺失处理 |
|---|---|---|
| 品种 Symbol | `symbol` | `—` |
| 方向 Side | `side`（`long`→多 / `short`→空） | `—` |
| 开仓价 Entry Price | `entry_price` | `—` |
| 平仓价 Exit Price | `exit_price` | `—`（未平仓） |
| 盈亏 Profit/Loss | `pnl` | `—`；正负着色（`#089981` / `#f23645`，与既有表格一致） |
| 平仓时间 Close Time | `closed_at`（epoch ms） | `—`（`0`/`null`） |
| 原因 Reason | `reflection || reason` | `—` |

**决策 4：三态与容错**

- loading：请求中显示加载态文案。
- empty：`trades.length === 0` 显示空态文案。
- error：捕获 `ApiError`/异常并展示错误文案，交易面板其余 tab 保持可用（错误状态不清空其它数据）。

**决策 5：i18n 走现有 `t()` 机制**

`i18n.ts` 为 `zh` 常量 + `t(key) => zh[key] ?? key`。新增键（如 `Trade History`、`No trade history yet.`、`Loading trade history...`、`Trade History unavailable:`、`Close Time`、`Reason`、`Profit/Loss`）放入 `zh`；缺失时 `t()` 回落原键，不阻塞渲染。

**决策 6：能力归属选 `bottom-dock`，不改 `trading-ui`**

- 交易面板 tab 的内容与空态由 `openspec/specs/bottom-dock/spec.md` 的「交易面板」需求定义，本次是面板内子 tab 的行为，故 MODIFIED `bottom-dock`。
- `trading-ui` 高层「展示组合/盈亏与交易日志」已由 Agent 页 `PortfolioPanel` 满足，其语义未变，故不改 `trading-ui`。

## Risks / Trade-offs

- [journal 可能含未平仓记录，历史表出现无 `pnl` 行] → 以 `—` 占位并保留行；本期不做过滤，保持只读展示。
- [`closed_at` 可能为 `0`/缺省] → 统一格式化，`0`/`null` 显示 `—`。
- [首次进入子 tab 才拉取，出现短暂 loading] → 属预期；提供刷新按钮，且请求只读、无写副作用。
- [`api.journal()` 返回 `Record<string, unknown>[]`，字段无强类型] → 在 TradingPanel 内定义宽松行类型并做 `null` 兜底，避免依赖新增 api 类型定义。
