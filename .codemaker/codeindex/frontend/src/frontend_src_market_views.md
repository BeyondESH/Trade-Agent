---
type: "Fragment"
id: frontend/src/market_views
title: "市场视图与资讯流"
description: "市场概览、筛选器、热力图、社区观点、新闻与财经日历这些全屏视图的数据来自哪里？哪些是真实源、哪些是必须显式声明的静态示例？"
parent: /frontend/src/_overview.md
fragment: market_views
entity_names:
  constants:
    - name: MARKET_PULSE_ENDPOINTS
      source: frontend/src/lib/marketPulse.ts:3
      value: "11 个 BlockBeats `/api/blockbeats/data/*` 端点：btc_etf, daily_tx, ibit_fbtc, stablecoin_marketcap, compliant_total, us10y, dxy, bitfinex_long, contract, bottom_top_indicator（含网络净流入 netflow 共 11）"
    - name: NETFLOW_NETWORKS
      source: frontend/src/lib/marketPulse.ts:97
      value: "[\"solana\",\"ethereum\",\"bsc\",\"base\",\"arbitrum\",\"ton\"]（净流入可选链）"
    - name: NEWSFLASH_TYPES
      source: frontend/src/lib/newsfeed.ts:4
      value: "all / 24h / important / original / first / onchain / financing / prediction / ai / stock（key 直接进 BlockBeats 路径参数）"
    - name: NEWS_WINDOW_SIZE / REVEAL_CHUNK / HISTORY_LIMIT
      source: frontend/src/lib/globalNews.ts:8-13
      value: "100 / 100 / 100（首屏窗口化挂载卡片数 / 下拉揭示块 / 历史分页大小）"
    - name: PAGE_SIZE / SCROLL_THRESHOLD
      source: frontend/src/components/views/NewsCalendarView.tsx:16-17
      value: "20 / 120（新闻分页大小 / 距底触发加载像素）"
    - name: AT_TOP_THRESHOLD / SCROLL_ROOT_SELECTOR
      source: frontend/src/components/views/GlobalNewsFeed.tsx:21-23
      value: "24 px / \"#news-calendar-view\"（滚动到距顶 24px 内才 flush pending 快讯；SSE 快照回放去重防重复挂载）"
    - name: INITIAL_CALENDAR
      source: frontend/src/data/marketData.ts:6
      value: "静态财经日历示例条目（项目内无上游日历 API，见文件头注释「MUST NOT be presented as live data」）"
    - name: HEATMAP_CRYPTO_ASSETS / HEATMAP_STOCK_ASSETS / COMMUNITY_IDEAS_DATA / BROKERS_CATALOG
      source: frontend/src/data/marketData.ts:66 / :180 / :294 / :367
      value: "全部为文档化的静态示例数据；MUST NOT 伪装为实时数据"
retrieval_hints:
  - "市场概览顶部卡片的数字来自哪个 BlockBeats 端点？取不到数据时显示什么？"
  - "全域快讯的分页 offset 怎么算？分类 tab 下为什么会出现「已加载全部」的误判？"
  - "财经日历/社区观点/热力图是不是实时数据？谁规定的？"
  - "瀑布流（masonry）为什么不能改成 CSS grid？卡片重排会丢高亮？"
  - "新闻滚动到底部什么时候该停？为什么切换分类后要回到第一页？"
  - "快讯时间为什么不显示 ISO？分类 chip 能不能改成一行横向滚动？"
  - "⚠️ 找警报实体请在 `frontend/src/terminal_panels`，这里只是右栏的资讯面板。"
  - "⚠️ K 线、盘口、下单相关不在这里——`frontend/src/chart` / `frontend/src/data_access` / `frontend/src/terminal_panels`。"
  - "⚠️ BlockBeats 密钥与上游清洗在后端，不在这里——`backend/src`（`/api/blockbeats/*`、`/api/news/*`）；本模块只消费代理结果。"
  - "本模块也叫『市场页』『资讯视图』『快讯流』『全景视图』，对应需求里的「全球市场概览」「股票筛选器」「热力图」「新闻」「财经日历」。"
  - "架构归属：新增市场指标卡必须在 `lib/marketPulse.ts` 的端点表登记并走 `/api/blockbeats/data/*` 代理；MUST NOT 在前端直连 BlockBeats 或写死数值。"
