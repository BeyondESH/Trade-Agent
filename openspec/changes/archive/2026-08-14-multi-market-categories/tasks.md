## 1. 后端多品类中枢改造

- [x] 1.1 `models.py`：定义 `MARKET_CATEGORIES` 常量（SPOT/MARGIN/USDT-FUTURES/USDC-FUTURES/COIN-FUTURES）与 symbolType 常量
- [x] 1.2 `streamhub.py`：`MarketStream` 内部镜像改为 `dict[str, dict]`（key=category），`subscribe/unsubscribe` key 含 category
- [x] 1.3 `streamhub.py`：连接循环按 category 独立运行，WS `instType` 用 category；refcount 按 (category, channel, symbol)
- [x] 1.4 `streamhub.py`：REST seed 按 category 分发 URL——合约类走 `/api/v2/mix/market/*`，SPOT 走 `/api/v2/spot/market/*`；instruments 统一走 v3 `/api/v3/market/instruments`
- [x] 1.5 `streamhub.py`：instrument 归一化层（symbol/instId、pricePlace/pricePrecision、volumePlace/quantityPrecision、symbolType/isRwa/isReality）
- [x] 1.6 `config.py`：新增 `categories` 配置项（默认全部 5 类）
- [x] 1.7 `webapi.py`：`/tickers`、`/instruments` 支持 `category` 过滤（缺省返回全部合并）
- [x] 1.8 `webapi.py`：`/books/{category}/{symbol}`、`/trades/{category}/{symbol}`、`/funding`、`/mark-price` 品类寻址（保留缺省 category 回退）
- [x] 1.9 后端测试：streamhub 多品类隔离、REST category 过滤、WS 订阅帧 category 缺省回退

## 2. 前端数据层扩展

- [x] 2.1 `api/types.ts`：Ticker/Instrument 增加 `category`、`symbolType`、`isRwa`、`isReality`；新增 `MarketCategory`/`SymbolType` 类型
- [x] 2.2 `api/client.ts`：`tickers/instruments/books/trades/funding/markPrice` 支持 category 参数与品类化路径
- [x] 2.3 `datafeed.ts`：`searchSymbols` 改为基于 `api.instruments` 动态检索（TTL 缓存），移除 `FIXED_SYMBOLS` 硬编码
- [x] 2.4 `datafeed.ts`：`toSeries` 用 symbol.market 作为 category；`periodToTimeframe` 不变
- [x] 2.5 前端测试：`searchSymbols` 返回真实 instruments、按 category/symbolType 过滤

## 3. 市场列表品类 Tab

- [x] 3.1 `useTickerList`：按 category 拉取 tickers，tab 状态驱动；支持 "all" 合并视图
- [x] 3.2 `MarketList`：渲染品类 Tab（现货/合约组/杠杆）+ symbolType 二级过滤
- [x] 3.3 `MarketList`/行：按 category 与 symbolType 展示（含贵金属/股票标识）
- [x] 3.4 前端测试：Tab 切换拉取对应品类、symbolType 过滤生效

## 4. 跨品类联动与图表

- [x] 4.1 `App.tsx`：symbol state 升级为 `{ category, ticker }`；`toSymbolInfo` 用 instrument 元数据补全
- [x] 4.2 `App.tsx`：K 线请求、订单簿、成交、资金费率均携带 category
- [x] 4.3 `datafeed.ts`/`ws.ts`：订阅与快照请求带 category
- [x] 4.4 `App.test.tsx` 适配新 symbol 模型与品类 Tab

## 5. 字体统一

- [x] 5.1 `index.css`：覆盖 klinecharts-pro 工具条/弹窗字体为全局无衬线栈
- [x] 5.2 验证图表工具条字体与全局一致

## 6. 验证与收尾

- [x] 6.1 运行 `npm run typecheck`
- [x] 6.2 运行 `npm test`（vitest）
- [x] 6.3 运行 `npm run build`
- [x] 6.4 后端 pytest 通过（含多品类测试）
- [x] 6.5 手动验证：品类 Tab 切换、跨品类 K 线/订单簿联动、搜索真实币种（含贵金属/股票）、图表工具条字体一致
- [x] 6.6 归档 change 并同步 specs 到主 specs
