---
type: "Fragment"
id: backend/src/news
title: "资讯管线与 BlockBeats 代理"
description: "7x24 快讯如何被归一化分类并推给前端？BlockBeats 日更数据为什么要落盘缓存、密钥为什么不能进浏览器？"
parent: /backend/src/_overview.md
fragment: news
entity_names:
  constants:
    - name: BEIJING
      value: "UTC+8（东财/新浪/同花顺/财联社公布的是北京时间）"
      source: backend/src/market_data/newsfeed.py
    - name: CATEGORY_RULES / 分类全集
      value: "有序：crypto, macro, policy, a-share, global-market, industry, company；未命中归 other"
      source: backend/src/market_data/newsfeed.py
    - name: item id 生成
      value: "sha1(source + content) 前 16 位（内容稳定 id，可跨轮询对齐）"
      source: backend/src/market_data/newsfeed.py
    - name: MD_NEWS_POLL_SECONDS / MD_NEWS_BUFFER_SIZE
      value: "60 / 500"
      source: backend/src/market_data/config.py
    - name: HEARTBEAT_SECONDS / MAX_BACKOFF_MULTIPLIER / SNAPSHOT_MAX_ITEMS
      value: "15.0 / 5 / 100"
      source: backend/src/market_data/news_broker.py
    - name: BB_API_KEY 取值链
      value: "别名 BB_API_KEY / MD_BB_API_KEY，默认空串"
      source: backend/src/market_data/config.py
    - name: blockbeats_refresh_hour / minute
      value: "12 / 0（每日中午全量刷新）"
      source: backend/src/market_data/config.py
    - name: NEWSFLASH_TYPES
      value: "all + 10 个公共栏目（24h, important, original, first, onchain, financing, prediction, ai, stock）"
      source: backend/src/market_data/blockbeats.py
    - name: DATA_ENDPOINTS
      value: "11 个：btc_etf, daily_tx, ibit_fbtc, stablecoin_marketcap, compliant_total, us10y, dxy, bitfinex_long, contract, bottom_top_indicator, top10_netflow"
      source: backend/src/market_data/blockbeats.py
    - name: NETWORK_END_POINTS / TYPE_END_POINTS / DEFAULT_TYPE
      value: "(top10_netflow) / (us10y, dxy) / 1M"
      source: backend/src/market_data/blockbeats_cache.py
    - name: NETFLOW_NETWORKS
      value: "solana, ethereum, base, bsc, arbitrum, ton（预缓存网络集合）"
      source: backend/src/market_data/blockbeats_cache.py
retrieval_hints:
  - "资讯刷新很慢或整站卡住，是怎么防的？"
  - "为什么某条新闻重复出现却不该被后端删掉？"
  - "新接一个中文快讯来源要改哪里？"
  - "BlockBeats 的 ETF/链上数据为什么有时效性却还能秒回？"
  - "⚠️ 如果你找的是 K 线的实时推送或交易所行情镜像，不在这里，在 `src_realtime.md`"
  - "⚠️ 如果你在找「新闻区块的 UI 渲染（分类 chips、无限滚动）」，不在这里，在 `frontend/src`"
  - "本模块也叫『快讯 / 全球新闻 / 资讯源 / BlockBeats』"
  - "架构归属：新来源 MUST 以 `newsfeed` 里的源适配器注册（并给稳定 `source` 字面量，id 由 `source+content` 哈希派生）；新 BlockBeats 端点 MUST 进 `DATA_ENDPOINTS` 与参数分类表"
architectural_role: "外部资讯通道（AKShare 免密钥 + BlockBeats 带密钥），给 Agent 与图表侧栏提供可读上下文，不落 Parquet"
---

## 业务意图

