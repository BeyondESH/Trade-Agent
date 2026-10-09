## MODIFIED Requirements

### Requirement: K 线更新实时流优先
系统 SHALL 在构建 K 线 `snapshot`/`update` 帧时优先从实时流(buffer)读取最新 bar 作为 `last_candle`;当历史 candle store 为空时,SHALL 仍返回携带 `last_candle` 的帧,不得返回 `{"error":"no data"}` 而丢失实时能力。candle store 仅用于历史回填与指标/支撑阻力等增强字段。

#### Scenario: candle store 为空仍推送 last_candle
- **WHEN** 客户端订阅 K 线 channel 且该 series 的历史 candle store 为空
- **THEN** SHALL 推送 `action:"snapshot"`/`action:"update"` 帧且 `data.last_candle` 为实时流最新 bar,`data` 不含 `"error"` 字段

#### Scenario: 实时流无数据时的行为
- **WHEN** 订阅的 series 实时流与 candle store 均无数据
- **THEN** SHALL 返回含明确错误信息的帧(如 `{"error":"no data"}`),前端 SHALL 将其视为"无数据"而非丢弃有效更新

### Requirement: 指标/S-R 低频周期独立刷新
系统 SHALL 将指标与支撑/阻力等重计算字段与实时 bar 推送解耦：实时 `update` 帧不含此类字段；系统 SHALL 独立维护约每 5 秒一次的周期，为仍处于订阅状态的 K 线 series 推送含指标末值与 Top-N S/R 的完整帧。实时路径 SHALL 不触发 candle store 读取或指标/S-R 计算。
