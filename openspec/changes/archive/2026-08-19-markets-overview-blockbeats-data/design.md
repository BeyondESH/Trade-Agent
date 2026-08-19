## Context

「全球市场概览」视图 `frontend/src/components/views/MarketsView.tsx` 由 `App.tsx` 在 `activeView === 'markets'` 时挂载，接收 `symbols` / `onSelectSymbol` / `onOpenChartWithSymbol` / `theme`。视图由 5 段构成：顶部指数条、Crypto/Forex/Commodities 三栏卡片、底部 Active Market Watchlist 表格。前 4 段读 `MARKETS_OVERVIEW_DATA`（`frontend/src/data/marketData.ts`）的硬编码 mock；只有底部表格消费真实的 `symbols`。

BlockBeats 数据链路已经打通：`backend/src/market_data/blockbeats.py` 的 `fetch_data` 用服务端 `BB_API_KEY` 请求 `https://api-pro.theblockbeats.info/v1/data/{endpoint}`，经 `webapi.py` 的 `GET /blockbeats/data/{endpoint}` 暴露，前端 `api.blockbeatsData(endpoint, network?)` 调用。当前消费方只有两处：`lib/marketPulse.ts`（Data Window 的 Market Pulse，10 个端点）与 Heatmap（`top10_netflow`，带 `network`）。

关键约束与既有事实：

- `DATA_ENDPOINTS` 白名单里有 5 个名字与上游文档不符，`fetch_data` 会先通过白名单校验、再拼成不存在的 URL，上游返回错误后被 `webapi.py` 包成 502。`marketPulse.ts` 用 try/catch 吞掉异常并降级成 `N/A`，所以故障至今是静默的。
- `us10y` / `dxy` 是 K 线型端点，接受 `type`（1D/1W/1M，默认 1M）；`top10_netflow` 接受 `network`。当前代理只透传 `network`。
- BlockBeats data 模块提供的是加密、宏观与链上指标，**没有**股票指数、外汇对、大宗商品的报价，因此 MarketsView 现有 4 个区块无法做同语义替换，只能按新的板块划分重建。
- 密钥必须留在服务端，前端只能走 `/api/blockbeats/*`。

## Goals / Non-Goals

**Goals:**

- 让 BlockBeats data 代理的 11 个端点标识与上游文档完全一致，使先前失效的 5 个端点真正可用。
- 代理支持 K 线型端点的 `type` 参数透传，为 `us10y` / `dxy` 的走势展示提供数据。
- 为 MarketsView 建立一个独立的取数与归一化层，把 11 个端点的异构 payload 收敛成视图可直接渲染的结构。
- 用 BlockBeats 真实的宏观/链上指标板块重建 MarketsView 的数据区块，移除全部 mock。
- 单端点失败不影响其余板块，失败处展示 `N/A`。

**Non-Goals:**

- 不改造底部 Active Market Watchlist 表格（消费实时 `symbols`，本身已是真实数据）。
- 不改动 Data Window 的 Market Pulse 布局与 Heatmap 的实现，只同步其端点名。
- 不为 BlockBeats 数据引入服务端缓存、定时刷新或持久化。
- 不新增股票指数 / 外汇 / 大宗商品行情数据源来填补被移除的区块。
- 不改动 BlockBeats newsflash 相关链路。

## Decisions

### 1. 端点名直接改为真实名，不保留旧别名

`DATA_ENDPOINTS` 中 5 个错误名一次性替换为 `daily_tx` / `stablecoin_marketcap` / `compliant_total` / `us10y` / `contract`。

考虑过维护一张旧名→新名的别名表以保持兼容，但旧名对应的 URL 从来没有成功返回过数据，不存在任何依赖它的可用行为；保留别名只会让白名单长期承载两套名字。代理是内部 API，唯一的前端消费方在同一个变更里同步更新，破坏面可控。

### 2. `type` 用可选查询参数透传，默认交给上游

`GET /blockbeats/data/{endpoint}` 增加可选 `type`，与既有 `network` 同样处理：仅在调用方显式提供时才放进上游请求参数，不在代理层填默认值。上游对缺省 `type` 已有 1M 默认，代理保持透明可以避免默认值在两处漂移。

考虑过在代理层做「K 线型端点强制补 `type=1M`」的白名单判断，但这把端点语义知识下沉到了代理层，与 `fetch_data` 目前「纯转发 + 白名单」的定位不符。默认值改由前端 hook 显式传 `1M` 表达意图。

### 3. 新建独立 hook，不扩展 `marketPulse.ts`

新增 `frontend/src/hooks/useMarketOverview.ts`，内部并行调用 `api.blockbeatsData`，把每个端点的 payload 归一化成对应板块的结构化对象。

`marketPulse.ts` 的 `flattenValue` / `extractTrend` 面向「把任意 payload 压成一行字符串 + 一个趋势数」的 Data Window 场景，是有意的弱类型降维；MarketsView 需要的是每个端点的具体字段（日期序列、多链列表、三平台 OI/成交量），两者的归一化目标相反。强行合并会让 `marketPulse.ts` 同时承担两种互斥的输出形态。分开后 Market Pulse 的现有行为与测试完全不受影响，只需同步端点名。