本层解决的业务问题是：**让「消息面」以零成本、零密钥、可中文阅读的方式持续进入系统与 Agent 上下文，同时不因为第三方接口慢或挂而拖垮主链路**。交易决策需要 crypto/macro 语义上下文，而可用的免费源（AKShare 聚合的东财、新浪、同花顺、财联社 7x24 快讯）本身是同步、慢（单次 2~6 秒）且无稳定 schema 的；BlockBeats 数据接口需要 api-key 且只提供日频快照。本层因此把三条要求钉死：拉取必须在独立线程（绝不进事件循环）、条目必须有稳定 id（跨轮询对齐、由前端去重）、密钥与服务端参数必须留在后端（可落盘缓存）。

## 对外接口（HTTP 契约细节见 `src_api_stores.md`）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `fetch_source(source, ak)` → `list[dict]` | 拉取 | 固定条目结构 `{id,source,title,content,url,ts,category}` | 归一化一个来源的原始 DataFrame；`ts` 必为 epoch 秒 | `newsfeed.py` |
| `fetch_all(ak=None)` | 拉取 | 返回 `(items_by_source, errors)` | **串行**遍历四个来源，失败源置空列表并记错且不中断其余源 | `newsfeed.py:fetch_all` |
| `classify(text)` → 有序首个命中 | 分类 | 首个命中即返回 | topic 单分类，未命中归 `other` | `newsfeed.py:classify` |
| `NewsBroker.start/stop/poll_once` | 生命周期 | 守护线程 `news-poller` | 轮询 + 环形缓冲 + 逐源退避 | `news_broker.py` |
| `subscribe(queue)` / `unsubscribe(queue)` | 分发 | 订阅者**自建** `asyncio.Queue` 并注册 | 新订阅者先收 `snapshot` replay，后续收 `item` 增量帧 | `news_broker.py:subscribe` |
| `sse_frame(event, data)` | 协议 | 事件名只有 `snapshot` / `item` | 输出 `event: <name>` + `data: <json>` 两行帧 | `news_broker.py:sse_frame` |
| `recent(hours,categories)` / `page(offset,limit,categories)` / `snapshot(max_items)` / `health()` | 读历史 | 均按 `ts` **降序**返回（新→旧） | `/news/context`（recent）与 `/news/history`（page，`limit` 夹在 `1..200`）的分页语义 | `news_broker.py` |
| `blockbeats.fetch_newsflash(type_, page, size, lang)` / `fetch_data(endpoint, **params)` | 上游代理 | 未支持取值/端点抛 `ValueError` → 接口层 400；`type_="all"` 走基路径 `/v1/newsflash` | 带 `api-key` 头的转发（`BASE_URL`，超时 `DEFAULT_TIMEOUT=15.0`） | `blockbeats.py` |
| `blockbeats_cache.refresh_all() / load_cache(ep,network,type) / save_cache() / has_cache()` | 缓存 | `refresh_all` 返 `{cache_key:"ok"\|"error"}`；文件内容 `{"fetched_at","data"}` | 日频快照落盘并按参数组合分文件；`_write_for` 写入用 `tempfile.mkstemp` + `os.replace` **原子替换** | `blockbeats_cache.py` |
| `import_akshare()` | 懒加载 | 仅在 `NewsBroker._default_fetcher` 首次调用 | 未安装时 `ModuleNotFoundError` → 记日志并**退出轮询线程**，不阻断后端启动 | `newsfeed.py:import_akshare` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `config.py` | 参数集中在 `Settings`（默认轮询间隔与缓冲大小 500、`blockbeats_refresh_hour/minute`（默认 12 / 0）、`bb_api_key`），前端不可见 | `get_settings().news_poll_seconds`、`bb_api_key` | extracted |
| 外部：PyPI 包 `akshare` | 四个免费快讯源；**懒加载**，未安装时仅影响本功能（记日志），不断后端启动 | `newsfeed.import_akshare()` | extracted |
| 外部：BlockBeats API | `BASE_URL=https://api-pro.theblockbeats.info`，需 `api-key` 头；11 个数据端点 + `all` 及 10 个快讯栏目 | `blockbeats._get(path, params)` | extracted |
| 第三方 `httpx` | `GET {BASE_URL}{path}?{params}`（`timeout=15.0`）；`status!=0` 抛 `RuntimeError("blockbeats error status=… message=…")`，`_get` 另对 `msg`/`message` 做回退 | `blockbeats._get()` | extracted |
| `src_agent_orchestration`（`agent.py`/`orchestration.py`） | Agent 上下文里的新闻摘要 | `build_agent_context(..., news)` | extracted |
| 缓存目录 `data_dir/blockbeats_cache/` | 持久化，不参与 Parquet | `Settings.blockbeats_cache_dir` | extracted |

