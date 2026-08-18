## ADDED Requirements

### Requirement: 图表实例单例守卫
系统 SHALL 确保同一图表包装器在挂载生命周期内只存在一个 pro/klinecharts 实例。当组件因开发模式 StrictMode 双挂载、快速重挂载或 React 并发特性被多次挂载时,后到的挂载 SHALL 复用已有实例,不得重复 `new KLineChartPro` 或残留多个图表实例。

#### Scenario: StrictMode 双挂载不复制实例
- **WHEN** React StrictMode 开发模式下组件被挂载→卸载→再挂载
- **THEN** SHALL 只创建一个 pro 实例,页面上 SHALL 恰好存在一个图表内容容器

#### Scenario: 重复挂载复用已有实例
- **WHEN** 组件在未卸载的情况下被再次挂载(如 React 快速重渲染)
- **THEN** 后到的挂载 SHALL 复用首次创建的实例,不新建第二个

#### Scenario: 卸载后重挂载干净重建
- **WHEN** 组件完成卸载后再次挂载
- **THEN** SHALL 干净地新建实例,无旧实例残留、无订阅泄漏

### Requirement: 卸载彻底清理
系统 SHALL 在组件卸载时释放图表全部资源:底层 datafeed 订阅 SHALL 被注销,挂载标记 SHALL 被清除,容器内容 SHALL 被清空。确保组件销毁后无事件监听器泄漏、无残留 DOM。

#### Scenario: 卸载释放订阅
- **WHEN** 图表包装器卸载
- **THEN** datafeed 订阅 SHALL 被注销,后续实时 bar 不再送达已卸载实例

#### Scenario: 卸载清除挂载标记
- **WHEN** 图表包装器卸载
- **THEN** 已挂载标记 SHALL 被清除,再次挂载 SHALL 可正常新建实例

### Requirement: 实时更新绑定有效实例
系统 SHALL 保证实时数据订阅回调绑定到用户可见的图表实例,不被隐藏/重复实例抢占。实时 bar 到达时,SHALL 在用户可见的图表上触发最后一根蜡烛更新。

#### Scenario: 主图实时更新
- **WHEN** 实时 `last_candle` 到达
- **THEN** 用户可见图表的最后一根蜡烛 SHALL 随现价更新(close/high/low 变化)

#### Scenario: 无重复实例抢占
- **WHEN** 页面加载完成
- **THEN** SHALL 不存在第二个图表实例抢占实时订阅,用户可见图表 SHALL 持有唯一有效订阅
