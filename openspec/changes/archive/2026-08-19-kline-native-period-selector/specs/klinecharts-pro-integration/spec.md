## MODIFIED Requirements

### Requirement: Pro 图表终端集成
系统 SHALL 基于 @klinecharts/pro(clone 至项目 vendor 本地)渲染交易所式图表终端,采用其**原生开箱 UI**:Pro 内置的绘图工具条、周期条、指标管理、标的搜索、时区/设置/截图弹窗 SHALL 全部启用可见,由 Pro 自身作为图表操作的唯一 chrome;应用层 SHALL 仅保留品种/周期双向联动胶水与 datafeed 数据接入,不再提供自建指挥层(`chartCommands`/`chartChromeBridge` 已移除)。其中周期条 SHALL 由固定(pin)机制驱动:常驻栏渲染用户已固定的时间级别,并提供扩展按钮打开全集弹窗;该改造 SHALL 在 vendor 周期条内实现,MUST NOT 由应用层隐藏周期条后自建替代。默认 `locale:'zh-CN'`,UI 中文显示。图表实例 SHALL 遵循单例守卫生命周期:组件多次挂载(含 StrictMode 双挂载)SHALL 复用同一实例,卸载 SHALL 彻底释放订阅与挂载标记,实时更新 SHALL 始终绑定到用户可见的唯一实例。

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

#### Scenario: 周期条由固定机制驱动
- **WHEN** 周期条渲染
- **THEN** SHALL 在 vendor 周期条内按已固定级别渲染常驻按钮并提供扩展按钮
- **AND** 应用层 MUST NOT 隐藏周期条后自建周期选择器

### Requirement: 二次开发扩展点
系统 SHALL 对 vendor 的 Pro 源码做最小改造:暴露底层 klinecharts 实例、提供 symbol/period 变更回调;应用 SHALL 通过 `onSymbolChange`/`onPeriodChange` 实现与右侧面板/状态栏的联动。vendor 加载逻辑 SHALL 修复 symbol/period 切换竞态:加载 effect 始终追踪 symbol/period 依赖(即使加载中提前返回),加载完成后若目标已变化则主动重载,保证快速切换最终呈现用户最后选择的 symbol/period。vendor 的时间跨度处理 SHALL 覆盖秒级:历史区间计算与时间轴格式化 MUST 支持秒级时间跨度,秒级时间标签 SHALL 显示到秒。

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

#### Scenario: 秒级时间跨度可计算
- **WHEN** 当前周期为秒级时计算历史请求区间
- **THEN** SHALL 按秒级时间跨度得出正确的起止时间
- **AND** MUST NOT 因缺少秒级分支而产生未调整的区间

#### Scenario: 秒级时间轴显示到秒
- **WHEN** 当前周期为秒级时格式化时间轴与十字光标标签
- **THEN** SHALL 显示到秒精度

## ADDED Requirements

### Requirement: 周期条时间级别来源
周期条呈现的时间级别集合 SHALL 来自交易所原生全集,MUST NOT 包含前端合成或交易所不支持的级别。周期对象的时间跨度 SHALL 与其时间级别语义一致(秒/分/时/天/周/月)。

#### Scenario: 仅呈现原生级别
- **WHEN** 周期条与扩展弹窗渲染可选时间级别
- **THEN** 所呈现的级别 SHALL 全部为交易所原生支持
- **AND** MUST NOT 出现合成级别

#### Scenario: 周期对象跨度正确
- **WHEN** 用户选择周级或月级
- **THEN** 传递给图表的周期对象 SHALL 使用对应的周/月时间跨度
- **AND** MUST NOT 退化为分钟跨度
