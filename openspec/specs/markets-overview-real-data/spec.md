# markets-overview-real-data Specification

## Purpose
TBD - created by archiving change markets-overview-blockbeats-data. Update Purpose after archive.
## Requirements
### Requirement: 概览数据区块全部来自真实数据源
「全球市场概览」视图（MarketsView）的数据区块 SHALL 全部通过 `/api/blockbeats/data/*` 获取真实数据渲染，MUST NOT 使用任何硬编码的模拟数据。原有的股票指数、加密币价、外汇、大宗商品四个模拟数据区块 SHALL 被移除，替换为 BlockBeats 提供的宏观与链上指标板块。

#### Scenario: 打开全球市场概览
- **WHEN** 用户切换到「全球市场概览」视图
- **THEN** 视图 SHALL 渲染由 BlockBeats 真实数据驱动的指标板块
- **AND** SHALL NOT 出现来自 `MARKETS_OVERVIEW_DATA` 的股指、加密币价、外汇、大宗商品模拟数值

#### Scenario: 分类筛选控件随区块移除
- **WHEN** 视图渲染完成
- **THEN** 面向已移除区块的分类筛选控件（all/indices/crypto/forex/commodities）SHALL 不再存在

### Requirement: 顶部指标卡板块
视图 SHALL 提供顶部指标卡板块，数据分别来自 `btc_etf`、`ibit_fbtc`、`compliant_total`、`bitfinex_long`、`bottom_top_indicator` 端点。

#### Scenario: 比特币现货 ETF 净流入
- **WHEN** `btc_etf` 取数成功
- **THEN** SHALL 展示最新日期的当日净流入与累计净流入（单位：百万美元）

#### Scenario: iBit 与 fBTC 净流入
- **WHEN** `ibit_fbtc` 取数成功
- **THEN** SHALL 分别展示 IBIT 与 FBTC 的最新当日净流入

#### Scenario: 合规交易所总资产
- **WHEN** `compliant_total` 取数成功
- **THEN** SHALL 展示最新日期的当日净流入与累计净流入

#### Scenario: Bitfinex 杠杆多头持仓
- **WHEN** `bitfinex_long` 取数成功
- **THEN** SHALL 展示币种、价格与多头持仓数量

#### Scenario: 抄底逃顶指标以说明卡呈现
- **WHEN** `bottom_top_indicator` 取数成功
- **THEN** SHALL 展示指标名称与指标说明文本
- **AND** MUST NOT 为该指标编造或推导任何数值读数

### Requirement: 宏观走势板块
视图 SHALL 提供宏观走势板块，展示 10 年期美债收益率（`us10y`）与 DXY 美元指数（`dxy`）。两个端点 SHALL 以 `type=1M` 请求。

#### Scenario: 展示最新价与走势
- **WHEN** `us10y` 或 `dxy` 取数成功
- **THEN** SHALL 展示序列中最新一条 K 线的收盘价
- **AND** SHALL 展示由该条 K 线收盘价与开盘价比较得出的涨跌方向
- **AND** SHALL 展示基于返回序列的迷你走势

### Requirement: 资产与链上活跃度板块
视图 SHALL 提供资产与链上活跃度板块，数据来自 `stablecoin_marketcap` 与 `daily_tx` 端点。

#### Scenario: 稳定币市值
- **WHEN** `stablecoin_marketcap` 取数成功
- **THEN** SHALL 分别展示 USDT 与 USDC 的最新市值

#### Scenario: 各链每日交易量
- **WHEN** `daily_tx` 取数成功
- **THEN** SHALL 按链展示其展示名称与最新一日的交易量

### Requirement: 主流合约平台板块
视图 SHALL 提供主流合约平台板块，数据来自 `contract` 端点。

#### Scenario: 三平台未平仓合约与成交量
- **WHEN** `contract` 取数成功
- **THEN** SHALL 分别展示 Hyperliquid、Bybit、Binance 三个平台最新日期的未平仓合约与交易量

### Requirement: 链上净流入前十板块
视图 SHALL 提供链上净流入前十板块，数据来自 `top10_netflow` 端点，并 SHALL 提供 network 切换控件。

#### Scenario: 展示净流入前十币种
- **WHEN** `top10_netflow` 以某 network 取数成功
- **THEN** SHALL 展示该网络下净流入前十币种的符号、美元价格、净流入与流动性

#### Scenario: 切换 network
- **WHEN** 用户切换 network
- **THEN** SHALL 以新的 network 参数重新请求 `top10_netflow` 并刷新板块内容

### Requirement: 取数失败降级为 N/A
各板块的取数 SHALL 相互隔离，单个端点失败 MUST NOT 影响其余板块渲染。取数或解析失败时，对应指标 SHALL 展示 `N/A` 占位，MUST NOT 回退到模拟数据，也 MUST NOT 用 `0` 等默认值代替缺失数据。

#### Scenario: 单端点失败
- **WHEN** 某一端点请求失败
- **THEN** 该端点对应的指标 SHALL 展示 `N/A`
- **AND** 其余端点对应的板块 SHALL 正常展示真实数据

#### Scenario: 密钥未配置
- **WHEN** 后端 `BB_API_KEY` 未配置导致全部端点失败
- **THEN** 所有指标 SHALL 展示 `N/A`
- **AND** MUST NOT 展示任何模拟数据

#### Scenario: 真实零值与缺失数据可区分
- **WHEN** 某端点成功返回且数值为 `0`
- **THEN** SHALL 展示 `0` 而非 `N/A`

### Requirement: 保留实时交易标的表格
视图底部的「Active Market Watchlist」表格 SHALL 继续消费实时交易标的数据，其行为与交互不受本次数据区块改造影响。

#### Scenario: 表格保持可用
- **WHEN** 用户在概览视图中点击表格中的某个标的
- **THEN** SHALL 按原有行为在图表中打开该标的

