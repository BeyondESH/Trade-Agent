## Context

当前 `MarketStream`（`streamhub.py`）是**单品类**设计：`_category` 全局固定，`_tickers/_books/_trades/_mark/_funding/_instruments` 均为单字典，REST 快照端点（`/tickers` `/instruments`）读单实例，WS 订阅帧 `instType` 固定。`BitgetDatafeed.searchSymbols`（`datafeed.ts`）只返回 3 个硬编码 `FIXED_SYMBOLS`，与市场模块真实数据（748 合约）脱节。Bitget 官方 v3 `/api/v3/market/instruments` 支持 `category ∈ {SPOT, MARGIN, USDT-FUTURES, USDC-FUTURES, COIN-FUTURES}`，每类含 `symbolType ∈ {crypto, metal, stock, commodity}` 与 `isRwa/isReality` 标记。

目标：展示 Bitget 全部产品线，市场列表按品类 Tab，K 线搜索打通全市场，跨品类联动图表与行情，统一界面字体。

## Goals / Non-Goals

**Goals:**
- `MarketStream` 支持多品类：按 category 独立维护全部镜像与订阅。
- REST 端点按 category 过滤/寻址；前端按品类 Tab 消费。
- K 线搜索基于全产品线 instruments 动态检索，替换硬编码 `FIXED_SYMBOLS`。
- symbol 切换跨品类联动 K 线/订单簿/成交/资金费率。
- 统一界面字体（含 klinecharts-pro 工具条）。
- 前端 typecheck / vitest / build、后端 pytest 保持通过。

**Non-Goals:**
- 不实现交易/下单功能（仅行情展示）。
- 不引入 Bitget 私有 WS 或账户数据。
- 不重写 klinecharts-pro 内部，仅通过公开选项与样式覆盖。
- 不做多币种计价换算（延续 USDT 计价展示）。
- MARGIN 若官方 WS instType 不支持，仅展示 REST ticker，不订阅实时 books/trade。

## Decisions

### D1: 多品类中枢结构（按 category 键控）

`MarketStream` 内部镜像从单字典改为 `dict[str, dict]`（key = category）：

```python
class MarketStream:
    def __init__(self, *, url, categories: list[str], heartbeat_seconds, reconnect_seconds, ...):
        self._tickers: dict[str, dict[str, dict]] = {}       # cat -> instId -> row
        self._books:   dict[str, dict[str, OrderBookMerger]] = {}
        self._trades:  dict[str, dict[str, deque]] = {}
        self._mark:    dict[str, dict[str, dict]] = {}
        self._funding: dict[str, dict[str, dict]] = {}
        self._instruments: dict[str, dict[str, dict]] = {}   # cat -> symbol -> spec
```

- 连接循环为每品类一个独立 WS 连接（`_run_loop(category)`），互不阻塞；各连接 `instType` = category。
- `subscribe/unsubscribe(channel, category, symbol)`：refcount key 变为 `(category, channel, symbol)`。
- REST seed（`_refresh_tickers/_refresh_instruments`）按 category 调对应端点：
  - 合约类（USDT/USDC/COIN-FUTURES）：`/api/v2/mix/market/tickers` + `contracts`（沿用 `productType` 参数）。
  - SPOT：`/api/v2/spot/market/tickers`；instruments 统一改走 v3 `/api/v3/market/instruments?category=`（支持全部 5 类，含 symbolType/isRwa/isReality）。
- `fetch_instruments(category)` / `fetch_tickers(category)` 按 category 分发 URL。

备选考虑：每品类一个独立 MarketStream 实例 —— 否决，REST 端点与前端需统一入口，单实例多键控更省连接与代码面。

### D2: REST 端点 category 寻址

- `GET /tickers?category=`（缺省返回全部品类合并）；`GET /instruments?category=` 同。
- `GET /books/{category}/{symbol}`、`GET /trades/{category}/{symbol}`、`/funding?category=`、`/mark-price?category=`。
- 为兼容旧路径，`/books/{symbol}` 缺省 category 时回退 `USDT-FUTURES`（前端统一升级后移除）。

### D3: 前端品类模型与市场列表 Tab

```ts
type MarketCategory = "SPOT" | "MARGIN" | "USDT-FUTURES" | "USDC-FUTURES" | "COIN-FUTURES";
type SymbolType = "crypto" | "metal" | "stock" | "commodity";
```

