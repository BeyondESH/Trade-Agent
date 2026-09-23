## REMOVED Requirements

### Requirement: 多格布局与每格状态持久化
**Reason**: 该 requirement 要求保存/恢复多图表工作区（布局格数、每格 symbol/period/指标/绘图、五类同步开关）。当前终端为单个 klinecharts-pro 实例，无多格布局与同步开关；代码中 `GridLayoutPersist`/`GridCellPersist`/`ChartConfig.grid`（`frontend/src/api/types.ts:394-425`）未被任何消费方引用，属死类型。该 requirement 与 `terminal-layout`「不再有多图表网格、唯一活动格或跨格同步」冲突。
**Migration**: 单图工作区状态（symbol/period/indicators/drawings/layers）继续经 `/chart-config`（`GET`/`PUT`）持久化，行为不变；`GridLayoutPersist`/`GridCellPersist`/`ChartConfig.grid` 死类型建议清理（见 tasks）。绘图仍以数据坐标 `{timestamp,value}` 持久化、series key 仍为 `category:instId`。
