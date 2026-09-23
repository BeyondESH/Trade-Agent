## ADDED Requirements

### Requirement: 流操作方法绑定安全

`useGlobalNewsStream` 返回的 `flushPending` / `loadMore` SHALL 以绑定到 `GlobalNewsClient` 实例的形式提供给组件，组件解构后直接调用 SHALL 不因 `this` 丢失而抛出 `TypeError`；面板收到实时条目与滚动到底部时 SHALL 保持可用，不得白屏或无法加载。

#### Scenario: 实时条目自动 flush 不崩溃

- **WHEN** 面板位于顶部且收到新的 `item` 事件（`pendingCount > 0`）
- **THEN** 自动 flush SHALL 成功执行，新条目置顶插入，组件 SHALL 不抛错、不卸载整棵组件树

#### Scenario: 点击胶囊 flush 成功

- **WHEN** 用户已下滚、暂存条目计数 > 0 时点击「N 条新快讯」胶囊
- **THEN** 暂存条目 SHALL 成功置顶插入并滚动回顶部，SHALL 不抛错

#### Scenario: 滚动到底部加载更早

- **WHEN** 底部哨兵进入视口或点击「加载更早」按钮
- **THEN** `loadMore` SHALL 成功追加一批旧条目并放行渲染窗口，SHALL 不抛错、不产生未处理 promise 拒绝
