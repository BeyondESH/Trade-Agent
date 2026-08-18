## ADDED Requirements

### Requirement: 通配频道周期增量
系统 SHALL 使 `/ws` 中带通配 symbol(`default`/`*`)的订阅频道(当前为 `ticker`)建立周期增量推送:订阅时先推 `snapshot`,随后按固定周期(约每 5 秒)推送全市场 `update` 帧;通配订阅 SHALL 与按 symbol 精确订阅在同一频道内共存,帧按 category 投递。

#### Scenario: 通配 ticker 订阅周期更新
- **WHEN** 客户端以 `channel=ticker, symbol=default` 订阅
- **THEN** SHALL 先收到 `snapshot`,随后周期收到全市场 `update` 帧,数据持续刷新而非一次性

#### Scenario: 精确订阅不受通配影响
- **WHEN** 客户端以 `channel=ticker, symbol=BTCUSDT` 精确订阅
- **THEN** SHALL 仅收到 `BTCUSDT` 的 ticker 帧,通配更新不影响其投递语义
