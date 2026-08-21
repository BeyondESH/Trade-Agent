## ADDED Requirements

### Requirement: 分类分页口径一致

`GlobalNewsClient` 的 `loadMore(category)` 对指定分类加载历史时 SHALL 以该分类在客户端缓冲中已有的条数作为后端 `offset`，并与后端返回的该分类 `total` 比较判定 `hasMore`，不得使用全量列表长度与筛选后 `total` 对比。

#### Scenario: 分类 offset 按分类计数

- **WHEN** 客户端缓冲中某分类已有 N 条且用户触发该分类的加载更多
- **THEN** SHALL 以 N 作为 `offset` 请求该分类历史

#### Scenario: 分类加载不误判全部加载

- **WHEN** 某分类缓冲条数小于后端该分类总数
- **THEN** 该分类的 `hasMore` SHALL 为 true，界面不得显示「已加载全部」，加载更多 SHALL 持续放行

#### Scenario: 全量视图不受分类加载影响

- **WHEN** 触发某分类的加载更多
- **THEN** 全量视图的 `hasMore` SHALL 保持自身语义，不因分类 `total` 较小而被置为 false

#### Scenario: 重连重放重置分类标志

- **WHEN** SSE 重连收到新一轮 `snapshot`
- **THEN** 按分类缓存的 `hasMore` 标志 SHALL 清空，回退到基于最新 snapshot 的全局判定，直至下一次该分类的加载更早重新证明
