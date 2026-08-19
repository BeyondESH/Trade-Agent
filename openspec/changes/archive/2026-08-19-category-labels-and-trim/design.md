## Context

当前系统把 Bitget 的 5 个 REST 品类（`SPOT`/`MARGIN`/`USDT-FUTURES`/`USDC-FUTURES`/`COIN-FUTURES`）全部当作 WS 品类使用：`MarketStream`（`backend/src/market_data/streamhub.py`）为每个品类开一条 WS 连接，订阅帧里 `instType` 直接等于该字符串。但 Bitget WS 实测只接受 `SPOT`/`USDT-FUTURES`/`USDC-FUTURES`/`COIN-FUTURES`（及其模拟盘变体）作为 `instType`，`MARGIN` 会被拒绝（`30016 Param error`）。同时 v3 REST 里 `MARGIN` 的 322 个标的与 `SPOT` 完全重合，不是独立市场。

前端展示侧，`useRealSymbols.ts:19` 把 `category` 经 `.replace("-FUTURES","")` 后塞进 `SymbolInfo.exchange`，Screener 的"品类"列/筛选下拉直接显示 `SPOT`/`MARGIN`/`COIN` 这类缩写；datafeed 的 klinecharts 搜索每行只标固定 `"Bitget"`。用户无法从搜索/行情区分同一代码（如 `BTCUSDT` 同时存在于 SPOT 与 USDT-FUTURES）属于哪个品类。

约束：后端 API 面向多个消费方，应保持机器可读；前端已有多处用 `exchange` 字段做品类展示位；WS 订阅路由（`instType`）必须保持英文原值。

## Goals / Non-Goals

**Goals:**
- 行情拉取范围收敛为 `["SPOT", "USDT-FUTURES"]`，不再发起 `MARGIN`（及其他）的 WS 订阅与 REST 拉取。
- 所有品类术语的展示一律中文化（`SPOT`→现货、`USDT-FUTURES`→U本位合约 等）。
- 搜索/行情/筛选能清楚区分同一 symbol 的不同品类。
- 后端 API 字段值（`category`）保持原始 instType，不随展示层翻译。

**Non-Goals:**
- 不改变 WS 协议、channel 路由、K 线存取路径。
- 不改变 `SymbolInfo.category`（crypto/stocks/forex 资产类别维度）——那是另一套分类，本次不动。
- 不新增模拟盘（`SUSDT-FUTURES` 等）拉取。
- 不清理历史已落盘的 MARGIN/USDC/COIN parquet 数据。

## Decisions

### D1: 品类收敛到 SPOT + USDT-FUTURES

`Settings.categories` 默认值（`backend/src/market_data/config.py:38`）、`MARKET_CATEGORIES` 与 `_CATEGORY_TICKER_API`（`backend/src/market_data/models.py:14,26`）统一改为 `["SPOT", "USDT-FUTURES"]`。

- 依据：需求只需现货 + U本位合约；`MARGIN` 非 WS 合法 `instType` 且与 SPOT 标的 100% 重复，一并剔除。
- 备选：保留 MARGIN 列表但仅用于 REST —— 复杂且无收益，`SPOT` 镜像已覆盖其全部标的。
- 影响：`MarketStream` 只起 2 条 WS 连接，`/instruments`、`/tickers` 只回 2 个品类；`streamhub._request` 的 `instType` 不再出现非法值。

### D2: 前端统一 `categoryLabel()` 映射，展示层翻译、路由层保留原值

在 `frontend/src/api/types.ts` 增加 `CATEGORY_LABELS: Record<string, string>` 与 `categoryLabel(category?: string): string`。完整覆盖所有合法 instType（含 `MARGIN`、模拟盘、未知值兜底为原值），即使本次只拉 2 个品类，也能防御历史数据/脏数据。

- 关键约束：datafeed 的 `SymbolInfo.market` 与 WS `instType` 必须保持英文原值——它同时是 `toSeries()` → `category` → WS 订阅路由的键。只改展示字段。
- 备选：后端下发翻译后的 `category_label` 字段 —— 增加 API 面与双端同步成本，且后端目前无 i18n 需求；不采用。

### D3: 中文标签挂到 `exchange` 展示位

- `useRealSymbols.ts:19`：`exchange: categoryLabel(t.category)`（替换 `.replace("-FUTURES","")`），Screener 的"品类"列与筛选下拉随即显示中文。
- `datafeed.ts:37`（`instrumentToSymbolInfo`）：`exchange: categoryLabel(inst.category)`（替换固定 `"Bitget"`），klinecharts 搜索结果每行显示"现货"/"U本位合约"，可区分同代码不同品类。
- 备选：把翻译塞进 `name`/`description` —— 语义不符且改动点更多；不采用。

## Risks / Trade-offs

- [同 symbol 跨品类条目仍保留两条（合法且有意）] → 中文标签使其可区分；若后续要"同名折叠"，需另立交互设计，超出本次范围。
- [历史 parquet 中有 MARGIN/USDC/COIN 目录] → 不再被读取，无迁移必要；store 路径由 `category/symbol/timeframe` 组织，天然隔离。
- [`.env` 通过 `MD_CATEGORIES` 覆盖默认列表] → 当前仓库无该配置；实现时提示用户在 .env 同步即可。
- [klinecharts 搜索若对 `ticker` 去重会吞掉跨品类条目] → 当前 `searchSymbols` 逐条返回、无去重；实现后补一条测试锁住行为。

## Migration Plan

1. 后端改默认品类列表 → 重启后端，`MarketStream` 以 2 个品类初始化。
2. 前端加映射与标签 → 热更新即生效，无数据迁移。
3. 回滚：还原配置默认值 + 前端映射回退，两处独立、互不依赖。

## Open Questions

无阻塞项。`useTickerList.ts:6` 的 `CategoryTab`（含 MARGIN/USDC/COIN 枚举）当前无组件使用，属于死代码；实现时一并收敛到 2 个品类，避免未来误用。
