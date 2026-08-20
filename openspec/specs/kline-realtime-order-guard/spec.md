# kline-realtime-order-guard Specification

## Purpose
TBD - created by archiving change diagnose-kline-realtime-order. Update Purpose after archive.

## Requirements

### Requirement: 实时 candle 帧时间序列保序
系统 SHALL 保证投递给图表的实时 candle bar 在时间上单调不回退：任一实时帧的 `open_time` 若早于该 series 当前已投递的最新 `open_time`，SHALL 被判定为 stale 并丢弃，不得下发给图表。保序 SHALL 按 `category:symbol:timeframe` 独立判定，不同 series 之间互不影响。

#### Scenario: 更旧的实时帧被丢弃
- **WHEN** 某 series 已投递 `open_time = T1` 的 bar，随后收到同 series `open_time < T1` 的实时帧
- **THEN** 系统 SHALL 丢弃该帧，不调用任何订阅者回调，图表数据列保持不变

#### Scenario: 同桶刷新按替换处理
- **WHEN** 收到的实时帧 `open_time` 等于当前已投递的最新 `open_time` 且 OHLCV 有变化
- **THEN** 系统 SHALL 投递该帧，图表 SHALL 替换当前最后一根 bar 而非新增 bar

#### Scenario: 新桶按追加处理
- **WHEN** 收到的实时帧 `open_time` 大于当前已投递的最新 `open_time`
- **THEN** 系统 SHALL 投递该帧，图表 SHALL 追加为新的一根 bar，序列保持严格升序

#### Scenario: 切换 series 不误判
- **WHEN** 用户切换 symbol 或 timeframe，新 series 的首帧 `open_time` 早于旧 series 最后投递的 `open_time`
- **THEN** 系统 SHALL 正常投递该帧，不得因旧 series 的时间戳而误判为 stale

#### Scenario: 图表数据列始终为合法时间序列
- **WHEN** 实时推送持续进行
- **THEN** 图表数据列的 `timestamp` SHALL 严格升序且无重复值

### Requirement: 保序不影响历史与回填路径
系统 SHALL 使单调性防护仅作用于实时 candle 投递路径；历史加载与向左回填（更早历史的 prepend）SHALL 不受该防护影响。

#### Scenario: 回填更早历史不被丢弃
- **WHEN** 用户向左拖动图表触发更早历史加载，返回的 bar 时间戳全部早于当前尾部
- **THEN** 系统 SHALL 正常将其前置到数据列，不得被实时保序逻辑拦截
