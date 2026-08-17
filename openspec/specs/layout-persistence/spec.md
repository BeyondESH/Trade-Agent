# layout-persistence Specification

## Purpose
TBD - created by archiving change tv-multichart-sync. Update Purpose after archive.
## Requirements
### Requirement: 多格布局与每格状态持久化

系统 SHALL 支持保存与恢复多图表工作区：布局格数、每格的 symbol/period/指标/绘图、以及五类同步开关，序列化经 `/chart-config`（`PUT` 保存 / `GET` 恢复）。重载应用后 SHALL 复原上述全部状态。绘图 SHALL 以数据坐标（`{timestamp,value}`）持久化，series key SHALL 采用 `category:instId` 规范。

#### Scenario: 保存与恢复

- **WHEN** 配置 2×2 布局、各格不同 symbol/period 与若干绘图后触发保存并重载
- **THEN** 布局格数、每格 symbol/period/指标/绘图与同步开关 SHALL 全部复原

#### Scenario: 绘图按数据坐标持久化

- **WHEN** 保存含趋势线的格
- **THEN** 绘图 SHALL 以 `{timestamp,value}` 端点存储，恢复后按当前周期正确重投影

#### Scenario: 同步开关持久化

- **WHEN** 关闭绘图同步后保存并重载
- **THEN** 绘图同步开关 SHALL 保持关闭

