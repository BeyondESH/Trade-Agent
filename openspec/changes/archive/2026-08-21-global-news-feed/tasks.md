## 1. 依赖与配置

- [x] 1.1 `backend/pyproject.toml` 新增 `akshare` 硬依赖(锁定最低版本)
- [x] 1.2 `backend/src/market_data/config.py` 新增 `news_poll_seconds`(默认 60,env `MD_NEWS_POLL_SECONDS`)与 `news_buffer_size`(默认 500,env `MD_NEWS_BUFFER_SIZE`)

## 2. 后端:newsfeed.py(抓取/归一化/分类)

- [x] 2.1 定义统一条目 schema 与 `CATEGORY_RULES` 有序关键词规则(`crypto/macro/policy/a-share/global-market/industry/company` + 回退 `other`)
- [x] 2.2 实现 `classify(text)` 单标签分类器:合并标题+内容,首条命中即定主题
- [x] 2.3 实现 4 个来源适配器(`em`/`sina`/`ths`/`cls`),各自调用对应 akshare 函数并将 DataFrame 列名归一化为条目;`ts` 统一为 epoch 秒
- [x] 2.4 实现 `build_item(source, row)` 生成稳定 `id = source + sha1(source+content)[:8]`
- [x] 2.5 实现 `fetch_all()`:顺序抓取 4 源、逐源 try/except 隔离,返回全部新条目

## 3. 后端:news_broker.py(专用线程 + 缓冲 + 发布)

- [x] 3.1 实现 `NewsBroker` 类:持有 `threading.Thread`、`threading.Lock`、`deque(maxlen=buffer_size)` 环形缓冲、订阅者 `asyncio.Queue` 集合
- [x] 3.2 实现 `start()/stop()` 线程生命周期(daemon 线程,`stop` 事件优雅退出)
- [x] 3.3 实现轮询循环:`akshare` 在线程内懒加载,每轮 `fetch_all()` 后发布新条目,按 `MD_NEWS_POLL_SECONDS` 休眠
- [x] 3.4 实现发布桥接:通过 `loop.call_soon_threadsafe(queue.put_nowait, item)` 推送给每个订阅者(mcp_client 先例)
- [x] 3.5 实现单源连续失败退避(逐次翻倍,封顶 5 倍轮询间隔)与每源健康状态记录
- [x] 3.6 暴露 `categories`(有序分类列表)与缓冲区查询接口(按 `hours`/`category` 过滤)

## 4. 后端:webapi 路由与生命周期

- [x] 4.1 `webapi.py` lifespan 中启动/停止 `NewsBroker`
- [x] 4.2 新增 `GET /news/categories`:返回有序分类列表
- [x] 4.3 新增 `GET /news/stream`(SSE):连接时发 `snapshot`(缓冲区最近条目)→ 逐条 `item` 推送 → 每 15 秒 `: ping` 心跳;akshare 不可用时仍可连接并发状态帧
- [x] 4.4 新增 `GET /news/context?hours=&category=`:从缓冲区过滤返回 `{items, generated_at}`
- [x] 4.5 新增 `GET /news/health`:每源最近抓取时间与最后错误(便于调试)

## 5. 后端测试(全离线)

- [x] 5.1 `tests/test_newsfeed.py`:monkeypatch 假 DataFrame 验证 4 源归一化、`ts` 转换、`id` 稳定性、分类命中/回退、`/news/categories` 顺序
- [x] 5.2 `tests/test_news_broker.py`:假源验证轮询发布、缓冲上限、单源失败隔离、连续失败退避、stop 优雅退出
- [x] 5.3 `tests/test_webapi.py` 增补:`/news/stream` snapshot+item 帧、心跳、`/news/context` hours/category 过滤、不可用状态帧(monkeypatch broker)

## 6. 前端:EventSource 客户端

- [x] 6.1 `types/trading.ts` 新增 `GlobalNewsItem` 类型(source/category/url/ts)与分类联合类型
- [x] 6.2 `api/client.ts` 新增 `newsCategories()` 与 `newsContext()`
- [x] 6.3 新建 `lib/globalNews.ts`:EventSource 封装(自动重连 + 按 `id` 防重放去重 + 连接状态 + snapshot/item 解析)

## 7. 前端:全域快讯面板

- [x] 7.1 新建 `GlobalNewsFeed` 组件:主题 chips(「全部」+ `/news/categories` 动态渲染,单选过滤)+ SSE 滚动列表(来源/分类徽标、标题、摘要、时间、外链)+ auto-scroll 开关 + 不可用状态提示
- [x] 7.2 `NewsCalendarView.tsx` 新增第三顶层 segment「全域快讯」,切换时渲染 `GlobalNewsFeed`;BlockBeats 数据流不改动
- [x] 7.3 `i18n.ts` 新增文案(全域快讯/来源/原文/连接中/不可用等)

## 8. 前端测试

- [x] 8.1 `lib/globalNews.test.ts`:FakeEventSource 验证 snapshot 回放、live item、重连后按 `id` 去重、连接状态(照 `ws.test.ts` FakeWebSocket 先例)
- [x] 8.2 `GlobalNewsFeed.test.tsx`:chips 渲染/单选过滤、auto-scroll 开关、不可用状态
- [x] 8.3 更新 `NewsCalendarView.test.tsx` 覆盖第三 segment 切换与 BlockBeats 不受影响

## 9. 验证

- [x] 9.1 运行 `cd backend && python -m pytest -q` 全量回归通过
- [x] 9.2 运行 `cd frontend && npm run test && npm run typecheck` 通过
- [x] 9.3 手动冒烟:启动后端 + 前端,确认全域快讯 segment 的 SSE 滚动、分类过滤、断线重连、不可用降级
