## Why

「全球市场概览」视图（`MarketsView`）当前顶部 4 个数据区块（股指、加密币价、外汇、大宗商品）全部读取硬编码 mock（`marketData.ts` 的 `MARKETS_OVERVIEW_DATA`），与真实市场无关，页面等同于静态样板。

同时后端 BlockBeats data 代理的 11 个端点名中有 5 个与上游 API 文档不符（如 `daily_volume` 实际应为 `daily_tx`），会拼出不存在的 URL，导致现有 Data Window「Market Pulse」的这几项永远拉不到数据。这两个问题叠加，使 BlockBeats data 模块的能力实际上大部分未被兑现。

## What Changes

- **修正 BlockBeats data 端点名**：将 `DATA_ENDPOINTS` 中 5 个错误名对齐上游文档 —— `daily_volume`→`daily_tx`、`stablecoin_mcap`→`stablecoin_marketcap`、`exchange_assets`→`compliant_total`、`treasury_10y`→`us10y`、`contract_platforms`→`contract`；前端 `marketPulse.ts` 的端点清单同步更新。**BREAKING**：`/api/blockbeats/data/{旧名}` 不再受支持。
- **支持 `type` 查询参数**：`us10y` 与 `dxy` 为 K 线型端点，代理需透传 `type`（1D/1W/1M），默认 1M。
- **新增 MarketsView 数据获取层**：新建独立 hook，并行拉取 BlockBeats data 端点并归一化为视图可直接消费的结构，单端点失败互不影响。
- **重写 MarketsView 数据区块**：移除股指/加密币价/外汇/大宗商品 4 个 mock 区块，替换为 BlockBeats 真实的宏观与链上指标板块（ETF 净流入、iBit/fBTC、合规交易所资产、Bitfinex 杠杆多头、抄底逃顶指标、10Y 美债、DXY、稳定币市值、各链每日交易量、主流合约平台、链上净流入前十）。
- **失败即 N/A**：任一指标取数失败时展示 `N/A` 占位，不回退到 mock，保证界面所见皆真实数据。
- 底部「Active Market Watchlist」表格继续消费实时交易标的（`symbols`），不在本次改造范围内。
- `MARKETS_OVERVIEW_DATA` 在失去引用后从 `marketData.ts` 移除。

## Capabilities

### New Capabilities
- `markets-overview-real-data`: 全球市场概览视图的数据区块组成、各板块与 BlockBeats 端点的映射关系、取数失败时的 N/A 降级行为，以及 network/type 等参数切换交互。

### Modified Capabilities
- `blockbeats-data`: 数据代理支持的端点标识改为与上游文档一致的真实名称，并新增 K 线型端点的 `type` 参数透传；Market Pulse 区块的端点清单随之更新。

## Impact

- `backend/src/market_data/blockbeats.py`：`DATA_ENDPOINTS` 端点名、`fetch_data` 参数透传。
- `backend/src/market_data/webapi.py`：`GET /blockbeats/data/{endpoint}` 增加 `type` 查询参数。
- `backend/tests/`：BlockBeats data 代理相关测试需同步端点名与新参数。
- `frontend/src/lib/marketPulse.ts`：`MARKET_PULSE_ENDPOINTS` 端点名。
- `frontend/src/hooks/`：新增 MarketsView 数据 hook 及其测试。
- `frontend/src/components/views/MarketsView.tsx`：数据区块重写。
- `frontend/src/data/marketData.ts`：移除 `MARKETS_OVERVIEW_DATA`。
- `frontend/src/api/client.ts`：`blockbeatsData` 需支持传 `type`。
- 依赖上游 `api-pro.theblockbeats.info` 可用性与 `BB_API_KEY` 配置；密钥仍仅后端持有。