architectural_role: "表现层·资讯与全景视图：真实源优先 + 静态示例显式豁免的唯一落点"
---

## 业务意图：这一层解决什么问题

这组全屏视图回答的是交易员的第二个问题——**"现在整个市场在发生什么"**（第一个问题是"我这根 K 线怎么样"，那是图表层）。它的核心业务风险不是渲染，而是**可信度**：一个用假数据冒充行情的模块会让用户在其他真数据区域也失去信任。因此本层的规则是：

1. **有真实源必须接真实源**（`/api/blockbeats/data/*`、`/api/blockbeats/newsflash/*`、`/api/news/*`、`/tickers`）；
2. **确实无源的表面必须显式声明为静态示例**（财经日历、热力图资产表、社区观点、券商目录），并在视觉上与实时区学区分；
3. **上游取不到时降级到占位/N-A，绝不回落到旧示例值**（防止旧数据被误读为新鲜行情）。

## 对外接口（消费的后端契约，全部经 `api/client.ts` 代理）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `GET /api/blockbeats/data/{endpoint}` | 前端→后端→BlockBeats | `endpoint ∈ MARKET_PULSE_ENDPOINTS`，可带 `?network=&type=` | 市场概览卡片与宏观走势的唯一来源 | `fetchMarketPulseEntry` / `useMarketOverview` |
| `GET /api/blockbeats/data/netflow?network=<链>` | 同上 | 每币净流入数组 | `parseNetflow` 归一为 `{symbol,logoUrl,priceUsd,netflow,liquidity}` | `lib/marketPulse.ts:130` |
| `GET /api/blockbeats/newsflash/{type}?page&size&lang` | 前端→后端 | `type ∈ NEWSFLASH_TYPES` | 快讯流，BlockBeats 原生 `create_time` 口径转换 | `lib/newsfeed.ts` + `NewsPanel` |
| `GET /api/news/categories` | 前端→后端 | `categories: string[]` | 主题 chips 列表与顺序均由后端决定 | `lib/globalNews.ts:29` |
| `GET /api/news/context?hours&category` | 前端→后端 | `items`,`generated_at` | 一次性取 AI 语境用的新闻集合 | `api.newsContext` |
| `GET /api/news/history?offset&limit&category` | 前端→后端 | `{items,total}` | 历史分页；`offset` 必须按**同分类**已缓存数量算 | `GlobalNewsClient.loadMore` |
| `GET /api/news/stream`（SSE） | 后端→前端 | `event: snapshot\|item`，`data:{items,sources,total}` | 实时推送；每次（重）连都重放 snapshot，需按 id 去重 | `GlobalNewsClient`（`lib/globalNews.ts:56`） |
| `useMarketOverview(network)` | hooks→视图 | `SectionState<T> = { data?: T }` | 五个区块并行取数；`loading` 只在首批后置 | `hooks/useMarketOverview.ts:287` |

> 反向：`DashboardView` 的卡片、`GlobalNavRail` 的视图项、`App` 的标签类型都会跳到本层视图；`onOpenChartWithTicker(ticker)` 是本层把用户送回图表的唯一出口（找不到 symbol 时 App 会造一个 transient symbol）。

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| `frontend/src/data_access` | REST 客户端与品类标签 | `api`、`categoryLabel` | extracted |
| `frontend/src/terminal_panels` | 右栏 `NewsPanel`/`CalendarPanel`/`HotlistsPanel` 与本层共享取数件 | `fetchNewsflash`、`useTickerList` | extracted |
| `frontend/src/app_shell` | 视图注册（tabs/promote）、i18n | `handleOpenChartWithTicker`、`t` | extracted |
| `backend/src` | BlockBeats/新闻管线的代理与密钥持有者 | `/api/blockbeats/*`、`/api/news/*` | extracted |
| `lib/useMasonry.ts` | 快讯瀑布流的列放置与迁移 | `useMasonry` `MIGRATION_THRESHOLD` | extracted |

