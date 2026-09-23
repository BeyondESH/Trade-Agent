## REMOVED Requirements

### Requirement: 跨格同步总线
**Reason**: 当前终端为单个 klinecharts-pro 实例，不存在"跨 cell"概念；`chartSyncBus`/`chartSyncActions`/`cellChartSetup` 在代码中已不存在，`syncOrigin` 防回声机制无实现也无必要。该 requirement 与 `terminal-layout`「单个 klinecharts-pro 原生终端…不再有多图表网格、唯一活动格或跨格同步」及 `klinecharts-pro-chart`「单个 KLineChartPro 实例（不再有多格网格）」直接冲突。
**Migration**: 无运行时迁移（能力从未实现）。若未来重新引入多图网格，须另立 change 重新提案总线设计与五类同步开关。

### Requirement: Symbol 与 Period 同步
**Reason**: 依赖已移除的跨格同步总线；单图终端不存在"其余格"可同步。
**Migration**: 无。未来重启多图功能时随总线一并重新提案。

### Requirement: 十字线与缩放同步
**Reason**: 依赖已移除的跨格同步总线；单图终端无"跨周期按 timestamp 对齐"的第二张图。
**Migration**: 无。未来重启多图功能时随总线一并重新提案。

### Requirement: 绘图同步（同 symbol，按数据坐标）
**Reason**: 依赖已移除的跨格同步总线；单图终端无跨格绘图镜像需求。绘图仍以数据坐标 `{timestamp,value}` 持久化（见 `layout-persistence` 之外的单图图表配置），但不再有"镜像到其余格"的行为。
**Migration**: 无。未来重启多图功能时随总线一并重新提案。
