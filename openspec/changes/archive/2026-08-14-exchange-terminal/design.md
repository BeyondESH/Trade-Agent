## Context

现有前端仅提供 K 线图表 + AI 分析面板；后端已有 `realtime.py`（Bitget 公共 WS，仅订阅 `candle` 频道 → 内存 buffer → `/ws` 定时快照）与 `webapi.py`（FastAPI 路由）。产品方向：复刻欧易（OKX）终端布局 + Bitget 数据源，为后续 Web3 / AI 模块打数据面与交互底座。Bitget 公共 WS 频道已验证齐全（ticker/books/trade/mark-price/funding-time），且支持 `ticker` instId:default 一次订阅全量。

设计原则：与现有 `realtime.py` 的 K 线管道并存互不干扰；hub 层独立可测；协议向真实交易所对齐以便未来平移。

## Goals / Non-Goals

**Goals:**
- 后端：多频道实时行情 Hub（ticker/books/trade/mark-price/funding），内存镜像 + refcount 订阅管理 + REST 快照端点 + 类交易所 WS 订阅协议。
- 前端：OKX 风格终端（无交易），含行情条、全量市场列表、订单簿、成交 tape、资金费率/标记价、底部 AI 占位。
- 保留现有 klinecharts-pro 图表与 K 线数据流（`/candles`、`/candles/recent`、`/ws` K 线快照）。
- Hub 层以单测覆盖（mock Bitget WS 帧）；前端订阅 hook 与组件测试。

**Non-Goals:**
- 不做交易功能（下单/持仓/委托管理 UI 不在本期）。
- 不接 Web3。
- 底部 AI 分析模块本期仅占位，不实现分析逻辑。
- 不做多语言/i18n。

## Decisions

### D1: hub 层独立模块 `streamhub.py`

新建 `streamhub.py`（若行数膨胀则拆 `hubs/` 子包），每个 Hub 一个类：
- `TickerHub`：维护 `{symbol: ticker}` 全量镜像。**实测约束：Bitget v2 公有 WS 的 `ticker` 频道不支持 `instId:default`（仅私有频道支持），且无独立 mark-price/funding-time 频道**——因此全量镜像由 REST `/api/v2/mix/market/tickers?productType=...`（约 748 合约）seed，WS ticker 按具体 symbol 订阅做增量；mark price / funding rate 内嵌在 ticker 帧（`markPrice`/`fundingRate`/`nextFundingTime` 字段），逻辑 channel `mark-price`/`funding-time` 经别名映射到 ticker 订阅并从帧提取转发。
- `DepthHub`：按 symbol 维护全深订单簿合并器（snapshot 重建 / update 合并 / size="0" 删档 / seq 断裂重拉快照）。
- `TradeHub`：按 symbol 维护最近 N 笔成交环形缓冲（默认 200）。
- `DerivativeHub`：`mark-price` + `funding-time` 镜像（由 ticker 帧填充）。
- 通用 `RefCountSubscription`：管理对 Bitget 的按 symbol 订阅/退订引用计数。

理由：`realtime.py` 现有 200 行，扩展 5 频道会使其失控；独立 hub 便于 mock 测试与单测。备选：直接在 `realtime.py` 加类——否决（耦合单测困难）。

### D2: Bitget 连接复用 vs 每频道独立连接

复用现有 `BitgetWsStream` 的连接框架，扩展为多频道订阅：保留现有 candle 管道，新增频道通过同一 `_run_loop` 连接，按 refcount 动态 subscribe/unsubscribe。
理由：Bitget WS 单连接支持多频道，且 4096 字节消息上限已由现有分块逻辑处理。备选：每频道独立连接——否决（浪费连接、心跳/重连逻辑重复）。

### D3: 类交易所 WS 订阅协议

前端 `/ws` 重构为订阅协议：
- 入站：`{"op":"subscribe","args":[{"channel":"tickers"},{"channel":"books","symbol":"BTCUSDT"}]}` / `unsubscribe` / `pong`。
- 出站：`{"channel":..,"symbol":..,"action":"snapshot|update","data":..}`，快照优先、后续增量；心跳 `ping` 由服务端发起。
- 旧 K 线快照降级为其中一种 channel（如 `channel:"candle"` + symbol/timeframe），`connectSnapshot` 前端调用方改走订阅。
理由：协议向 Bitget/OKX 对齐，未来接真实交易所时前端可平移；增量推送替代轮询减少延迟与带宽。备选：每条 channel 独立 WS 端点——否决（连接数多、协议割裂）。

### D4: REST 快照端点与 Bitget REST 回源

