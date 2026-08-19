# klinecharts-pro-integration Specification

## Purpose
TBD - created by syncing change react-klinecharts-pro.
## Requirements
### Requirement: Pro 图表终端集成
系统 SHALL 基于 @klinecharts/pro(clone 至项目 vendor 本地)渲染交易所式图表终端,采用其**原生开箱 UI**:Pro 内置的绘图工具条、周期条、指标管理、标的搜索、时区/设置/截图弹窗 SHALL 全部启用可见,由 Pro 自身作为图表操作的唯一 chrome;应用层 SHALL 仅保留品种/周期双向联动胶水与 datafeed 数据接入,不再提供自建指挥层(`chartCommands`/`chartChromeBridge` 已移除)。默认 `locale:'zh-CN'`,UI 中文显示。图表实例 SHALL 遵循单例守卫生命周期:组件多次挂载(含 StrictMode 双挂载)SHALL 复用同一实例,卸载 SHALL 彻底释放订阅与挂载标记,实时更新 SHALL 始终绑定到用户可见的唯一实例。

#### Scenario: 渲染 Pro 终端
- **WHEN** React 页面挂载 KLineChartPro 包装器
- **THEN** SHALL 渲染出包含 Pro **原生**绘图工具条、周期条、指标管理的图表终端
- **AND** chrome 由 Pro 原生提供(绘图栏在左、周期栏在顶),不再隐藏其周期栏/绘图栏,也不再由模板外壳替代

#### Scenario: 数据接入
- **WHEN** datafeed 的 searchSymbols/getHistoryKLineData/subscribe 被调用
- **THEN** SHALL 分别对接后端端点(搜索、K线历史、实时快照)

#### Scenario: 中文界面
- **WHEN** 图表实例化
- **THEN** SHALL 传入 `locale:'zh-CN'`,Pro 原生 chrome 与弹窗按中文显示

#### Scenario: 挂载不复制实例
- **WHEN** 图表包装器被多次挂载(StrictMode 双挂载或快速重挂载)
- **THEN** SHALL 仅存在一个 pro 实例,不残留重复图表容器

#### Scenario: 卸载释放订阅与标记
- **WHEN** 图表包装器卸载
- **THEN** SHALL 注销 datafeed 订阅并清除已挂载标记,重挂载 SHALL 干净重建

#### Scenario: 实时更新绑定可见实例
- **WHEN** 实时 `last_candle` 到达
- **THEN** SHALL 更新用户可见图表的最后一根蜡烛,不被重复实例抢占

### Requirement: 二次开发扩展点
系统 SHALL 对 vendor 的 Pro 源码做最小改造:暴露底层 klinecharts 实例、提供 symbol/period 变更回调;应用 SHALL 通过 `onSymbolChange`/`onPeriodChange` 实现与右侧面板/状态栏的联动。vendor 加载逻辑 SHALL 修复 symbol/period 切换竞态:加载 effect 始终追踪 symbol/period 依赖(即使加载中提前返回),加载完成后若目标已变化则主动重载,保证快速切换最终呈现用户最后选择的 symbol/period。

#### Scenario: 获取底层实例
- **WHEN** 外部调用 ChartPro 的 getChart()
- **THEN** SHALL 返回底层 klinecharts 实例(用于自动化/序列化/程序化 overlay)

#### Scenario: 变更回调
- **WHEN** 用户在 Pro 原生 chrome 内切换标的或周期
- **THEN** SHALL 触发 onSymbolChange/onPeriodChange,应用据此更新 activeSymbol/timeframe 并联动右侧面板

#### Scenario: 快速切换加载最终目标
- **WHEN** 用户快速连续切换 symbol(前一次加载未完成)
- **THEN** 加载 effect SHALL 保持依赖追踪,加载完成后若目标已变 SHALL 主动重载,最终展示最后选择的 symbol 数据

#### Scenario: 加载中不丢失切换
- **WHEN** 前一次加载进行中再次 `setSymbol`
- **THEN** SHALL 记录该变化并在加载完成后生效,不静默丢弃

### Requirement: 自动层叠加
系统 SHALL 通过暴露的 klinecharts 实例叠加 S/R/结构/SMC 程序化 overlay,并支持图层开关。

#### Scenario: 叠加自动层
- **WHEN** analyze/structure 数据就绪
- **THEN** SHALL 在图表上叠加 S/R 价格线、结构线段/箱体、SMC 图层

#### Scenario: 开关图层
- **WHEN** 用户切换某自动层开关
- **THEN** SHALL 对应 overlay 隐藏/显示而不影响其他图层

### Requirement: 图表实例生命周期管理
系统 SHALL 将 pro 图表实例的创建纳入统一生命周期管理:创建时机、挂载标记、卸载清理 SHALL 集中处理,确保 StrictMode/重挂载场景下行为一致。

#### Scenario: 生命周期集中管理
- **WHEN** 图表包装器经历挂载/卸载
- **THEN** 实例创建与清理 SHALL 由同一生命周期逻辑负责,无散落的新建/清理代码

### Requirement: vendor 加载竞态防护
系统 SHALL 修复 klinecharts-pro 内部 symbol/period 加载的竞态:加载 effect 对 symbol/period 的依赖读取 SHALL 位于加载锁判断之前(保持 Solid 依赖追踪);加载完成回调 SHALL 对比当前目标与本次加载目标,不一致时主动触发重载。改动 SHALL 集中在一个 vendor effect 中,不扩散。

#### Scenario: 依赖读取在锁判断前
- **WHEN** 加载进行中 effect 提前返回
- **THEN** symbol/period 依赖 SHALL 仍被读取并追踪,后续切换 SHALL 触发 effect

#### Scenario: 完成后目标对比重载
- **WHEN** 加载完成且当前 symbol/period 与本次加载目标不同
- **THEN** SHALL 以当前目标重新触发加载,呈现最新选择

