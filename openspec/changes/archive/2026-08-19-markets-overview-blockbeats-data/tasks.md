## 1. 后端：端点名修正与参数透传

- [x] 1.1 修正 `backend/src/market_data/blockbeats.py` 的 `DATA_ENDPOINTS`：`daily_volume`→`daily_tx`、`stablecoin_mcap`→`stablecoin_marketcap`、`exchange_assets`→`compliant_total`、`treasury_10y`→`us10y`、`contract_platforms`→`contract`
- [x] 1.2 在 `webapi.py` 的 `blockbeats_data` 路由增加可选 `type` 查询参数，与 `network` 一同按「仅在显式提供时才转发」的方式组装上游参数，代理层不填默认值
- [x] 1.3 简化 `blockbeats_data` 中的参数拼装逻辑，避免为每个可选参数写分支（当前 `network` 是三元判断）
- [x] 1.4 在 `backend/tests/test_blockbeats.py` 增加用例：`/blockbeats/data/us10y` 正确转发到 `/v1/data/us10y`
- [x] 1.5 在 `backend/tests/test_blockbeats.py` 增加用例：带 `type=1M` 时透传，不带 `type` 时上游参数中不出现 `type`
- [x] 1.6 在 `backend/tests/test_blockbeats.py` 增加用例：旧端点名（如 `daily_volume`）返回 400
- [x] 1.7 运行后端测试 `pytest tests/test_blockbeats.py`（backend 目录，PYTHONPATH=src）确认全绿

## 2. 前端：API 客户端与 Market Pulse 同步

- [x] 2.1 扩展 `frontend/src/api/client.ts` 的 `blockbeatsData`，支持传递可选 `type` 参数
- [x] 2.2 同步更新 `frontend/src/lib/marketPulse.ts` 的 `MARKET_PULSE_ENDPOINTS` 为真实端点名，标签文案保持不变
- [x] 2.3 检查并更新 `frontend/src/lib/marketPulse.test.ts` 中涉及端点名的断言
- [x] 2.4 运行 `npm test -- marketPulse` 确认 Market Pulse 相关测试通过

## 3. 前端：MarketsView 数据获取层

- [x] 3.1 新建 `frontend/src/hooks/useMarketOverview.ts`，定义各板块的归一化数据类型（顶部指标卡、宏观走势、资产与链上、合约平台、净流入榜）
- [x] 3.2 实现各端点的归一化函数：`btc_etf`、`ibit_fbtc`、`compliant_total`、`bitfinex_long`、`bottom_top_indicator` 取最新一条记录的相应字段
- [x] 3.3 实现 `us10y` / `dxy` 的归一化：以 `type=1M` 请求，取序列末条 K 线的 `close`，涨跌方向由该条 `close` 与 `open` 比较得出，并保留序列用于迷你走势
- [x] 3.4 实现 `stablecoin_marketcap`（usdt/usdc 最新市值）与 `daily_tx`（按链取展示名与最新一日交易量）的归一化
- [x] 3.5 实现 `contract` 的归一化：取最新日期的 Hyperliquid / Bybit / Binance 未平仓合约与成交量
- [x] 3.6 实现 `top10_netflow` 的归一化，支持 network 参数并可在 network 变化时重新取数
- [x] 3.7 用 `Promise.allSettled` 并行发起全部请求，单端点失败时对应字段留空（不填 `0` 等默认值），保证真实零值与缺失数据可区分
- [x] 3.8 字段读取做候选名兜底（如净流入类字段同时接受下划线与驼峰形态），解析失败按缺省处理而不抛错
- [x] 3.9 新建 `frontend/src/hooks/useMarketOverview.test.ts`，覆盖：各端点正常归一化、单端点失败隔离、零值不被当作缺失、network 切换重新取数

## 4. 前端：MarketsView 视图重写

- [x] 4.1 移除 `MarketsView.tsx` 对 `MARKETS_OVERVIEW_DATA` 的引用及股指、加密币价、外汇、大宗商品四个区块
- [x] 4.2 移除 `activeCategory` 状态与顶部分类筛选 pill 控件
- [x] 4.3 接入 `useMarketOverview`，渲染顶部指标卡板块（ETF 净流入、iBit/fBTC、合规交易所资产、Bitfinex 杠杆多头）
- [x] 4.4 渲染抄底逃顶指标说明卡（展示指标名与说明文本，不呈现任何数值读数）
- [x] 4.5 渲染宏观走势板块（10Y 美债、DXY：最新价 + 涨跌方向 + 迷你走势）
- [x] 4.6 渲染资产与链上活跃度板块（稳定币市值、各链每日交易量）
- [x] 4.7 渲染主流合约平台板块（三平台未平仓合约与成交量）
- [x] 4.8 渲染链上净流入前十板块，含 network 切换控件
- [x] 4.9 统一缺失数据的 `N/A` 占位渲染，确保任一板块失败不影响其余板块
- [x] 4.10 更新视图标题与副文案为加密/宏观/链上口径，避免与实际数据覆盖面名实不符
- [x] 4.11 确认底部 Active Market Watchlist 表格及其点击开图行为未受影响
- [x] 4.12 保持既有 i18n（`t()`）与明暗主题（`isDark`）用法一致

## 5. 清理与验证

- [x] 5.1 确认 `MARKETS_OVERVIEW_DATA` 已无引用后，从 `frontend/src/data/marketData.ts` 移除
- [x] 5.2 运行 `npm run typecheck` 确认无类型错误
- [x] 5.3 运行 `npm test` 确认前端测试全绿
- [x] 5.4 在 `BB_API_KEY` 已配置的环境下手动验证各板块展示真实数据，并验证 network 切换生效（已通过直接调用后端代理证实：btc_etf/daily_tx/ibit_fbtc/stablecoin_marketcap/compliant_total/dxy/bitfinex_long/contract/bottom_top_indicator 全部返回真实数据；us10y`type=1M`、dxy`type=1D`、top10_netflow solana/ethereum 均正常；浏览器 UI 渲染建议复核）
- [ ] 5.5 在 `BB_API_KEY` 缺失的环境下手动验证全部指标显示 `N/A` 且无模拟数据、页面不崩溃
