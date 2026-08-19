## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: vendor 加载竞态防护
系统 SHALL 修复 klinecharts-pro 内部 symbol/period 加载的竞态:加载 effect 对 symbol/period 的依赖读取 SHALL 位于加载锁判断之前(保持 Solid 依赖追踪);加载完成回调 SHALL 对比当前目标与本次加载目标,不一致时主动触发重载。改动 SHALL 集中在一个 vendor effect 中,不扩散。

#### Scenario: 依赖读取在锁判断前
- **WHEN** 加载进行中 effect 提前返回
- **THEN** symbol/period 依赖 SHALL 仍被读取并追踪,后续切换 SHALL 触发 effect

#### Scenario: 完成后目标对比重载
- **WHEN** 加载完成且当前 symbol/period 与本次加载目标不同
- **THEN** SHALL 以当前目标重新触发加载,呈现最新选择