`/tickers`、`/funding`、`/mark-price`、`/instruments` 由内存镜像直接应答；`/tickers` 与 `/instruments` 启动时经 Bitget REST（`/api/v2/mix/market/tickers`、`/api/v2/mix/market/contracts`，参数为 `productType`）拉取全量快照缓存；`/books/{symbol}`、`/trades/{symbol}` 未订阅时返回空结构。
理由：前端初次加载需要全量快照，纯 WS 逐条到达体验差。备选：前端逐条自行累积——否决（初次加载慢、逻辑重复）。

### D5: 前端订阅 Hooks 层

新增 `hooks/useExchangeSocket.ts` 管理单条 WS 连接与订阅/退订、重连、消息分派；派生 hooks：
- `useTickerList()`：全量行情列表 + 排序/搜索状态。
- `useOrderBook(symbol)`：快照 + 增量合并 → 买卖档列表。
- `useTrades(symbol)`：快照 + 增量 → 最近 N 笔。
- `useDerivative(symbol)`：资金费率/标记价。
所有 hook 共享连接、自动 refcount（同一 symbol 多次订阅只发一次 subscribe）。
理由：与现有 `connectSnapshot` 单函数风格一致但需管理多 channel 状态；hook 化便于组件复用。备选：全局 store（zustand）——本阶段 hook + React state 足够，zustand 待 AI 模块引入时再评估。

### D6: 市场列表虚拟滚动

引入 `@tanstack/react-virtual`（React 生态、与现有栈一致）渲染全量合约列表；行组件 memo 化；排序在前端内存完成（合约数百个，规模可控）。
理由：全量 USDT-FUTURES 合约数百行，虚拟滚动保流畅。备选：后端分页——否决（排序/搜索交互与分页耦合，体验差）。

### D7: 布局与组件树

- `App.tsx` 重构为网格布局：顶部导航 + 行情条 / 左列表 / 中图表 / 右订单簿+成交 / 底部 AI 占位。
- 新增 `components/market/`（TickerBar、MarketList、MarketRow）、`components/orderbook/`（OrderBook、TradesTape）、`components/derivative/`（FundingRate、MarkPrice）。
- 现有 `KLineChartProView`、`AutoLayerController` 保留；`AnalysisPanel` 移入底部占位容器。
- 设计 tokens 沿用现有 design-system（深色、红绿涨跌）。

## Risks / Trade-offs

- **[Bitget WS 频道能力与文档假设不符]** → 实测校准：ticker 不支持 `default` 通配（改 REST seed + 按 symbol 增量）、无独立 mark/funding 频道（改 ticker 帧别名映射）；单测覆盖映射逻辑，端到端验证真实数据流。
- **[books 增量乱序/丢包]** → 用 seq/pseq 检测断裂，触发重拉快照并广播新 snapshot；前端以 action 字段区分重放。
- **[全量 ticker 推送量大]** → REST seed 全量镜像，WS 仅增量变更项；前端仅更新变化行。
- **[协议变更破坏现有前端]** → `/ws` 重构与前端 hooks 同步提交；`connectSnapshot` 迁移至订阅协议（本 change 内完成，不留双协议）。
- **[Bitget WS 稳定/频率变化]** → 复用现有重连/心跳框架；books 150ms 推送频率为默认，不做节流假设。
- **[Hub 内存增长]** → 订单簿与成交缓冲设上限（全深档位 cap、成交环形缓冲 N=200），全量 ticker 按 symbol 固定大小。

## Migration Plan

1. 后端 `streamhub.py` 单测先行（mock Bitget WS 帧验证 snapshot/update/删档/重拉）。
2. 后端 WS 订阅协议 + REST 端点接入 `webapi.py`；旧 `/ws` 定时快照切换为订阅协议（保留 candle channel 语义）。
3. 前端 `hooks/useExchangeSocket.ts` + 派生 hooks；`connectSnapshot` 迁移。
4. 前端组件树重构（行情条/市场列表/订单簿/成交/资金费率）→ 布局拼装 → 联调。
5. 全量回归：typecheck + build + 组件测试 + 无头浏览器验证实时联动。
6. 归档 change、同步 specs。

回滚：本 change 单 commit；回退即 revert 到上一基线，前后端同时回退。

## Open Questions

- 全量合约范围：仅 USDT-FUTURES 还是含 SPOT？默认 USDT-FUTURES，列表 Tab 预留扩展。
- 订单簿默认深度档位上限（全深 Bitget 可达百级，前端默认展示档数）。
- 行情条展示多少 symbol（全量滚动 vs 头部 N 个）。