## 典型调用链

```
MarketsView 挂载
  → useMarketOverview(network)
    → Promise.allSettled([ btc_etf, ibit_fbtc, compliant_total, bitfinex_long, bottom_top_indicator,
                           daily_tx, us10y, dxy, stablecoin_marketcap, contract ])   ← 单源失败不阻断其他卡
      → 每个端点失败 → 该 SectionState 保持无数据 → 卡片渲染 N/A（MUST NOT 回落示例值）

NewsCalendarView（#news-calendar-view 为滚动容器）
  ├─ segment: Market News Wire → NewsPanel（BlockBeats REST 分页）
  ├─ segment: Economic Calendar → INITIAL_CALENDAR 静态示例（显式标注非实时）
  └─ segment: 全域快讯 → GlobalNewsFeed
        → GlobalNewsClient.connect() → EventSource /api/news/stream
          ├─ snapshot（重连重放）→ 重建 newest-first 权威列表并重置 seen 去重
          └─ item → 只入 _pending 桶（不打断阅读）
        → 滚动到顶（≤24px）才 flushPending → 置顶插入 + useMasonry 按测量高度列内迁移
        → 滚到底 → loadMore：offset = 同分类已缓存条数 → /news/history?offset&limit=100&category
          → buffered < total ? 仍可加载 : 该分类标记"已加载全部"
```

> 图上交互（右键设警报、价格线拖动回写）的调用链属图表层，见 `frontend_src_chart.md` §典型调用链；本层只管视图与资讯流。

## 实现约束清单（逐条核对）

### A. 真实源优先（硬性）

- **[禁止静态数组冒充实时] 任何存在真实源的表面 MUST NOT 用 mock 渲染。由来：行情列表是决策输入。**（来源: openspec/ui-affordance-integrity §真实数据源优先 + openspec/bottom-dock §筛选器面板）
- **[无源表面二选一] 没有上游的表面：要么移除，要么"显式文档化的静态示例 + 视觉/文案说明"。MUST NOT 让静态与实时在视觉上不可区分。**本模块当前被豁免的静态集在 `data/marketData.ts` 顶部注释逐条写明原因：财经日历（项目无上游日历 API）、股票热力图（BlockBeats 不覆盖股票）、社区观点（无社交后端）。（来源: frontend/src/data/marketData.ts:3-5,177-179,291-293 + `BROKERS_CATALOG`(:366) 保留给将来券商账户 UI）
- **[新需求落地]** 若将来接入上游：必须整体切源，并重新核对所有 mock 豁免声明是否仍然准确。

### B. 快讯流（SSE 与分页）

