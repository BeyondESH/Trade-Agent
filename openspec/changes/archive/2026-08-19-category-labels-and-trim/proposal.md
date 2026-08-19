## Why

Bitget WS 的合法 `instType` 只有 7 个（`SPOT` / `USDT-FUTURES` / `USDC-FUTURES` / `COIN-FUTURES` 及 3 个模拟盘），但当前代码把 `MARGIN` 也当作 WS 品类拉取订阅——Bitget 实测会直接拒绝（`30016 Param error`），margin 数据永远到不了前端。同时 `MARGIN` 的 322 个标的与 `SPOT` 100% 重复（如 `BTCUSDC` 两个品类都有），加上同一 symbol 跨品类重复（`BTCUSDT` 在 SPOT 和 USDT-FUTURES 都有），前端搜索/行情里显示的是 `MARGIN`、`SPOT`、`COIN` 这类无法理解的品类缩写，用户无法区分同一代码属于哪个品类。

## What Changes

- **只拉取 SPOT + USDT-FUTURES 两个品类**：后端 `Settings.categories` 默认值、`MARKET_CATEGORIES`、`_CATEGORY_TICKER_API` 全部收敛为 `["SPOT", "USDT-FUTURES"]`，不再拉取 MARGIN / USDC-FUTURES / COIN-FUTURES 的数据。
- **品类显示中文化**：新增统一的 `categoryLabel()` 映射工具，所有展示品类的地方用中文含义显示（`SPOT`→现货、`USDT-FUTURES`→U本位合约、`MARGIN`→现货杠杆、`USDC-FUTURES`→USDC本位合约、`COIN-FUTURES`→币本位合约 等，含兜底），内部路由（`market` 字段 / WS `instType`）仍保留原始英文 instType。
- **前端品类标签接入**：`useRealSymbols` 的 `exchange` 字段、datafeed `instrumentToSymbolInfo` 的 `exchange` 字段改为输出中文品类标签，使 Screener 的"品类"列/下拉筛选与 klinecharts 搜索结果能清楚区分同代码的不同品类。
- **附带修复**：不再发出 `instType:"MARGIN"` 的 WS 订阅（消除 30016 错误），不再为 MARGIN 走错误的 `mix/candles + productType=MARGIN` 种子拉取路径。

## Capabilities

### New Capabilities
- `category-labels`: 所有 Bitget `instType`/品类术语的显示中文化。提供统一映射表与 `categoryLabel()` 工具，保证内部路由值不变、仅展示层翻译，搜索/行情/筛选结果可区分同 symbol 的不同品类。

### Modified Capabilities
- `multi-market-hub`: 行情镜像覆盖的品类范围从"全部产品线（SPOT/MARGIN/USDT-FUTURES/USDC-FUTURES/COIN-FUTURES）"改为仅"现货 + U本位合约（SPOT/USDT-FUTURES）"，REST 快照与 WS 订阅均只服务这两个品类。

## Impact

- 后端：`backend/src/market_data/config.py`（categories 默认值）、`backend/src/market_data/models.py`（MARKET_CATEGORIES / _CATEGORY_TICKER_API）。
- 前端：`frontend/src/api/types.ts`（MarketCategory 收窄 + 标签映射）、`frontend/src/hooks/useRealSymbols.ts`（exchange 中文标签）、`frontend/src/api/datafeed.ts`（搜索结果 exchange 中文标签）。
- 数据面：`/instruments`、`/tickers` 只返回 SPOT + USDT-FUTURES 的数据；同一 symbol 在 SPOT/USDT-FUTURES 的跨品类条目保留（合法），MARGIN 重复条目消失。
- 不涉及：WS 协议、channel 路由、K 线存取路径均不变；后端 API 仍返回原始 instType 字符串。
