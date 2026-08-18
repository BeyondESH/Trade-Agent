## Context

三个相关前端缺陷:

1. **冗余顶栏**:`TopNavbar`(id=`tradingview-top-header`)展示 symbol 报价条 + Alert/Order/主题按钮,与 klinecharts-pro 原生 chrome 功能重叠,应删除。`App.tsx:682-688` 渲染,`frontend/src/components/header/TopNavbar.tsx` 定义。

2. **图表外组件死数据(核心)**:watchlist/screener 依赖 `useExchangeSocket("ticker","default",...)` 通配订阅。实测后端:
   - 通配 ticker 订阅(`webapi.py:692`)只发一次 REST `market.tickers()` 快照,**从不 `market.subscribe()`** → 无 Bitget WS 增量来源;
   - `streamhub._refresh_tickers`(streamhub.py:586)仅在启动时执行一次,无周期刷新;
   - 即使有增量,后端 `listener` 按 instId 推 `{symbol:"BTCUSDT"}`,前端 `useExchangeSocket` 精确 key 匹配 `ticker/default/...` → 帧被丢弃。
   - `books`/`trade` 按 symbol 订阅,增量正常(snapshot+update 均到)。
   - 结论:通配 ticker = 一次性死数据。

3. **卡顿**:
   - `useRealSymbols`:rAF 合并已有,但每次 flush `setByKey` 全量重建 map → `symbols`/`priceMap` 新引用 → watchlist 全树重渲染;
   - `useOrderBook`:每帧 update 全量重建 asks/bids(即使 best 未变);
   - 高频行情(全市场 ticker 每帧全量)叠加上述全量重建,渲染压力大。

## Goals / Non-Goals

**Goals:**
- 删除 `TopNavbar`,关联功能入口收敛。
- 通配 ticker 订阅建立持续增量流:后端周期刷新 + 推送,前端通配 key 匹配。
- 高频数据 UI 更新节流:仅实际变化时产生新引用,减少全树重渲染。
- 保持 `books`/`trade`/candle 现有正常链路不变。

**Non-Goals:**
- 不改 K 线蜡烛实时链路(已修复的 realtime-candle-event-push / rewrite-ws-subscription-routing / fix-chart-dual-mount)。
- 不做服务端广播/发布订阅框架重构(保持单连接 per-client 订阅)。
- 不改变数据存储、指标算法。

## Decisions

### D1: 后端通配 ticker 改为"周期刷新 + emit 增量"
`streamhub._refresh_tickers` 从"启动一次"改为周期任务(约每 5s,独立 task),刷新后对比镜像,将变化的行 emit 为 `action:"update"`;无变化则不 emit。`webapi` 通配 ticker 订阅分支保留 `snapshot`(读当前镜像),同时由于 `listener` 已匹配 `(ticker, cat, "*", "")`,周期 emit 的 update 帧自然到达订阅者。

- **备选**:按活跃 instId 逐个订阅 Bitget WS ticker。被否——通配是全市场(数百 instId),Bitget 单连接订阅数限制(1000)虽够,但逐个订阅/退订维护复杂;周期 REST 刷新(已有 `_fetch_tickers`)成本低、实现稳。
- **备选**:前端改为订阅"热门榜"若干 symbol。被否——改变 watchlist 语义,仍需处理动态列表。

### D2: 前端 `useExchangeSocket` 通配帧投递
在 `onmessage` 分发时:若订阅 key 的 symbol 为 `default`/`*`(通配),则将帧投递给该 key 下所有监听器,要求 category 一致;精确订阅(`symbol=BTCUSDT`)保持精确匹配。

- **备选**:后端对通配订阅统一把帧 symbol 改写为 `default`。被否——破坏帧真实性,精确订阅与通配订阅共享 listener 语义时难区分。
- **实现**:`ExchangeSocket.key()` 不变(订阅用),`onmessage` 遍历 `listeners`,对每个 key 判断是否通配或精确匹配。

### D3: 高频数据增量更新
- `useRealSymbols`:`setByKey` 改为只写变化条目;计算 `symbols`/`priceMap` 前做脏检查,无变化返回旧引用。
- `useOrderBook`:维护 best bid/ask;`apply` 仅当 best 变化时 setState,否则保留旧引用。
- 消费组件(watchlist 行)以 `React.memo` 隔离,价格变化不触发非价格 UI 重渲染(视需要)。

- **备选**:全局引入订阅-选择器库(如 zustand + selector)。被否——当前规模小,增量引用即可满足;引入状态库属架构升级,另立 change。

### D4: 删除 TopNavbar 的功能归属
- 移除 `App.tsx` 的 `TopNavbar` 渲染与 import;删除组件文件。
- Alert/Order 弹窗:检查 `DesktopTitleBar`/`GlobalNavRail` 是否已提供入口;若已提供,直接收敛;若未提供,将 Alert/Order 入口挂到 `GlobalNavRail` 或标题栏(避免功能丢失)。
- 主题切换:`GlobalNavRail` 已接收 `onToggleTheme`,删除顶栏后仍可用。

## Risks / Trade-offs

- [周期刷新增加 REST 调用] → 5s 一次、单 category 一次全市场请求,与启动 seed 相同成本,可接受;失败静默(现有 try/except)。
- [通配 ticker 帧量大] → 每 5s 一次全市场 update,而非 Bitget 原始高频;前端有 rAF 合并兜底。
- [删除 TopNavbar 后 Alert/Order 入口丢失] → D4 明确迁移到常驻 UI;实现时先确认 `DesktopTitleBar`/`GlobalNavRail` 现有能力。
- [增量更新引入脏检查复杂度] → 以"引用相等"为判据,逻辑集中、可测;若回归全量更新,风险可控。
- [books best 未变不 setState] → 视觉上盘口中间价不变,深度变化仍应更新;实现时以"best 或任一可见档位变化"触发,避免过度跳过。

## Migration Plan

1. 后端:周期刷新 + emit 增量;跑 `test_streamhub.py`/`test_webapi.py`。
2. 前端 `useExchangeSocket`:通配投递;补测试。
3. 前端 `useRealSymbols`/`useOrderBook`:增量更新;补测试。
4. 删除 `TopNavbar`:迁移 Alert/Order 入口;前端 tsc + vitest。
5. 联调:watchlist/screener 价格随周期刷新实时变化;books/trade 保持增量;整体操作流畅度提升。
6. 回滚:各文件单 commit;前端无协议破坏(通配 ticker 后端新增帧,旧前端忽略未知 symbol 或按需兼容)。

## Open Questions

- 周期刷新间隔 5s 是否合适?(Bitget ticker REST 调用频率限制与 UI 实时性平衡;若更实时需走 WS 逐 symbol 订阅)
- `DesktopTitleBar`/`GlobalNavRail` 现有 Alert/Order 入口确认后再定迁移细节。
