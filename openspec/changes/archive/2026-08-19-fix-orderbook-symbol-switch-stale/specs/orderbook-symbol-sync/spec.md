## ADDED Requirements

### Requirement: 盘口随 symbol 切换同步
系统 SHALL 保证订单簿(DOM)面板始终反映**当前选中 symbol** 的盘口状态:切换 symbol 后,前一次 symbol 的任何价位 SHALL 立即清除,后续到达的帧只影响新 symbol 的盘口。面板 SHALL 不得显示前一 symbol 的残留价位(如 asks 保留旧币价位、bids 保留更早币种价位)。

#### Scenario: 切换后仅显示新 symbol 盘口
- **WHEN** 用户从 symbol A 切换到 symbol B,且 B 的快照已到达
- **THEN** 盘口 SHALL 仅包含 B 的价位,A 的全部价位 SHALL 不存在于任何显示与内部状态中

#### Scenario: 多次切换后无累计残留
- **WHEN** 用户依次快速切换 A → B → C,各次快照均到达
- **THEN** 最终盘口 SHALL 仅包含 C 的价位,不含 A/B 的任何残留

#### Scenario: 面板显示与后端一致
- **WHEN** 切换至 symbol B 后打开订单簿面板
- **THEN** 面板 top 档(asks/bids)SHALL 与后端 `/books/{symbol}` 返回的 B 盘口一致

### Requirement: 快照帧整体替换
系统 SHALL 将 `action:"snapshot"` 的 books 帧作为**当前 symbol 盘口的整体替换**,而非在前一状态上增量 merge。增量 merge SHALL 仅适用于 `action:"update"` 帧。

#### Scenario: 快照替换语义
- **WHEN** 收到某 symbol 的 `snapshot` 帧
- **THEN** 盘口状态 SHALL 以该帧为唯一来源整体重建,任何前一状态价位 SHALL 被丢弃

#### Scenario: 更新帧仍增量
- **WHEN** 同一 symbol 快照后收到 `update` 帧
- **THEN** 盘口 SHALL 在快照基础上按更新合并(新增/修改/删除对应价位),不丢失已有档位

### Requirement: 切换时立即清空
系统 SHALL 在 symbol 变化时**立即**重置盘口状态(清空价位/seq/spread),不等新 symbol 快照到达,避免切换瞬间仍显示旧 symbol 盘口。

#### Scenario: 切换瞬间无旧盘口
- **WHEN** 用户触发 symbol 切换、新快照尚未到达
- **THEN** 面板 SHALL 显示空盘口(或加载占位),SHALL NOT 继续显示旧 symbol 的价位

#### Scenario: 快照到达后恢复
- **WHEN** 切换后的 symbol 快照到达
- **THEN** 盘口 SHALL 恢复为该 symbol 的完整盘口

### Requirement: 价差显示真实数据
订单簿面板的"价差"展示 SHALL 使用盘口状态中的真实 spread(最佳卖价 − 最佳买价),SHALL NOT 使用硬编码占位值。

#### Scenario: 价差随盘口更新
- **WHEN** 盘口最佳档位变化
- **THEN** 面板价差 SHALL 按当前 best ask − best bid 更新显示