考虑过后端加一个聚合端点一次返回全部数据，但那会把板块组成这一前端展示决策固化进后端，且失去单端点失败的天然隔离粒度。

### 4. 取数隔离：逐端点 `Promise.allSettled` + 字段缺省

每个端点独立 catch，失败时该板块字段留空而非填占位值，由组件层统一渲染 `N/A`。这样「无数据」与「数值为 0」在数据层就是可区分的两种状态——`net_inflow_million` 完全可能是 `0.00`，若失败时也塞 0 会把故障伪装成真实读数。

### 4a. 上游字段名以实际响应为准（与文档不一致）

BlockBeats API 文档给出的字段名与实际响应**不一致**，实现时以实测响应为准，归一化层用候选名数组兜底（新旧命名都覆盖）：

| 端点 | 文档字段 | 实际字段 |
|---|---|---|
| `btc_etf` | `net_inflow_million` / `total_inflow_million` | `day_net_inflow_million` / `total_net_inflow_million` |
| `compliant_total` | `net_inflow` / `total_net_flow` | `day_net_inflow` / `total_net_inflow` |
| `stablecoin_marketcap` | `value` | `market_cap` |
| `us10y` / `dxy` | — | `close` / `open`（K 线） |

这也是「浏览器手测全 N/A」的直接原因：此前归一化层读取的是文档字段名，与实际返回的 `null` 对不上，全部落到 N/A。修复后经后端代理实测，各字段均已返回真实数值。


### 5. 板块与端点映射

按数据性质而非原有区块结构重新划分：

| 板块 | 端点 | 展示要点 |
|---|---|---|
| 顶部指标卡行 | `btc_etf`、`ibit_fbtc`、`compliant_total`、`bitfinex_long`、`bottom_top_indicator` | 当日/累计净流入、IBIT/FBTC 当日净流入、杠杆多头持仓、情绪指标 |
| 宏观走势 | `us10y`、`dxy`（`type=1M`） | 最新收盘价 + 涨跌方向 + 迷你走势 |
| 资产与链上 | `stablecoin_marketcap`、`daily_tx` | USDT/USDC 市值；各链每日交易量 |
| 合约平台 | `contract` | Hyperliquid / Bybit / Binance 的未平仓合约与成交量 |
| 链上净流入榜 | `top10_netflow`（带 `network` 切换） | 前十币种符号、价格、净流入、流动性 |

`bottom_top_indicator` 上游只返回 `name` / `info` / `create_time`，没有数值字段，因此作为说明性卡片呈现指标名与释义，不伪造读数。

`us10y` / `dxy` 涨跌方向由返回序列末条 K 线的 `close` 与 `open` 比较得出，不额外请求其他粒度。

### 6. 顶部分类筛选 pill 的处置

现有 `activeCategory`（all/indices/crypto/forex/commodities）是为被移除的 4 个区块设计的分类，新板块划分下这组分类不再有对应物，随区块一并移除，避免留下点击无效果的控件。

### 7. `MARKETS_OVERVIEW_DATA` 直接删除

`marketData.ts` 中该常量在改造后仅剩零引用。保留会成为「看起来还在用」的死数据，且与「界面所见皆真实」的目标相悖。同文件内其他 mock（新闻、日历、Screener、Heatmap、社区想法、券商目录）不在本次范围。

## Risks / Trade-offs

- **上游字段命名与文档不一致 / 后续漂移** → 归一化集中在 hook 一层，字段读取对候选名做兜底（如净流入类字段同时接受下划线与驼峰形态）；解析失败按缺省处理，退化为 `N/A` 而不是抛错崩溃视图。
- **11 个端点并行请求放大首屏延迟与上游压力** → 请求并行发出、各板块独立渲染，不做全量 await 阻塞；仅在视图挂载时取一次，不做轮询。若上游限流，失败板块显示 `N/A`，其余照常。
- **`BB_API_KEY` 未配置时整个视图退化为满屏 `N/A`** → 这是「纯真实数据」策略的必然代价，已明确接受；相比回退 mock，满屏 `N/A` 能真实暴露配置缺失，不会用假数据掩盖故障。
- **端点名替换是破坏性变更** → 代理为内部 API，仅 `marketPulse.ts` 一处消费，在同一变更内同步；后端测试中的端点名需一并更新，否则会以旧名继续通过而掩盖问题。
- **移除股指/外汇/商品区块后，「Global Markets Overview」的信息覆盖面变窄** → 标题与副文案需同步调整为加密/宏观/链上口径，避免名实不符；这是接受真实数据源边界的结果，而非展示能力退化。
- **`bottom_top_indicator` 无数值，卡片视觉与其他 KPI 卡不对称** → 作为说明卡独立呈现，不与数值卡混排求齐。
