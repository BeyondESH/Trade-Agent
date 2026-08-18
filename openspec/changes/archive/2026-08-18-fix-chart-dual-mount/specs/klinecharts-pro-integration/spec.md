## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 图表实例生命周期管理
系统 SHALL 将 pro 图表实例的创建纳入统一生命周期管理:创建时机、挂载标记、卸载清理 SHALL 集中处理,确保 StrictMode/重挂载场景下行为一致。

#### Scenario: 生命周期集中管理
- **WHEN** 图表包装器经历挂载/卸载
- **THEN** 实例创建与清理 SHALL 由同一生命周期逻辑负责,无散落的新建/清理代码