- **[pending 桶不可打断阅读] 新条目先进 `_pending`，只有用户滚到顶区（≤24px）才 flush；MUST NOT 自动滚动到底部。**由来：滚动条乱跳是阅读类面板最刺眼的问题。
- **[snapshot 重建 + seen 去重] `seen` 必须随 snapshot 重建、pending 条目 id 也要进 `seen`。**由来：SSE 重连会重放，不去重会出现重复快讯（`GlobalNewsFeed.stream.test.tsx:159` 用例锁了"未加载完不得声称全部加载完毕"）。
- **[offset 维度] offset 只统计同一分类已缓存条目，`hasMore` 判断用 `buffered < result.total` 的同类比较。**由来：混用全量与分类过滤会让某分类"未加载完就显示已全部加载"。
- **`categories` 必须按后端返回顺序渲染 chips，前端 MUST NOT 排序。**由来：顺序本身是业务配置。
- **[分页语义四条件] `size` 满页 → 视为"可能还有更多"（`hasMore=true`）；某页返回 0 条 → 视为已到末尾（`hasMore=false`）；滚动到底部时 `hasMore=false` MUST NOT 再发请求；上一页仍在加载（`loading`/`loadingMore` 任一为真）时 MUST NOT 并发触发。由来：满页不等于还有更多，但空页一定没有更多——用"条数少于 size"判到顶会让列表提前停住。**（来源: openspec/specs/news-infinite-scroll/spec.md）
- **[追加按 id 去重 + 切分类重置] 新页数据按新闻 id 去重后追加；切换分类必须清空列表并重置到第一页。由来：SSE 重放与分页窗口重叠都会产生重复条目，而不同分类的 offset 互不相关。**（来源: openspec/specs/news-infinite-scroll/spec.md）
- **[失败不等于到底] `NewsCalendarView` 取下一页失败时保留当前列表并让 `hasMore` 维持真相（代码注释 `:70`：失败后 `hasMore` 保持可重试），MUST NOT 用"异常即到底"来结束滚动。**（来源: `components/views/NewsCalendarView.tsx:57-74`）
- **["已加载全部"的显示条件] 只有确认无更多（全部页已到 + pending 已计入）才允许出现 `All Loaded`。由来：`GlobalNewsFeed.stream.test.tsx:159` 专门钉住"分类缓冲 4 条 < 全量 6 条时不得声称已全部加载"——这是本面板历史上真出过的误判。**（来源: openspec/specs/news-infinite-scroll/spec.md）
- **[右栏资讯面板的呈现契约] chip 分类栏折叠态必须单行 + 末尾常驻展开/收起控件，且当前活动分类在折叠态始终可见（被裁切时要提前呈现），展开态换行平铺全部分类；分类集合固定沿用 `NEWSFLASH_TYPES`（10 项），MUST NOT 增删分类或引入新数据源。时间必须走 `formatRelativeTime` 的相对口径（刚刚 / N 分钟前 / N 小时前 / `MM-DD HH:mm`），且格式化只做在展示层——`NewsItem.time` 的 ISO 字符串契约 MUST NOT 被改写（后端排序与去重依赖它）。列表按日期分组（今天 / 昨天 / `MM-DD`），标题与摘要各最多 2 行截断，"全文"等次级操作 hover 渐显，列表本体使用主题化隐式滚动条（MUST NOT 套 `no-scrollbar`）。**（来源: openspec/specs/right-sidebar/spec.md §市场头条分类栏 / §市场头条新闻列表排版）
- **`allSourcesUnavailable(sources)`（`lib/globalNews.ts:37`，判定「所有源都失败且从未成功过」）是"降级态"的唯一入口**：上游全不可用时必须走显式降级，而不是保留过期列表。

### C. BlockBeats 指标与宏观面板

- **端点集合唯一来源是 `MARKET_PULSE_ENDPOINTS`，MUST NOT 在组件里另写端点串。**
- **us10y / dxy 必须以 `type:"1M"` 请求。**
- **数字必须用 `Number.isFinite` 校验并保留 null（0 是合法值）。**由来：与后端 `markets-overview-real-data` §区分空与未知对齐。
- **宏观折线必须从 `raw` 现场推导时间轴（MUST NOT 依赖 `series` 字段/下标猜测）。**
- **信号值大小写不敏感归一为 `'买' | '卖' | '观望' | 'N/A'`；颜色 `N/A→灰`，MUST NOT 用「无值 = 红色」表达。**（来源: openspec/markets-overview-real-data Scenario 抄底逃顶信号/指标着色）
- **涨跌幅显示必须乘 100（上游是比例字符串）；缺值用占位，禁止 `undefined%` 上屏。**
- **`contract` 端点若返回对象/数组/空列表的三种形态必须归一为固定 3 行表并给占位，字段缺失显示 `-`。**

