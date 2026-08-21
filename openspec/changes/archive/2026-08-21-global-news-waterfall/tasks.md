## 1. 后端:顺序、快照封顶与分页

- [x] 1.1 `news_broker.py`:新增 `SNAPSHOT_MAX_ITEMS`(默认 100)常量;`recent()` 支持 `offset`/`limit`/newest-first 顺序(或新增分页方法)
- [x] 1.2 `webapi.py`:新增 `GET /news/history?offset=&limit=&category=`(返回 `{items, total}`,越界返回空列表而非报错);`/news/stream` `snapshot` 仅回放最新 100 条且最新在前
- [x] 1.3 后端测试(`test_news_broker.py`/`test_webapi.py`):快照封顶与最新在前顺序、分页翻页/分类过滤/越界/`total`、`/news/context` 行为不变

## 2. 前端:数据层改造

- [x] 2.1 `api/client.ts` 新增 `newsHistory(offset, limit, category)`
- [x] 2.2 `lib/globalNews.ts`:`_items` 改为最新在前(快照 reverse + live 置顶插入);新增 `pending` 暂存队列(计数 + flush 语义);新增 `NEWS_WINDOW_SIZE` 窗口切片与 `fetchNewsHistory` 接线;`allSourcesUnavailable`/`formatNewsTime` 保持
- [x] 2.3 `lib/globalNews.test.ts` 增补:快照逆序、live 置顶、暂存队列计数/flush、窗口切片、历史分页请求

## 3. 前端:瀑布流 hook

- [x] 3.1 新建 `lib/useMasonry.ts`:列分配(估算高度塞最短列)、`ResizeObserver` 真实量高、阈值迁移、列高维护、锚点 id 记录
- [x] 3.2 新建 `lib/useMasonry.test.ts`:初始分布、实测校正、迁移阈值边界、实时插入到最短列

## 4. 前端:面板重做

- [x] 4.1 `GlobalNewsFeed.tsx`:改为瀑布流渲染 + 完整内容竖型卡片(去 `line-clamp-4`)+ 最新置顶锚定 + 「N条新快讯」胶囊 + IO 哨兵/「加载更早」按钮 + 「已加载全部」态;移除 auto-scroll 开关与嵌套 `62vh` 滚动盒
- [x] 4.2 `i18n.ts` 新增文案(「N 条新快讯」「加载更早」「已加载全部」等)
- [x] 4.3 `GlobalNewsFeed.test.tsx` 重写:瀑布流渲染、完整正文、胶囊计数与点击回顶、锚定补偿、窗口放行、兜底按钮;`NewsCalendarView.test.tsx` 第三 segment 回归不受影响

## 5. 验证

- [x] 5.1 运行 `cd backend && python -m pytest -q` 全量回归通过
- [x] 5.2 运行 `cd frontend && npm run test && npm run typecheck` 通过
- [x] 5.3 手动冒烟(真实 uvicorn):snapshot ≤100 且最新在前、`/news/history` 翻页、瀑布流滚动加载更早、胶囊暂存与锚定无跳动、`/news/context` 不变
