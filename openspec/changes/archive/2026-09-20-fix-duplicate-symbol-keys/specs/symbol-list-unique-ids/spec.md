## ADDED Requirements

### Requirement: 市场符号列表 instId 唯一

`useRealSymbols` 输出的市场符号列表 SHALL 满足每个 `instId` 最多出现一次，`SymbolInfo.id` 与 `ticker` SHALL 全局唯一。当同一 `instId` 存在于多个产品品类（如 SPOT 与 USDT-FUTURES 的 `ARIAUSDT`）时，系统 SHALL 按固定优先级收敛为单一条目：`USDT-FUTURES` 优先于 `SPOT`，`SPOT` 优先于其他品类，未知品类最后。REST `/tickers` 快照与 WS 通配 ticker 增量两条数据源 MUST 遵守同一套收敛规则。列表排序 SHALL 保持按 `id` 字典序。

#### Scenario: 跨品类同名符号收敛为期货

- **WHEN** `SPOT:ARIAUSDT` 与 `USDT-FUTURES:ARIAUSDT` 均出现在数据源中
- **THEN** 符号列表 SHALL 仅包含一条 `ARIAUSDT`，且该条目的价格/行情字段来自 `USDT-FUTURES` 品类
- **AND** 列表中以 `key={s.id}` 渲染的组件 SHALL NOT 出现重复 key 警告

#### Scenario: 仅单一品类时原样保留

- **WHEN** 某 `instId` 只存在于单个品类
- **THEN** SHALL 保留该条目，价格/行情字段为该品类的原始数据

#### Scenario: 同 instId 多品类按优先级收敛

- **WHEN** 同一 `instId` 同时存在于 `USDT-FUTURES`、`SPOT` 及未知品类
- **THEN** SHALL 仅保留 `USDT-FUTURES` 条目，其余品类条目 SHALL NOT 出现在列表中

#### Scenario: 快照与增量收敛规则一致

- **WHEN** REST 快照写入 `SPOT:BTCUSDT`，随后 WS 增量帧写入 `USDT-FUTURES:BTCUSDT`
- **THEN** 收敛后的列表 SHALL 最终以 `USDT-FUTURES:BTCUSDT` 为准，列表内 `BTCUSDT` 仍唯一

### Requirement: 收敛不破坏下游请求品类

符号去重 MUST NOT 改变 `SymbolInfo.id` 的取值语义（仍为纯 `instId`），且 MUST NOT 影响图表、订单簿、告警等下游请求——它们继续以 `category: 'USDT-FUTURES'` 构造请求。基于 `/instruments` 的跨品类符号检索（`market-symbol-search`）SHALL 保持 `category:instId` 独立可选项，本次收敛 SHALL NOT 作用于该链路。

#### Scenario: 下游请求参数不变

- **WHEN** 用户选中列表中的 `ARIAUSDT`
- **THEN** 图表加载请求 SHALL 仍为 `category: 'USDT-FUTURES', symbol: 'ARIAUSDT'`

#### Scenario: 符号检索保持独立可选项

- **WHEN** 用户在基于 `/instruments` 的检索中查询 `BTCUSDT`
- **THEN** `SPOT:BTCUSDT` 与 `USDT-FUTURES:BTCUSDT` SHALL 仍作为相互独立的可选项返回
