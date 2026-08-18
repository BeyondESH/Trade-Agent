# ui-live-data-sync Specification

## Purpose
TBD - created by archiving change overhaul-ui-data-sync. Update Purpose after archive.
## Requirements
### Requirement: 通配 ticker 增量订阅
系统 SHALL 使 `/ws` 通配 ticker 订阅(`symbol=default` 或 `*`)建立持续的增量数据流,而非一次性 REST 快照。后端 SHALL 周期刷新全市场 ticker 镜像(约每 5 秒)并向通配订阅方推送 `action:"update"` 帧;前端 SHALL 将后端按 instId 推送的 ticker 帧投递给通配订阅者(category 匹配即可),不再要求 symbol 精确相等。

#### Scenario: 通配订阅持续更新
- **WHEN** 前端以 `channel=ticker, symbol=default` 订阅
- **THEN** SHALL 收到初始 `snapshot` 帧,且随后 SHALL 周期收到 `update` 帧携带全市场 ticker 增量,而非只有一次快照

#### Scenario: 前端通配帧投递
- **WHEN** 前端已订阅 `ticker/default`,后端推送 `ticker/<instId>` update 帧且 category 一致
- **THEN** 前端 SHALL 将该帧投递给通配订阅者,不因 symbol 不精确匹配而丢弃

#### Scenario: 按 symbol 订阅保持精确
- **WHEN** 前端以 `channel=ticker, symbol=BTCUSDT` 精确订阅
- **THEN** 仅 `BTCUSDT` 的 ticker 帧 SHALL 投递给该订阅者,不通配

### Requirement: 市场镜像周期刷新
系统 SHALL 周期(约每 5 秒)刷新全市场 ticker 镜像,并将刷新后的变化推送给活跃订阅方。启动时仍进行一次初始 seed 快照。

#### Scenario: 周期刷新推送
- **WHEN** 周期刷新完成且镜像中价格/成交量等字段发生变化
- **THEN** SHALL 向通配 ticker 订阅方推送 `action:"update"` 帧,前端 watchlist/screener 价格随之实时变化

#### Scenario: 无变化不空推
- **WHEN** 周期刷新完成但镜像无字段变化
- **THEN** SHALL 不推送内容相同的帧(去重),避免无效渲染

### Requirement: 高频数据渲染节流
系统 SHALL 对高频行情帧(ticker/books)的 UI 更新做节流与增量化:只有数据实际变化时才产生新状态引用,避免每次帧全量重建 map/数组导致消费组件全树重渲染。

#### Scenario: ticker 增量更新
- **WHEN** ticker 帧到达
- **THEN** 仅更新发生变化的 instId 条目,`symbols`/`priceMap` SHALL 只在确有变化时返回新引用

#### Scenario: 盘口增量更新
- **WHEN** books update 帧到达
- **THEN** SHALL 按 best-bid/ask 变化与否决定是否触发 setState,不每次帧全量重建

