## ADDED Requirements

### Requirement: 左边缘余量内提前预载历史

K 线图 SHALL 在用户向右拖动、可见区左缘距离已加载数据起点仍有一段余量时，提前触发后向历史加载并前置渲染，使加载在拖到空白边缘前完成。

#### Scenario: 接近左边缘即预载

- **WHEN** 用户向右拖动使可见区左缘 `from` 进入距数据起点约一个视口宽度 60% 以内
- **THEN** 系统 SHALL 以当前最左可见 bar 的时间戳触发后向历史加载
- **AND** 返回数据 SHALL 前置拼接，接缝无重复（沿用既有 `to = 左边界bar前1根` 语义）

#### Scenario: 并发去重

- **WHEN** 预载请求进行中（`loading`）
- **THEN** 新的预载/`loadMore` 触发 SHALL 被忽略，不重复请求

#### Scenario: 空结果停止预载

- **WHEN** 预载返回空列表（已到最早/回灌失败）
- **THEN** 系统 SHALL 停止后续预载直至 symbol/period 重新加载
- **AND** 不产生重复请求

#### Scenario: 符号/周期切换重置

- **WHEN** symbol 或 period 切换并加载新数据
- **THEN** 预载状态 SHALL 重置为可继续预载

#### Scenario: 硬边界仍可触发

- **WHEN** 用户拖到数据起点（`from === 0`）且预载未覆盖
- **THEN** 原有 `loadMore` 兜底 SHALL 仍触发加载
