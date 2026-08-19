## MODIFIED Requirements

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