### D. 瀑布流（masonry）

- **[MUST NOT CSS Grid 替代] `lib/useMasonry.ts` 必须保留：CSS grid 不能按真实高度最小列放置。**
- **列迁移判据是「本列高度 − 最矮列高度 > 卡片自身高度 × 阈值」，且只对已测量高度的卡生效（未测量用 `estimate`）。**由来：用"本列高出 X%"会在不同卡片高度下产生系统偏差。
- **迁移必须按 `id` 保留 DOM 身份：迁移时复用节点（MUST NOT 重建 DOM），否则重挂会重置内部测量与图片解码 → 抖动循环。**
- **`getColumnCount` 的三档断点与全局 Tailwind sm/md/lg 不一致——这是刻意按信息密度定的。**
- **列表倒序传入（最新在前）是算法前提：正序会把最新项挤到末列。**
- **窗口 resize 要重算列数，但只在结果实际变化时重建（避免抖动）。**

### E. 筛选器 / 市场列表基本面列

- **只允许使用行情 hub 已有字段**（`fundingRate`、`markPrice`、`low24h/high24h` 算振幅、`turnover24h`），MUST NOT 引入外部基本面数据源；缺字段 → 占位 `--` 并排到排序末尾。
- **筛选 tab 值必须是原始品类枚举（`CATEGORY_TABS`），显示才用中文标签——中文标签来自 `api/types.CATEGORY_LABELS`，禁止前端另造中文。**
- **点击行只允许「选品种 + 联动图表」两件事，不得再叠加其他行为**（选中态本身即行为，MUST NOT 被理解为"点击=打开下单弹窗"）。

### 设计决策

| 决策点 | 选定方案 | 替代方案 | 理由 |
|--------|---------|---------|------|
| 上游聚合位置 | 后端做代理 + 归一化，前端只读 | 前端直连第三方 | 密钥不下发、频率集中控制 |
| 无上游的表面 | 显式静态示例 + 声明 | 直接移除或留"暂无" | 保留终端布局与演示价值的同时不假装实时 |
| 并行取数 | `allSettled` | 全批 fail-fast | 上游接口经常部分失败；单卡失败不应白屏其余 |
| 快讯实时方式 | SSE 快照 + 手动刷新 + 轮询三模 | 只走 SSE | 浏览器 `EventSource` 限制下并发连接不可靠 |
| 瀑布流实现 | 受控最小列 + 迁移 + 复用节点 | CSS grid masonry | 后者无法按真实高度放置 |

## 已知限制（务必在改动前读到）

- **`MarketsView` 的市场头条区块走「SSE + 30s 兜底轮询」，当 `EventSource` 不可用 / SSE 失败时降级为每约 60s 轮询 `/api/blockbeats/newsflash/all?size=20`。** 代码事实：`/news/stream` 是 **AI 快讯管线**（AKShare 源）的流，不是 BlockBeats 的流；两个面板共享 `seen`-id 去重。改动时不要把两套源混为一谈。
- 财经日历、股票热力图、社区观点、券商目录仍是静态示例，其"是否接入真实上游"属于新需求级决策。

## 变更风险

| 改动 | 破坏的规则 | 后果 |
|---|---|---|
| 把 `REVEAL_CHUNK` 调大 | 窗口挂载规模 | 首屏渲染成本上升，滚动卡顿 |
| 把快讯改成自动滚到底 | 不打断阅读 | 用户正在读历史时"永远追不上新的" |
| 前端排序 categories | 「后端返回顺序即业务含义」 | 业务调序需重建前端才生效 |
| 给无源表面直接塞假数 | 占位符规则与 `N/A` 降级 | 用户把演示数当实时数下单 |
| 用 CSS grid/`flex-wrap` 重排快讯 | 卡片不越列 + 按真实高度迁移 | 列高失衡 + 重挂丢测量导致抖动循环 |
| 让 `parseNetflow` 直接返回上游原样 | 空/未知语义 | 0 与 N/A 混淆，资金流方向误判 |
| 把 `formatRelativeTime` 的结果写回 `NewsItem.time` | ISO 契约属于数据层 | 后端/SSE 去重与排序失效，重复快讯或乱序 |
| 用"返回条数 < size"判定到底 | 满页=可能还有、空页=到底 | 列表提前停住，用户以为新闻已加载完 |
| 把分类 chip 改成单行横向滚动堆叠 | 折叠态不占额外垂直空间 + 活动分类必须可见 | 出现横向滚动条，且选中的分类收起后"看不见自己在哪个分类" |