**反向（谁用本层）**：`webapi` 的 `/news/categories`、`/news/context`、`/news/history`、`/news/health`、`/news/stream` 与 `/blockbeats/newsflash/{type_}`、`/blockbeats/data/{endpoint}`、`/blockbeats/data/refresh`（**不存在** `/news/recent` 端点；`/news/context` 才是 Agent 侧读取口）；`webapi` lifespan 启动 `NewsBroker`，并对 BlockBeats 缓存做「仅首次无缓存时预热 + 每日 cron 全量刷新（`max_instances=1, coalesce=True`）」；Agent（`orchestration`）通过 `build_agent_context` 取新闻。**注**：Agent 取新闻走 `NewsBroker.recent()`（进程内直接调用），**不经 HTTP 回路**。

## 典型调用链

```
uvicorn lifespan → news_broker.start()   ← 本模块（守护线程 `news-poller`）
  → 每 MD_NEWS_POLL_SECONDS（默认 60）一轮 poll_once：
      for source ∈ {em, sina, ths, cls}:
        if now < skip[source] → 本轮跳过（该源正在退避）
        fetch_source(source, ak);  ak = import_akshare()（首次调用时懒加载）
        → 失败：failures+=1 → skip[source] = now + poll * min(2**(failures-1), MAX_BACKOFF_MULTIPLIER=5)
        → 成功：failures 归零、last_ts 更新；条目 append 入环形缓冲（deque maxlen = MD_NEWS_BUFFER_SIZE=500）
  → _publish(new_items)：逐订阅者 loop.call_soon_threadsafe(queue.put_nowait, item)
     （loop 已关闭 → 只记日志不抛；stop() 用 `_wake(None)` 哨兵唤醒生成器退出）
GET /api/news/stream（接口层生成器，text/event-stream + `X-Accel-Buffering: no`）
  → subscribe(queue) → 先 sse_frame("snapshot", {items(≤ SNAPSHOT_MAX_ITEMS=100), total, sources})
  → 循环 sse_frame("item", item)；wait_for(…, HEARTBEAT_SECONDS=15) 超时则发注释帧 `: ping`
  → finally: unsubscribe(queue)
GET /api/news/context(hours, category) → NewsBroker.recent(...) → 归一条目（含稳定 id、category）
GET /api/news/history(offset, limit)   → NewsBroker.page(...)（limit 夹在 1..200，返回 items+total）
BlockBeats 日更数据
  首次无缓存预热 refresh_all / cron(默认 12:00) refresh_all / POST /api/blockbeats/data/refresh
  → 逐端点×参数组合 _write_for()（异常逐端点隔离：单个失败不阻断整轮，结果记为 "ok"/"error"）
  → 缓存文件 data/blockbeats_cache/<endpoint>[.<network|type>].json（内容 {fetched_at, data}）
  → GET /api/blockbeats/data/{endpoint}：命中则 {from_cache:true, fetched_at} 直返；
     未命中才实时代理（**只转发调用方显式给的参数、不填默认、也不回写缓存**）
```

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| 条目契约键 | `id, source, title, content, url, ts, category` | `newsfeed.py` | 7 键契约：`ts`=epoch 秒、`source` ∈ {`em`,`sina`,`ths`,`cls`}、`category` 由 `classify` 给出 | 字段与来源枚举见 `newsfeed.py` 定义；「归一化条目结构」见 `openspec/specs/news-infinite-scroll/spec.md` 的归一化描述 |
| `CATEGORY_RULES` 顺序 | `crypto → macro → policy → a-share → global-market → industry → company` | `newsfeed.py` | 有序规则、首个命中即返回；`/news/categories` 直接暴露该顺序 | 由 `classify` + 路由实现（顺序即优先级） |
| `BEIJING` | `timezone(timedelta(hours=8))` | `newsfeed.py` | 所有中文源以北京时间发布，转 UTC 秒前 MUST 带 tz | `→ openspec/specs/global-news-pipeline/spec.md` |
| `HEARTBEAT_SECONDS` | `15.0` | `news_broker.py` | 每 15s `: ping` 注释帧，代理不断链 | 同上 |
| `DEFAULT_TYPE` / `NETWORK_END_POINTS` / `TYPE_END_POINTS` / `NO_PARAM_END_POINTS` / `NETFLOW_NETWORKS` | 见 frontmatter | `blockbeats_cache.py` | 缓存文件名由端点 + 参数组合派生 | `openspec/specs/blockbeats-data-cache/spec.md` |

