## REMOVED Requirements

### Requirement: 活动图选择
**Reason**: 当前终端为单个 klinecharts-pro 实例，不存在"多格布局"与"活动格"；顶栏操作直接作用于唯一图表。该 requirement 与 `terminal-layout`「不再有多图表网格、唯一活动格或跨格同步」直接冲突。代码侧 `GridLayoutPersist.activeCell` 类型无任何消费方。
**Migration**: 无运行时迁移（能力从未实现）。单图终端下顶栏/图表操作天然作用于唯一图表，无需"活动格"路由；未来若引入多图，须另行提案活动格模型。
