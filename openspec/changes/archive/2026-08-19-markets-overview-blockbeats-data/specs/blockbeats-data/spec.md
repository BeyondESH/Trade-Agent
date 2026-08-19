## MODIFIED Requirements

### Requirement: BlockBeats 数据代理
系统 SHALL 通过后端 `GET /api/blockbeats/data/{endpoint}` 代理 BlockBeats 数据类接口（共 11 个），端点标识 SHALL 与上游 API 文档保持一致：`btc_etf`（比特币现货 ETF 总流入）、`daily_tx`（每日交易量）、`ibit_fbtc`（iBit/fBTC 净流入）、`stablecoin_marketcap`（稳定币市值）、`compliant_total`（合规交易所总资产）、`us10y`（10 年期美债收益率）、`dxy`（DXY 美元指数）、`bitfinex_long`（Bitfinex 杠杆多头持仓）、`contract`（主流合约平台数据）、`bottom_top_indicator`（抄底逃顶指标）、`top10_netflow`（链上净流入前十币种）。key 同样取自 `backend/.env` 的 `BB_API_KEY`，仅后端持有。

代理 SHALL 支持透传上游可选查询参数：`network`（用于 `top10_netflow`）与 `type`（用于 `us10y`、`dxy` 等 K 线型端点，取值 1D/1W/1M）。参数 SHALL 仅在调用方显式提供时才转发给上游，代理层 MUST NOT 自行填充默认值。

#### Scenario: 数据接口代理
- **WHEN** 前端请求 `/api/blockbeats/data/dxy`
- **THEN** 后端 SHALL 携带 `api-key` 转发到 `https://api-pro.theblockbeats.info/v1/data/dxy` 并返回数据

#### Scenario: 端点标识与上游一致
- **WHEN** 前端请求 `/api/blockbeats/data/us10y`
- **THEN** 后端 SHALL 转发到 `https://api-pro.theblockbeats.info/v1/data/us10y` 并返回数据

#### Scenario: 透传 type 参数
- **WHEN** 前端请求 `/api/blockbeats/data/dxy?type=1M`
- **THEN** 后端 SHALL 将 `type=1M` 一并转发给上游

#### Scenario: 未提供可选参数时不填默认值
- **WHEN** 前端请求 `/api/blockbeats/data/dxy` 且未提供 `type`
- **THEN** 后端 SHALL NOT 向上游请求中加入 `type` 参数

#### Scenario: 拒绝未知端点
- **WHEN** 前端请求一个不在上述 11 个标识之内的端点
- **THEN** 后端 SHALL 返回 400 错误

### Requirement: Data Window Market Pulse
系统 SHALL 在右侧栏 Data Window 面板新增 "Market Pulse" 区块，展示全局市场指标：抄底逃顶指标、DXY 美元指数（含 1M 曲线）、10 年期美债收益率、稳定币市值、比特币现货 ETF 流入、iBit/fBTC 净流入、合规交易所总资产、Bitfinex 杠杆多头、主流合约平台数据、每日交易量；该区块数据 SHALL 全部来自 `/api/blockbeats/data/*`，且所用端点标识 SHALL 与上游文档一致。

#### Scenario: Market Pulse 展示
- **WHEN** 用户打开 Data Window 面板
- **THEN** SHALL 在原有 OHLCV/指标区之外展示 Market Pulse 区块，列出上述全局指标的真实数值

#### Scenario: DXY 曲线
- **WHEN** Market Pulse 加载 dxy 数据
- **THEN** SHALL 展示 DXY 当前值、涨跌方向与可选的 1M 时间序列小曲线

#### Scenario: 先前失效的端点恢复取数
- **WHEN** Market Pulse 加载每日交易量、稳定币市值、合规交易所总资产、10 年期美债收益率、主流合约平台数据
- **THEN** SHALL 使用 `daily_tx`、`stablecoin_marketcap`、`compliant_total`、`us10y`、`contract` 标识请求并展示真实数值