### 必须包含的协议字段 / 行为

| 项 | 说明 |
|---|---|
| SSE 帧字段 | `sse_frame(event, data)` 输出 `event: <name>` + `data: <json>` 并以空行结束；**只有两种事件：`snapshot = {items, total, sources}` 与 `item = <条目对象>`**；本通道**无 `error` 事件**，空闲以注释帧 `: ping` 保活 |
| `/news/stream` 收尾 | 生成器 `finally` MUST `unsubscribe(queue)`（`stop()` 另用 `None` 哨兵唤醒），否则断开的订阅者队列永远堆积在 `_publish` 扇出列表里 |
| 线程→循环桥接 | 只能用 `call_soon_threadsafe`（同 `mcp_client.py` 约定），禁止在轮询线程里碰 asyncio 对象 |
| 代理透传语义 | `network`（用于 `top10_netflow`）、`type`（用于 `us10y`/`dxy`）仅在调用方显式提供时才转发，MUST NOT 自行填默认值（缓存路径的 `DEFAULT_TYPE="1M"` 仅用于预缓存文件名） |

### 设计决策与禁忌

- **分类只按「首个命中」定一个 topic**（多标签会撑爆 chips 顺序与 `format_news_digest` 预算）；`/news/categories` 直接暴露 `CATEGORY_RULES` 顺序，前端按序渲染 chips，MUST NOT 在前端硬编码分类表。
- **缓存按参数组合分文件；缓存文件结构为 `{"fetched_at", "data"}`；原子写入用 `tempfile.mkstemp` + `os.replace`（避免半写文件被并发读到）。
- **缓存新鲜度完全由「每日 cron 全量刷新 + 首次无缓存预热」保证**：`load_cache` **MUST NOT 判过期、也不回源**（命中即返）；实时代理路径**也不回写缓存**。代理响应的 `fetched_at` 只在命中缓存时非空，供前端展示数据时鲜。缓存目录与刷新时刻均为配置项（`MD_DATA_DIR` 下的 `blockbeats_cache/`、`blockbeats_refresh_hour/minute`，默认 12 / 0），不写死在代理路径中。 （来源: `openspec/specs/blockbeats-data-cache/spec.md`「按日缓存 + 中午刷新」）
- **`snapshot` / `page` 均按 `ts` 降序重排**（各源自身返回顺序不保证时序，入缓顺序也不及时序）。
- ❌ **禁止**把 `BB_API_KEY` 透传到浏览器或写进前端 store：所有 BlockBeats 请求必须经后端 `/api/blockbeats/*` 代理，密钥留在后端。
- ❌ 禁止在请求线程/事件循环里直接调用 AKShare（实测单源 2~6 秒，属阻塞 IO）。
- ❌ 禁止对条目内容做跨源去重（刻意设计，避免误删快讯重复报道）；去重依赖稳定 `id` 由前端/Agent 侧完成。
- ✅ 可以在 `SOURCES` 注册新来源；必须同时给 `source` 字面量并在 `_parse_ts` 里声明时区语义。
- ⚠️ 快讯源不可用（未装 akshare / 网络失败）时 `/news/*` 端点必须仍返回**结构正确且为空**的结果：`/news/context`、`/news/history` 不得因上游未就绪而抛 5xx（`fetch_all` 已把失败来源置为空列表）；不健康状态只经 `/news/health` 暴露。

