## ADDED Requirements

### Requirement: 空数据清图与实时引导

系统 SHALL 在 candles 数据为空时清空图表（不残留上一币种/周期的 K 线）；无存量数据时可用实时缓存数据渲染图表。

#### Scenario: 切到无数据币种

- **WHEN** 当前 series 无存量数据
- **THEN** 图表 SHALL 清空或显示实时引导数据，而非残留上一币种的 K 线

#### Scenario: 实时引导渲染

- **WHEN** 存量数据为空且实时缓存有数据
- **THEN** 图表 SHALL 用实时缓存批次渲染 K 线
