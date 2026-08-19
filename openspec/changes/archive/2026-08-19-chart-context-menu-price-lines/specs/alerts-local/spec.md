# alerts-local Delta Specification

## MODIFIED Requirements

### Requirement: 警报图上画线

系统 SHALL 为当前品种的每条价格线（含启用的警报线与参考线）在图表对应价位绘制一条水平线；警报线统一使用黄色，参考线按主题使用灰色；SHALL 可从线上拖动调整阈值（同步更新实体数据并持久化）；切换品种时 SHALL 只显示该品种的价格线。

#### Scenario: 画线与显隐

- **WHEN** 当前品种存在价格线实体（含参考线与启用警报）
- **THEN** 图表 SHALL 在各阈值价位画水平线；切到其他品种时 SHALL 隐藏非本品种的线

#### Scenario: 拖动改阈值

- **WHEN** 拖动某条价格线（参考线或警报线）到新价位
- **THEN** 对应实体阈值 SHALL 更新并持久化

#### Scenario: 参考线不触发

- **WHEN** 最新价越过某条参考线（`enabled:false`）
- **THEN** SHALL 不标记触发、不参与触发判定，仅作视觉参考