## 变更风险

- 改条目结构键名（尤其 `ts` 语义或 `category` 取值集合） → 前端资讯区块、Agent 新闻摘要（`NEWS_DIGEST_CATEGORIES=("crypto","macro")`）与 `/news/categories` 顺序同时失配；表现为「分类筛选永远没有结果」。
- 在 `/blockbeats/newsflash/{type}` 或 `/blockbeats/data/{endpoint}` 新增栏目/端点时未同步 `NEWSFLASH_TYPES` / `DATA_ENDPOINTS` 与缓存参数分类表 → `blockbeats._get()`/`fetch_data()` 抛 `ValueError("Unsupported …")`，接口层返 400；缓存路径未注册 → 冷读上游、`fetched_at` 缺失。
- 改 `fetch_all` 的「单源失败吞掉」语义为「向上抛」→ 一个源坏掉即让整条资讯链路与 Agent 上下文停摆。
- 把 BlockBeats 代理改成前端直连或把 key 下发 → 违反密钥不外泄底线（凭据 MUST 仅从环境变量读取），并使日频数据失去缓存层保护。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **四源固定且归一化契约固定**：AKShare 的东财全球财经快讯(`stock_info_global_em`)、新浪(`stock_info_global_sina`)、同花顺(`stock_info_global_ths`)、财联社电报(`stock_telegraph_cls`)MUST 全部并存；各源列名 MUST 归一为 `{id, source, title, content, url, ts, category}`，`source` 取 `em/sina/ths/cls`，`ts` MUST 为 epoch 秒。（来源: `openspec/specs/global-news-pipeline/spec.md`）
- **id 必须无状态可复现**：同一内容被多轮重复抓取时 `id` MUST 保持不变（由 `source + content` 哈希派生），去重不得依赖任何跨轮维护的状态集合。（来源: `openspec/specs/global-news-pipeline/spec.md`）
- **单源失败隔离**：某源请求失败或返回空数据时其余源 MUST 继续抓取与推送，失败只记日志；某源连续失败 MUST 退避（逐次翻倍、封顶 5× 轮询间隔），MUST NOT 对不可用上游热循环。（来源: `openspec/specs/global-news-pipeline/spec.md`）
- **分类语义（顺序即优先级）**：按**有序**关键词规则对「标题 + 内容合并文本」分类，**首条命中即定主题**，未命中归 `other`；`GET /news/categories` MUST 按 `crypto`/`macro`/`policy`/`a-share`/`global-market`/`industry`/`company` 的顺序暴露给前端 chips 渲染——因此调整规则顺序等价于改变分类结果，MUST NOT 随意重排。（来源: `openspec/specs/global-news-pipeline/spec.md`）
- **轮询线程的架构底线**：轮询 MUST 跑在独立于事件循环的后台线程（`MD_NEWS_POLL_SECONDS` 默认 60s），`akshare` MUST 在该线程内**懒加载**（否则拖慢 uvicorn 启动），应用关闭时 MUST 停止该线程。（来源: `openspec/specs/global-news-pipeline/spec.md`）
- **SSE 与查询端点契约**：`/news/stream` 建连时 MUST 先回 `snapshot`（仅最近 `SNAPSHOT_MAX_ITEMS`，默认 100 条，**最新在前**），随后逐条 `item`；空闲 MUST 每 15 秒发心跳注释帧；**akshare 全部源不可用时仍 MUST 允许建连并发状态帧**；`/news/context` 支持 `hours`（按 ts 时间窗）与 `category`（逗号分隔多类）过滤并返回 `{items:[…]}`，`/news/history` 支持 offset 翻页且 `limit` **缺省 100、上限 200**、越界 MUST 夹取而非报错。瀑布流两类载荷（snapshot 与 history）顺序 MUST 统一为最新在前。（来源: `openspec/specs/global-news-pipeline/spec.md`、`openspec/specs/news-infinite-scroll/spec.md`）
- **BlockBeats 代理契约**：`BB_API_KEY` 只从后端配置（`backend/.env`）读取并 MUST 永不暴露给浏览器；未配置时 MUST 返回 `400 {"detail":"BB_API_KEY is not set"}`，前端据此显示可见的配置错误而 MUST NOT 静默展示空列表。快讯分类 MUST 一一对应上游 10 个端点标识（`all`/`24h`/`important`/`original`/`first`/`onchain`/`financing`/`prediction`/`ai`/`stock`），不再使用模板原有的 Crypto/Stocks/Macro/Forex。字段映射：`content` HTML → 剥标签纯文本、`create_time` MUST 同时兼容 `"Y-m-d H:i:s"` 与 epoch 秒。（来源: `openspec/specs/blockbeats-news/spec.md`）
- **data 端点标识与参数透传（两层不要混）**：11 个标识名（`btc_etf`、`daily_tx`、`ibit_fbtc`、`stablecoin_marketcap`、`compliant_total`、`us10y`、`dxy`、`bitfinex_long`、`contract`、`bottom_top_indicator`、`top10_netflow`，已与代码 `DATA_ENDPOINTS` 逐项核对）MUST 与上游文档逐字一致，未知端点 MUST 返回 400；`network` / `type`（`1D|1W|1M`）MUST 只在调用方显式提供时才**转发给上游**，代理层 MUST NOT 自行向上游填充默认值。⚠️ 但 **缓存查找层另有一套默认**：`us10y`/`dxy` 未传 `type` 时按 `DEFAULT_TYPE`(=`1M`) 拼缓存键（只为命中预缓存的 1M 文件），这 MUST NOT 被误改为「向请求加 `type`」，否则前端数据会变成 1M 而用户以为看的是实时全量。（来源: `openspec/specs/blockbeats-data/spec.md`、`backend/src/market_data/webapi.py` 的 `blockbeats_data` 与 `blockbeats_cache.py:DEFAULT_TYPE`）
- **缓存纪律**：每日中午 12:00 全量抓取 + 后端启动时预热一次，抓取失败 MUST NOT 阻塞启动或后续调度；缓存**按端点 + 参数组合分文件**（`top10_netflow` 按 network、`us10y`/`dxy` 按 type，默认预缓存 `type=1M`），MUST 写盘持久化并记录 `fetched_at`；请求命中缓存时直接返回并带 `from_cache: true`，未命中才实时回源（带 `from_cache: false`），且 `data` 结构对前端保持不变；单端点抓取失败 MUST NOT 影响其余端点，且**旧缓存 MUST 保留、不被失败写覆盖**。（来源: `openspec/specs/blockbeats-data-cache/spec.md`、`openspec/specs/blockbeats-data/spec.md`）
- **品牌脱敏的边界（易踩坑）**：用户可见界面文本 MUST NOT 出现 "BlockBeats" 字样（新闻页标题/副标题、市场概览副标题、数据窗口标签），新闻卡片来源标签 SHALL 不再显示；但外链 `m.theblockbeats.info/flash/{id}` MUST 保留、数据层 `NewsItem.source` 字段 MUST 保持 `"BlockBeats"` 不变（既有测试与数据契约依赖它）——「去品牌」只限展示层。（来源: `openspec/specs/news-blockbeats-cleanup/spec.md`）
