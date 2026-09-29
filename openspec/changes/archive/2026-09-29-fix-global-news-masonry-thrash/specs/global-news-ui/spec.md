# global-news-ui Specification (delta)

## MODIFIED Requirements

### Requirement: 瀑布流布局

全域快讯列表 SHALL 以 JS 瀑布流渲染:每条卡片 SHALL 放入当前高度最短的列;列高度 SHALL 由卡片真实测量(`ResizeObserver`)更新,未挂载卡片 SHALL 以「字数×行高」估算参与列平衡;仅当列高差超过阈值时 SHALL 迁移卡片,避免渲染抖动。列迁移 SHALL 仅由「卡片实测高度首次纠正其估算」触发:当 `ResizeObserver` 上报的高度与已记录高度相同时，系统 MUST NOT 再次更新列高、再次迁移该卡片或触发重渲染——因为卡片迁移会重新挂载并立即重复上报同一高度,若每次上报都重新判定迁移,卡片将在两列间来回振荡,导致无限更新循环与列表抖动。

#### Scenario: 初始分布

- **WHEN** 快照携带一批条目
- **THEN** 每条 SHALL 放入估算后最短的列,最新条目分布在顶部一行

#### Scenario: 实测校正

- **WHEN** 卡片挂载并测量出真实高度
- **THEN** 所在列高度 SHALL 更新;列高差超过阈值时 SHALL 将卡片迁移至实际最短列

#### Scenario: 实时插入

- **WHEN** 新条目到达
- **THEN** SHALL 插入当前最短列的顶部,不触发全量重排

#### Scenario: 重复上报同一高度不迁移（振荡守卫）

- **WHEN** 某卡片迁移到新列后重新挂载，`ResizeObserver` 上报的高度与其已记录高度相同
- **THEN** 系统 SHALL 短路——MUST NOT 再次迁移该卡片或触发重渲染，列分布 SHALL 保持不变
- **AND** 面板在滚动加载更多与切换分类时 MUST NOT 产生 `Maximum update depth exceeded` 或列分布反复抖动

### Requirement: 流操作方法绑定安全

`useGlobalNewsStream` 返回的 `flushPending` / `hasMore` / `loadMore` SHALL 以绑定到 `GlobalNewsClient` 实例的形式提供给组件，组件解构后直接调用 SHALL 不因 `this` 丢失而抛出 `TypeError`；面板收到实时条目与滚动到底部时 SHALL 保持可用，不得白屏或无法加载。此外，这三个返回方法 SHALL 具有**跨渲染稳定的引用**（如以 `useCallback` 固定），使得消费方以它们作为 `useCallback` / `useEffect` 依赖时，相关 effect MUST NOT 因方法引用每渲染变化而每渲染重跑。

#### Scenario: 实时条目自动 flush 不崩溃

- **WHEN** 面板位于顶部且收到新的 `item` 事件（`pendingCount > 0`）
- **THEN** 自动 flush SHALL 成功执行，新条目置顶插入，组件 SHALL 不抛错、不卸载整棵组件树

#### Scenario: 点击胶囊 flush 成功

- **WHEN** 用户已下滚、暂存条目计数 > 0 时点击「N 条新快讯」胶囊
- **THEN** 暂存条目 SHALL 成功置顶插入并滚动回顶部，SHALL 不抛错

#### Scenario: 滚动到底部加载更早

- **WHEN** 底部哨兵进入视口或点击「加载更早」按钮
- **THEN** `loadMore` SHALL 成功追加一批旧条目并放行渲染窗口，SHALL 不抛错、不产生未处理 promise 拒绝

#### Scenario: 方法引用跨渲染稳定

- **WHEN** `GlobalNewsFeed` 在连续两次渲染间未替换 `GlobalNewsClient` 实例
- **THEN** `flushPending` / `hasMore` / `loadMore` 的引用 SHALL 保持不变，以其为依赖的 effect MUST NOT 因引用变化而每渲染重跑
