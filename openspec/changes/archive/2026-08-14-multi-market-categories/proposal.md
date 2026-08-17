## Why

当前交易终端仅接入 Bitget 的 USDT 永续合约（`USDT-FUTURES`）单产品线，市场列表只能显示 748 个合约，K 线图内置搜索只返回 3 个硬编码币种（`FIXED_SYMBOLS`），无法搜索真实市场。而 Bitget 实际支持全产品线：现货（SPOT）、现货杠杆（MARGIN）、U 本位（USDT-FUTURES）、USDC 合约（USDC-FUTURES）、币本位（COIN-FUTURES），且每个品类内含 `symbolType` 分类（crypto 加密货币 / metal 贵金属 / stock 股票·Reality 代币 / commodity 大宗）与 `isRwa`/`isReality` 标记。用户要求展示 Bitget 支持的所有产品。此外界面字体尚未完全统一（klinecharts-pro 工具条使用自身字体）。

## What Changes

- 后端行情中枢升级为多品类：`MarketStream` 按 `category` 维护独立的 ticker/books/trades/funding/mark-price/instruments 镜像，支持 SPOT、USDT-FUTURES、USDC-FUTURES、COIN-FUTURES、MARGIN。
- REST 端点增加 category 维度：`/tickers`、`/instruments` 支持 `?category=` 过滤；`/books/{symbol}`、`/trades/{symbol}` 支持 `{category}/{symbol}` 路径。
- K 线搜索打通：`BitgetDatafeed.searchSymbols` 改为从后端 `/instruments`（全产品线）动态检索，支持按 `symbol`/`symbolType`/`category` 过滤，移除硬编码 `FIXED_SYMBOLS` 依赖。
- 市场列表支持按产品线 Tab 切换（现货/合约/贵金属/股票指数等），数据按 `category` 拉取与实时刷新。
- K 线图跨品类加载：切换 symbol 时正确携带 `category` 请求 K 线、订单簿、成交与资金费率。
- 统一界面字体：覆盖 klinecharts-pro 工具条（周期条/指标/弹窗/搜索）字体为全局无衬线栈。
- **BREAKING**: `/tickers`、`/instruments` 响应可能随 category 参数变化；`/books/{symbol}`、`/trades/{symbol}` 路径新增 category 段。

## Capabilities

### New Capabilities

- `multi-market-hub`: 后端多品类行情中枢，按 category 独立维护实时镜像与 REST 快照，覆盖 Bitget 全部产品线。
- `market-symbol-search`: K 线图与市场列表的统一符号检索，基于全产品线 instruments 动态搜索与过滤。

### Modified Capabilities

- `exchange-data-hub`: 行情镜像由单品类升级为多品类（category 维度），WS 订阅与 REST 快照按品类隔离。
- `exchange-terminal-ui`: 市场列表按产品线 Tab 分类展示，symbol 切换跨品类联动图表/订单簿/成交。
- `design-system`: 界面字体统一，含 klinecharts-pro 图表工具条字体覆盖。

## Impact

- 后端：`streamhub.py`（MarketStream 多 category 化）、`webapi.py`（REST category 参数与路径）、`config.py`（categories 配置）、`realtime.py`（candle 流跨品类订阅）。
- 前端：`datafeed.ts`（searchSymbols 动态化）、`useTickerList.ts`（category tab）、`App.tsx`（面板联动）、`MarketList.tsx`（tab 渲染）、`index.css`/`tailwind.config.js`（字体覆盖）。
- 测试：后端 streamhub/webapi 多品类测试；前端 datafeed 搜索、MarketList tab 测试。
- 无新增第三方依赖（REST/WS 均基于既有 httpx/websockets）。