- `useTickerList` 升级：按 `category` 参数拉取 `api.tickers({category})`，tab 状态驱动；保留跨品类合并的 "all" 视图。
- `MarketList` 顶部渲染产品线 Tab（现货 / U 合约 / USDC / 币本位 / 杠杆，贵金属与股票按 symbolType 作为分组标签或独立 tab，见 D5）。
- Ticker/Instrument 类型增加 `category`、`symbolType`、`isRwa`、`isReality` 字段。

### D4: K 线搜索动态化

`BitgetDatafeed.searchSymbols(search, category?)` 调 `api.instruments({category})`，缓存 instruments（TTL 60s），本地过滤：

- 匹配 `symbol`/`shortName` 子串（大小写不敏感）。
- 支持 `category` 过滤与 `symbolType` 前缀过滤（如输入 "gold"/"XAU" 命中贵金属）。
- 返回 `SymbolInfo { ticker, shortName, market: category, pricePrecision, volumePrecision }`，精度取 instrument 的 `pricePrecision/quantityPrecision`。
- 移除 `FIXED_SYMBOLS` 硬编码；`App.tsx` 默认 symbol 从 `FIXED_SYMBOLS[0]` 改为加载后取 BTCUSDT/USDT-FUTURES 或第一个 instrument。
- 备选考虑：仅用 REST tickers 搜索 —— 否决，instruments 提供精度与 symbolType，是搜索与渲染的正确源。

### D5: 品类与 symbolType 的 Tab 组织

采用**两级导航**：一级 Tab = category（现货/合约组），二级过滤 = symbolType（全部/加密货币/贵金属/股票/大宗）。

- 合约组（USDT/USDC/COIN-FUTURES）合并为"合约"大类，内部可再选 U/币本位/USDC（或下拉）。
- 贵金属/股票/大宗由 `symbolType` 过滤呈现，不单开 category。
- 备选考虑：category × symbolType 全平铺 —— 否决，Tab 过多（5×4=20），两级导航更清晰。

### D6: symbol 跨品类联动

- `App.tsx` 的 `symbol` state 升级为 `{ category, ticker }`。
- `toSymbolInfo` 不再 fallback `USDT-FUTURES`，而用 instrument 元数据补全 `category/market`。
- K 线请求（candles/candlesRecent）、订单簿、成交、资金费率均携带 `category`。
- `PeriodBar`/图表内部切换 symbol 时通过 `onSymbolChange` 回传完整 `SymbolInfo`（含 market=category）。

### D7: 字体统一

- 全局继续使用 `tailwind.config.js` 的 `fontFamily.sans`。
- 新增 CSS：对 vendored klinecharts-pro 的工具条/弹窗/周期条/搜索框覆盖 `font-family`（目标选择器来自 `klinecharts-pro.css` 内 `.klinecharts-pro-*` 类）。
- `index.css` 中 `.tnum` 保持 `font-family: inherit`（无衬线 + tabular-nums）。
- 备选考虑：改 vendor 源码 —— 否决，保持 vendor 不动，CSS 覆盖更易维护。

## Risks / Trade-offs

- [MARGIN 无公开 WS 行情频道] → 仅 REST ticker 展示，不订阅 books/trade；spec 标注 MARGIN 为"列表展示"级别。
- [5 条 WS 连接资源开销] → 各品类按需 lazy start（有订阅才连），合约类沿用现有 chunk 订阅。
- [instruments v3 与 v2 ticker 字段名差异] → 统一归一化层：`symbol→instId`、`pricePlace→pricePrecision`、`volumePlace→quantityPrecision` 等映射集中于 hub。
- [搜索接口无后端聚合] → `searchSymbols` 前端缓存 instruments + 本地过滤，600+ 条内存过滤性能可接受。
- [category 路径破坏旧前端] → 前端与后端同仓同步升级；保留缺省 category 回退减少破坏窗口。

## Migration Plan

1. 后端：`models.py` 增加 category 常量；`streamhub.py` 多品类键控改造；`config.py` categories 配置；`webapi.py` 端点升级；跑 pytest。
2. 前端：`api/types.ts` 类型扩展；`client.ts` 端点参数；`datafeed.ts` 搜索动态化；`useTickerList`/`MarketList` Tab；`App.tsx` 跨品类联动。
3. 字体：`index.css` klinecharts-pro 覆盖。
4. 全量验证：后端 pytest、前端 typecheck/vitest/build、浏览器多品类切换。

## Open Questions

- MARGIN 品类的 WS 行情频道可用性需实测（若不可用仅 REST）。
- 合约组 Tab 内 U/币本位/USDC 用 Tab 还是下拉更合适（倾向 Tab）。
- 贵金属/股票指数以独立 Tab 还是 symbolType 过滤器呈现（倾向过滤器，见 D5）。
