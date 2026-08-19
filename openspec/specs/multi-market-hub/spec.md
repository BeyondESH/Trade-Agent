# multi-market-hub Specification

## Purpose
TBD - created by syncing change multi-market-categories.

## Requirements
### Requirement: 多品类行情镜像

系统 SHALL 基于 Bitget 现货与 U 本位合约产品线（`SPOT`、`USDT-FUTURES`）按品类独立维护实时行情镜像，包括 ticker、订单簿、成交、标记价格、资金费率与 instruments 元数据；各品类互不干扰。系统 SHALL NOT 拉取 `MARGIN`、`USDC-FUTURES`、`COIN-FUTURES` 及其他产品线的行情数据。

#### Scenario: 品类隔离

- **WHEN** 同时订阅不同品类的行情频道
- **THEN** 系统 SHALL 按 category 分别维护镜像，任一品类的数据更新不影响其他品类

#### Scenario: 品类范围限定

- **WHEN** 系统启动并初始化各品类
- **THEN** SHALL 仅初始化 `SPOT` 与 `USDT-FUTURES` 两个品类，SHALL NOT 对 `MARGIN`/`USDC-FUTURES`/`COIN-FUTURES` 发起 WS 订阅或 REST 拉取

#### Scenario: 全品类 ticker 快照

- **WHEN** 系统启动并初始化各品类
- **THEN** SHALL 通过 REST 拉取 `SPOT` 与 `USDT-FUTURES` 的 ticker 与 instruments 元数据作为初始快照

#### Scenario: 按品类订阅实时频道

- **WHEN** 客户端订阅某品类某 symbol 的频道
- **THEN** 系统 SHALL 使用该品类的 `instType`（`SPOT` 或 `USDT-FUTURES`）建立 WS 订阅并维护对应品类镜像

### Requirement: 品类 REST 快照端点

系统 SHALL 提供按品类寻址的 REST 快照端点：`/tickers`、`/instruments` 支持 `category` 过滤参数；`/books/{category}/{symbol}`、`/trades/{category}/{symbol}`、`/funding`、`/mark-price` 支持品类维度。

#### Scenario: 按品类查询 ticker

- **WHEN** 请求 `/tickers?category=SPOT`
- **THEN** SHALL 仅返回现货品类的实时行情

#### Scenario: 缺省返回全部

- **WHEN** 请求 `/tickers` 不带 category
- **THEN** SHALL 返回全部品类合并的行情列表

#### Scenario: 品类化订单簿与成交

- **WHEN** 请求 `/books/{category}/{symbol}` 或 `/trades/{category}/{symbol}`
- **THEN** SHALL 返回对应品类下该 symbol 的数据

### Requirement: 品类元数据覆盖

系统 SHALL 通过 Bitget v3 `/api/v3/market/instruments` 拉取全部品类的 instrument 元数据，覆盖 `symbolType`（crypto/metal/stock/commodity）、`isRwa`、`isReality`、精度字段，并归一化为统一字段名。

#### Scenario: 元数据归一化

- **WHEN** 拉取各品类 instruments
- **THEN** SHALL 将 `symbol/instId`、`pricePlace/pricePrecision`、`volumePlace/quantityPrecision` 等差异字段归一化，前端可直接消费

#### Scenario: 贵金属与股票标识

- **WHEN** instruments 含 `symbolType=metal`、`symbolType=stock` 或 `isReality=yes` 的交易对
- **THEN** 系统 SHALL 保留这些标记，供前端分组展示
