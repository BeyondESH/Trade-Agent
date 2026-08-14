## 1. 后端 Hub 层（streamhub.py）

- [x] 1.1 实现通用 `RefCountSubscription`：按 (channel, symbol) 维护引用计数，0→1 订阅、→0 退订
- [x] 1.2 实现 `TickerHub`：订阅 `ticker` instId:default，维护全量 `{symbol: ticker}` 镜像与变更队列
- [x] 1.3 实现 `DepthHub`：snapshot 重建 / update 合并 / `size="0"` 删档 / seq 断裂触发重拉快照
- [x] 1.4 实现 `TradeHub`：最近 N 笔成交环形缓冲（默认 200）
- [x] 1.5 实现 `DerivativeHub`：`mark-price` 与 `funding-time` 镜像
- [x] 1.6 扩展 `realtime.py` 或复用其连接框架：支持多频道按 refcount 动态 subscribe/unsubscribe，保留现有 candle 管道
- [x] 1.7 Hub 层单测：mock Bitget WS 帧验证 snapshot/update/删档/重拉/refcount 升降

## 2. 后端 WS 订阅协议与 REST 端点

- [x] 2.1 `/ws` 重构为订阅协议：解析 `subscribe`/`unsubscribe` 入站帧，回推 `{channel,symbol,action:"snapshot|update",data}`，快照优先
- [x] 2.2 保留 K 线快照能力为订阅协议中一种 channel（最新 K 线/指标/S-R/组合浮盈按原间隔推送）
- [x] 2.3 实现 REST `/tickers`（内存镜像应答）
- [x] 2.4 实现 REST `/books/{symbol}` 与 `/trades/{symbol}`（未订阅返回空结构）
- [x] 2.5 实现 REST `/funding` 与 `/mark-price`（内存镜像应答）
- [x] 2.6 实现 REST `/instruments`：启动时从 Bitget contracts 接口拉取静态规格（精度/状态）并缓存
- [x] 2.7 webapi.py 仅挂路由，业务逻辑留在 hub 层；新增端点/协议测试
- [x] 2.8 断连清理：客户端断开时释放其全部订阅并递减引用计数

## 3. 前端订阅 Hooks 层

- [x] 3.1 实现 `hooks/useExchangeSocket.ts`：单 WS 连接、订阅/退订、重连、消息分派
- [x] 3.2 实现 `useTickerList()`：全量行情列表 + 排序/搜索状态
- [x] 3.3 实现 `useOrderBook(symbol)`：快照 + 增量合并 → 买卖档列表
- [x] 3.4 实现 `useTrades(symbol)`：快照 + 增量 → 最近 N 笔
- [x] 3.5 实现 `useDerivative(symbol)`：资金费率/标记价
- [x] 3.6 迁移 `connectSnapshot` 调用方至订阅协议；hooks 层测试（mock WS）

## 4. 前端组件与布局

- [x] 4.1 实现行情条 `TickerBar`（横向滚动、最新价/涨跌、红绿着色、实时更新）
- [x] 4.2 实现市场列表 `MarketList`（多 Tab/搜索/按列排序/选择联动）+ `MarketRow`（memo 化）
- [x] 4.3 引入 `@tanstack/react-virtual` 实现全量列表虚拟滚动
- [x] 4.4 实现订单簿 `OrderBook`（全深档位、买卖一高亮、按 `/instruments` 精度格式化、增量合并）
- [x] 4.5 实现最新成交流 `TradesTape`（追加、保留最近 N 笔、方向着色）
- [x] 4.6 实现资金费率与标记价格组件 `FundingRate` / `MarkPrice`
- [x] 4.7 底部 AI 分析模块占位容器（原 `AnalysisPanel` 下移，本期不实现功能）
- [x] 4.8 `App.tsx` 重构为 OKX 风格网格布局（导航/行情条/左列表/中图表/右订单簿+成交/底部占位）
- [x] 4.9 切币联动：切换 symbol 时图表、订单簿、成交、行情条、资金费率同步更新并退订旧 symbol
- [x] 4.10 组件测试（渲染/联动/排序/搜索/虚拟滚动）

## 5. 回归与验证

- [x] 5.1 `cd frontend && npx tsc --noEmit` 类型检查通过
- [x] 5.2 `cd frontend && npm run build` 生产构建通过
- [x] 5.3 后端 pytest 全量通过
- [x] 5.4 无头浏览器验证：终端渲染、实时更新、切币联动、订单簿增量
- [x] 5.5 归档 change 并同步 specs 到主 specs
