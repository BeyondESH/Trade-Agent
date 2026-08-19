# category-labels Specification

## Purpose
TBD - created by syncing change category-labels-and-trim.

## Requirements
### Requirement: 品类术语显示中文化

系统 SHALL 提供一个统一的品类标签映射（`CATEGORY_LABELS`）与 `categoryLabel()` 工具函数，将 Bitget `instType`/品类术语翻译为中文含义用于展示，包括但不限于：`SPOT`→现货、`USDT-FUTURES`→U本位合约、`USDC-FUTURES`→USDC本位合约、`COIN-FUTURES`→币本位合约、`MARGIN`→现货杠杆、`SUSDT-FUTURES`→U本位模拟合约、`SUSDC-FUTURES`→USDC本位模拟合约、`SCOIN-FUTURES`→币本位模拟合约。对未知品类，SHALL 回退显示原始字符串，MUST NOT 抛出异常。翻译 MUST 仅作用于展示层，不得改变内部路由值（如 WS `instType`、datafeed `market` 字段、`category:instId` 复合键）。

#### Scenario: 已知品类中文显示

- **WHEN** 展示 `SPOT` 或 `USDT-FUTURES` 品类标签
- **THEN** SHALL 显示"现货"或"U本位合约"

#### Scenario: 未知品类兜底

- **WHEN** 遇到映射表中不存在的品类字符串
- **THEN** SHALL 原样显示该字符串，且不抛异常

#### Scenario: 路由值不被翻译

- **WHEN** 使用品类值构造 WS 订阅或 `category:instId` 键
- **THEN** SHALL 使用原始 instType 字符串（如 `SPOT`、`USDT-FUTURES`），MUST NOT 使用中文标签

### Requirement: 搜索与行情中的品类区分

系统 SHALL 在符号搜索结果、市场列表/筛选与 ticker 行情列表的品类展示位上显示中文品类标签，使同一 `instId` 在不同品类下的条目（如 `BTCUSDT` 同时存在于 `SPOT` 与 `USDT-FUTURES`）可被用户区分。

#### Scenario: 图表搜索结果显示品类

- **WHEN** 用户在 K 线图搜索框检索符号
- **THEN** 每条结果 SHALL 携带该符号所属品类的中文标签作为展示标识，且不同品类条目各自独立显示

#### Scenario: 市场列表品类列与筛选

- **WHEN** 市场列表/Screener 展示品类别或按品类筛选
- **THEN** 品类列 SHALL 显示中文标签，筛选选项 SHALL 使用中文标签

#### Scenario: 选中后仍按原始品类路由

- **WHEN** 用户选中某搜索结果或行情条目
- **THEN** K 线图与订单簿/成交 SHALL 按该条目所属的原始品类（instType）加载数据，而非按中文标签
