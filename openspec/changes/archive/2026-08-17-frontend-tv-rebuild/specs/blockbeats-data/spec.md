# blockbeats-data Specification

## ADDED Requirements

### Requirement: BlockBeats 数据代理
系统 SHALL 通过后端新增 `GET /api/blockbeats/data/{endpoint}` 代理 BlockBeats 数据类接口(共 11 个:btc_etf、每日交易量、iBit/fBTC 净流入、稳定币市值、合规交易所总资产、10 年期美债收益率、dxy、Bitfinex 杠杆多头、主流合约平台数据、抄底逃顶指标、top10_netflow),key 同样取自 `backend/.env` 的 `BB_API_KEY`,仅后端持有。

#### Scenario: 数据接口代理
- **WHEN** 前端请求 `/api/blockbeats/data/dxy`
- **THEN** 后端 SHALL 携带 `api-key` 转发到 `https://api-pro.theblockbeats.info/v1/data/dxy` 并返回数据

### Requirement: Data Window Market Pulse
系统 SHALL 在右侧栏 Data Window 面板新增 "Market Pulse" 区块,展示全局市场指标:抄底逃顶指标、DXY 美元指数(含 1M 曲线)、10 年期美债收益率、稳定币市值、比特币现货 ETF 流入、iBit/fBTC 净流入、合规交易所总资产、Bitfinex 杠杆多头、主流合约平台数据、每日交易量;该区块数据 SHALL 全部来自 `/api/blockbeats/data/*`。

#### Scenario: Market Pulse 展示
- **WHEN** 用户打开 Data Window 面板
- **THEN** SHALL 在原有 OHLCV/指标区之外展示 Market Pulse 区块,列出上述全局指标的真实数值

#### Scenario: DXY 曲线
- **WHEN** Market Pulse 加载 dxy 数据
- **THEN** SHALL 展示 DXY 当前值、涨跌方向与可选的 1M 时间序列小曲线

### Requirement: Heatmap 接入 top10_netflow
系统 SHALL 将 Heatmap 视图的加密区块改为真实数据:按 network 参数(如 solana/ethereum)请求 `/api/blockbeats/data/top10_netflow`,用净流入数值驱动方块大小与颜色,并提供 network 切换控件;其余区块(如股票)继续使用 mock。

#### Scenario: 链上净流入热力图
- **WHEN** 用户打开 Heatmap 并选择某 network
- **THEN** SHALL 渲染该网络下净流入前十币种的方块,颜色/大小对应净流入正负与大小

#### Scenario: Network 切换
- **WHEN** 用户在 Heatmap 切换 network(solana → ethereum)
- **THEN** SHALL 重新请求对应网络的 `top10_netflow` 并刷新方块
