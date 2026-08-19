# chart-symbol-switch-race Specification

## Purpose
修复 klinecharts-pro 图表在快速切换币种时的 symbol/period 加载竞态,保证最终呈现用户最后选择的目标。

## Requirements
### Requirement: symbol 切换最后请求优先
系统 SHALL 保证用户对图表 symbol/period 的连续快速切换最终呈现**最后选择的目标**:即使前一次数据加载尚未完成,后一次切换 SHALL 不被丢弃,加载完成后 SHALL 重新加载最新目标。不得出现"图表停留在旧 symbol 数据、新选择无响应"。

#### Scenario: 快速连续切换
- **WHEN** 用户连续快速切换 ETH → XAU → SOL(前一次加载未完成)
- **THEN** 图表 SHALL 最终加载并展示 SOL 数据,而非停留在 ETH

#### Scenario: 加载完成后目标变化重载
- **WHEN** 某次 symbol 加载完成时,当前选择已变为另一个 symbol
- **THEN** 系统 SHALL 主动触发一次重新加载,呈现最终选择的 symbol

### Requirement: 加载期间保持依赖追踪
系统 SHALL 使图表加载 effect 始终追踪 symbol/period 依赖,即使在某次加载进行中提前返回,也不得丢失对后续 `setSymbol`/`setPeriod` 的响应。任何加载中的切换 SHALL 仍能触发加载流程(无论立即或延后)。

#### Scenario: 加载中切换仍触发
- **WHEN** 前一次 symbol 加载进行中(`loading` 为真)时再次 `setSymbol`
- **THEN** 该切换 SHALL 仍被记录并最终生效,不被静默丢弃

#### Scenario: 加载完成后恢复响应
- **WHEN** 加载从进行中转为完成
- **THEN** 若期间有未处理的 symbol 变化,SHALL 自动执行该变化对应的加载
