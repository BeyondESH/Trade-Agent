## Context

订单簿数据链路:`useOrderBook`(前端 hook)→ `useExchangeSocket` 订阅 `books/{symbol}` → 后端 `streamhub` 按 Bitget 原始帧的 snapshot/update 合并后,`_emit` **每次推送合并后的全量盘口**(`book.levels()`,含 seq)。前端 `useOrderBook` 收到帧后把 `data.asks/bids` 当作**增量** merge 进自身维护的 Map,且切换 symbol 时状态不重置。

已验证的 bug(headless Chrome 实测):
- 停在 XAU 时,订单簿 asks 显示 ETH 残留(1913.7-1915),bids 显示 BTC 残留(64434-64426),后端真值是 XAU 4359/4358;
- 切回 BTC 后 asks 仍为 ETH 残留(1914)。

根因二重:
1. **snapshot 当增量 merge**:后端发全量,`mergeInto` 只更新/删除帧中出现的价位,被后端移除或属于其他 symbol 的价位在前端 Map 中永不消失;
2. **切换 symbol 不重置 state**:新 symbol 快照叠加在旧 symbol 残留之上。

## Goals / Non-Goals

**Goals:**
- 切换 symbol 后订单簿立即清空并只反映新 symbol 盘口,无任何旧币残留;
- snapshot 帧整体替换、update 帧增量 merge,语义正确;
- 保留高频节流(`sameBook` 跳过无变化渲染)的既有性能优化;
- 价差面板显示真实 spread。

**Non-Goals:**
- 不改后端(`streamhub.py`/`webapi.py`)——后端推送行为正确,仅前端消费端有问题;
- 不重写 `useExchangeSocket` 的订阅/帧投递机制;
- 不改变订单簿 UI 布局/样式,仅价差数据接入;
- 不处理 ticker/trades 面板的同类问题(无此 bug 报告,`useTrades` 已有正确的 snapshot-replace 语义)。

## Decisions

### D1: hook 内跟踪 symbol 并在变化时重置
在 `useOrderBook(symbol, category)` 内,用 effect 监听 `symbol`(及 `category`)变化,变化时 `setBook(EMPTY_BOOK)`。同时用 ref 记住当前 symbol 的订阅 key,保证**切换瞬间**状态即清空,不等新快照。

- 简单直接,把"生命周期"放进 hook 本身,消费方(App.tsx)无需改动;
- 与 `useTrades` 在 snapshot 时替换的行为对齐思路。

### D2: snapshot 帧整体替换、update 帧增量 merge
`apply` 收到帧时检查 `action`:
- `action === "snapshot"` → 直接以帧内容重建 asks/bids/seq(不再基于 prev merge);
- `action === "update"` → 在 prev 基础上 merge(现状逻辑);
- 两者均保留 `sameBook` 节流:snapshot 替换后若与前状态完全一致仍跳过渲染。

- 语义与后端 `_emit` 行为精确对应(后端已把 snapshot/update 统一为全量 levels;前端按 action 决定替换/merge 是幂等的,但替换消除残留);
- 注意:后端 `_emit` 对 update 帧也发 `book.levels()` 全量,因此 update 分支的 merge 实际是"全量覆盖",残留风险主要在 snapshot 与切换;D2 保证两者都正确。

### D3: 订阅帧未携带 symbol 时按订阅 key 校验
`useExchangeSocket` 帧投递已按订阅 key(channel/symbol/category)匹配,`useOrderBook` 的 listener 只收到当前 symbol 的帧。D1 的重置保证 D2 的替换不会拿错 symbol 的数据。保持现状,不额外改动。

### D4: 价差面板接入真实 spread
`OrderBookPanel` 接收 `spread`(或从 `orderBook` 的 bids/asks[0] 计算),替换硬编码 `0.02 (0.01%)`。`OrderBookState` 已有 `spread` 字段;App.tsx 的 `useMemo` 组装 `OrderBookEntry` 时一并传递。

## Risks / Trade-offs

- **快速切换窗口**:D1 在 symbol 变化瞬间清空,新快照到达前面板短暂为空——可接受且符合 spec("切换瞬间显示空盘口")。极端快速连点(≤150ms)时,若中间 symbol 的快照未返回即切换,不会产生残留(状态已重置),最终稳定在最后 symbol。
- **节流与重置交互**:重置后首帧 snapshot 可能触发一次渲染(旧→空→新),比现状多一次渲染,但消除正确性 bug,可接受。
- **后端全量语义依赖**:update 分支按"帧即全量"处理;若未来后端改为推送增量行,update 的 merge 逻辑已兼容(mergeInto 处理增删改),snapshot 替换语义仍正确,无破坏。
- **价差显示改动面**:OrderBookPanel 属展示组件,接入 spread 不涉及数据链路,风险低。
