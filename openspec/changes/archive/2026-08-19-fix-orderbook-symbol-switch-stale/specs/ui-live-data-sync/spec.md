## MODIFIED Requirements

### Requirement: 高频数据渲染节流
系统 SHALL 对高频行情帧(ticker/books)的 UI 更新做节流与增量化:只有数据实际变化时才产生新状态引用,避免每次帧全量重建 map/数组导致消费组件全树重渲染。对于 books 帧,节流 SHALL 以**当前 symbol 的完整盘口**为比较基准:切换 symbol 后 SHALL 先重置再比较,节流不得掩盖 symbol 切换时的残留问题。

#### Scenario: ticker 增量更新
- **WHEN** ticker 帧到达
- **THEN** 仅更新发生变化的 instId 条目,`symbols`/`priceMap` SHALL 只在确有变化时返回新引用

#### Scenario: 盘口增量更新
- **WHEN** books update 帧到达
- **THEN** SHALL 按 best-bid/ask 变化与否决定是否触发 setState,不每次帧全量重建

#### Scenario: 切换后节流基于新盘口
- **WHEN** symbol 切换完成且新盘口就绪
- **THEN** 节流比较 SHALL 基于新 symbol 的盘口状态,SHALL NOT 因旧 symbol 价位残留而误判"无变化"并停止更新