## 术语对照

| 需求语言 | 代码 | 位置 |
|---|---|---|
| 全球市场概览 | `MarketsView` + `useMarketOverview` | `components/views/MarketsView.tsx`、`hooks/useMarketOverview.ts` |
| 顶部指标卡 | `MARKET_PULSE_ENDPOINTS` / `fetchMarketPulse` | `lib/marketPulse.ts:3` |
| 宏观走势（美债/DXY） | `type:"1M"` 请求 + `extractSeries`/`extractTrend` | `lib/marketPulse.ts:50,63` |
| 净流入选链 | `NETFLOW_NETWORKS` / `NETFLOW_NETWORK_OPTIONS` | `lib/marketPulse.ts:97`、`hooks/useMarketOverview.ts:96` |
| 全域快讯 | `GlobalNewsFeed` + `GlobalNewsClient` | `components/views/GlobalNewsFeed.tsx`、`lib/globalNews.ts` |
| 快讯分类 chips | `fetchNewsCategories` | `lib/globalNews.ts:29` |
| 资讯/热点 | `NEWSFLASH_TYPES` + `fetchNewsflash` | `lib/newsfeed.ts:4` |
| 财经日历 | `INITIAL_CALENDAR`（静态示例） | `data/marketData.ts:6` |
| 热力图 | `HEATMAP_CRYPTO_ASSETS` / `HEATMAP_STOCK_ASSETS` | `data/marketData.ts:66,180` |
| 社区观点 | `COMMUNITY_IDEAS_DATA` | `data/marketData.ts:294` |
| 瀑布流列布局 | `useMasonry` / `MIGRATION_THRESHOLD` | `lib/useMasonry.ts` |

## 文件组成与覆盖（本子文档负责的文件）

| 组 | 文件（相对 `frontend/src/`） |
|---|---|
| 全视图 | `components/views/MarketsView.tsx`、`ScreenerView.tsx`、`HeatmapsView.tsx`、`CommunityIdeasView.tsx`、`NewsCalendarView.tsx`、`GlobalNewsFeed.tsx` |
| 右栏资讯面板 | `components/sidebar/NewsPanel.tsx`、`CalendarPanel.tsx`、`HotlistsPanel.tsx`、`CommunityIdeasPanel.tsx` |
| 取数件 | `lib/globalNews.ts`、`lib/newsfeed.ts`、`lib/marketPulse.ts`、`hooks/useMarketOverview.ts`、`lib/useMasonry.ts` |
| 静态示例 | `data/marketData.ts`（`INITIAL_CALENDAR`、`HEATMAP_CRYPTO_ASSETS`、`HEATMAP_STOCK_ASSETS`、`COMMUNITY_IDEAS_DATA`、`BROKERS_CATALOG`） |
| 测试 | `components/views/{MarketsView,ScreenerView,HeatmapsView,CommunityIdeasView,NewsCalendarView,GlobalNewsFeed,GlobalNewsFeed.stream}.test.tsx`、`components/sidebar/NewsPanel.test.tsx`、`hooks/{useMarketOverview,useTickerList,useRealSymbols}.test.ts(x)`、`lib/{globalNews,newsfeed,marketPulse,useMasonry,transform,metricCards}.test.ts` |
