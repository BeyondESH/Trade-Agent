## MODIFIED Requirements

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
- **THEN** SHALL 展示该端点返回的每个指标的指标名称与其 `status` 信号徽章（`Buy`、`Sell`、`Hold`，空值或未知值 SHALL 显示为 `N/A`）
- **AND** SHALL 展示每个指标的说明文本（如 hover 提示或行内小字）
- **AND** `status` SHALL 取自上游真实字段，MUST NOT 编造或推导任何数值读数
- **AND** 当返回数组为空或取数失败时 SHALL 显示 `N/A` 占位