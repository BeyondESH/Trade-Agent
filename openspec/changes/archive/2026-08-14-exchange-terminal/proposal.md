## Why

当前前端只有 K 线图表 + AI 分析，距"真实交易所终端"体验差距明显：无市场列表、无订单簿、无最新成交、无资金费率。产品方向定型为"复刻欧易（OKX）终端布局 + Bitget 数据源"，为后续 Web3 组件与 AI 分析模块提供贴近真实交易所的数据面与交互底座。

## What Changes

- **后端新增多频道实时数据 Hub**（`streamhub.py`）：基于现有 `BitgetWsStream` 同一管道扩展 `ticker`（instId:default 全量）、`books`（全深快照+增量）、`trade`、`mark-price`、`funding-time` 频道，维护每频道内存镜像，支持 per-symbol 引用计数订阅管理。
- **WebSocket 协议重构为类交易所订阅协议**：客户端连 `/ws` 后发 `{op:"subscribe", args:[{channel,symbol}]}`，后端回推 `{channel, symbol, action:"snapshot|update", data}`；替代现有定时轮询快照。
- **新增 REST 快照端点**：`/tickers`、`/books/{symbol}`、`/trades/{symbol}`、`/funding`、`/mark-price`、`/instruments`，供前端初次加载。
- **前端重构为 OKX 风格终端（不含交易）**：顶部导航 + 横向行情条；左侧全量市场列表（多 Tab/搜索/排序 + 虚拟滚动）；中栏图表（现有 klinecharts-pro 保留）；右栏订单簿（全深）+ 最新成交 tape + 资金费率/标记价；底部预留 AI 分析模块（本期仅占位）。
- **前端订阅 Hooks 层**：`useOrderBook`、`useTickerList`、`useTrades` 等，封装订阅协议与状态更新。
- **BREAKING**: `/ws` 协议从"定时快照"变更为"订阅协议"；前端 `connectSnapshot` 被订阅 hook 取代。
- **BREAKING**: 前端布局由"单图表 + AI 面板"重构为 OKX 终端布局。

## Capabilities

### New Capabilities
- `exchange-data-hub`: 后端多频道实时行情数据管道——ticker/books/trade/mark-price/funding 频道接入、内存镜像、refcount 订阅管理、REST 快照端点、类交易所 WS 订阅协议。
- `exchange-terminal-ui`: OKX 风格前端终端（无交易）——市场列表、行情条、订单簿、成交 tape、资金费率/标记价、AI 模块占位。

### Modified Capabilities
- `realtime-ws`: WS 端点从"定时快照推送"变更为"客户端驱动的 subscribe 订阅协议"，支持多频道增量推送。
- `chart-terminal`: 图表终端由"单图表 + 侧边面板"扩展为 OKX 风格终端整体布局，图表内核不变。

## Impact

- `backend/src/market_data/`：新增 `streamhub.py`（或 hub 子包）；`webapi.py` 仅挂载路由；`realtime.py` 保持 K 线管道不动。
- `backend/` 配置：`config.py` 增加频道列表、books/trade 缓冲大小等设置。
- `frontend/src/`：`api/ws.ts` 重构为订阅协议客户端；新增 `api/` 类型与端点封装；新增 `hooks/` 订阅层；新增 `components/market/`（市场列表）、`components/trade/`（订单簿/成交/资金费率）；`App.tsx` 布局重构；`components/ai/AnalysisPanel.tsx` 下移到底部占位。
- 依赖：前端虚拟滚动库（如 `@tanstack/react-virtual`，与 React 生态一致）；后端无新依赖。
- 测试：hub 层单测（mock Bitget WS 帧）、协议端点测试、前端订阅 hook 测试、组件渲染测试。
