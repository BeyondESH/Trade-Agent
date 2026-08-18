## Context

前端重建完成后,实时数据路径存在结构性缺陷:

- 后端 `webapi.py:_snapshot()` 先读 parquet(`_read`),parquet 为空时直接返回 `{"error":"no data"}`,从不携带 `last_candle`;而前端 `bitgetWs.onmessage` 只在存在 `last_candle` 时才更新蜡烛。首屏经 `/candles/recent`(读 `stream.recent()` 内存 buffer)能出图,之后 5s 轮询的 `/ws` candle 更新帧全部被丢弃。
- `BitgetWsStream`(realtime.py)静态订阅固定 `MD_SYMBOLS`×`MD_TIMEFRAMES`,未配置 symbol 完全无数据;而 `MarketStream`(streamhub.py)已实现按需 refcount 订阅。两套流能力不对齐。
- `BB_API_KEY` 用 `os.environ.get` 读取,但 pydantic Settings 的 `env_file=".env"` 不会注入 `os.environ`,且字段前缀为 `MD_`。即使写了 `.env` 也不生效。
- 前端模板 UI 全英文硬编码,`MultiChartGrid` 每次渲染新建 `toProSymbol`/`period` 对象,触发 `KLineChartProView` 的 `setSymbol`/`setPeriod` effect 反复执行。

## Goals / Non-Goals

**Goals:**
- `/ws` candle 通道在任何情况下都能提供 `last_candle`(实时流优先,parquet 兜底历史)。
- 任意 symbol(不限默认 3 个)可实时订阅 K 线,切币种后图表、盘口、成交联动刷新。
- `BB_API_KEY` 通过统一配置加载链生效,`.env` 配置即可,错误提示可见。
- 全界面中文文案 + 统一中文字体栈;前端 symbol/period 引用稳定,消除订阅抖动。

**Non-Goals:**
- 不改动 `MarketStream` 的 refcount 订阅机制(已满足动态订阅需求)。
- 不做完整 i18n 框架(多语言切换、动态语言包),仅内置中文固定文案字典。
- 不引入 parquet 历史数据预采集;历史缺失仍由 backfill/ingestion 负责。

## Decisions

### D1. `_snapshot()` 实时流优先,parquet 兜底
`_snapshot(category, symbol, timeframe)` 改为先取 `stream.latest()`,有 bar 则直接组装 `last_candle` + price;parquet(`_read`)仅用于历史回填/指标/支撑阻力。parquet 为空时不再返回 `{"error":"no data"}`,而是返回 `{"price":..., "last_candle": bar, "portfolio":...}`。前端 `bitgetWs` 因此持续收到有效蜡烛更新。

备选:让 candle 通道直接推 `stream.recent()` 全量——放弃了,更新帧应保持轻量,`last_candle` 增量足够且与前端 `updateData` 契约一致。

### D2. `BitgetWsStream` 动态订阅
给 `BitgetWsStream` 增加 `subscribe(category, symbol, timeframe)` / `unsubscribe(...)` 运行时接口(内部维护订阅集合,与启动时的 `_channels()` 合并);`/ws` 收到 candle 订阅时调用 `stream.subscribe`(而非只把参数塞进 `subs`),退订时对称清理。这样任意 symbol 首次订阅即被实时拉流。

备选 A:让 candle 也走 `MarketStream` 动态订阅——放弃了,`BitgetWsStream` 已带 candle 合并/upsert/重连重订阅,复用成本更低。
备选 B:前端定期轮询 `/candles/recent`——放弃了,WS 推送更实时且已有基础设施。

### D3. `BB_API_KEY` 纳入 Settings
在 `Settings` 增加字段 `bb_api_key: str = ""`(前缀 `MD_BB_API_KEY`,兼容读 `BB_API_KEY` 环境变量),`blockbeats.api_key()` 改为读 `get_settings().bb_api_key`。`.env` 中 `BB_API_KEY=` 即可生效;未配置时返回 `400 {"detail":"BB_API_KEY is not set"}`,前端 News 视图显示可见的错误提示而非静默空列表。

备选:手工 `load_dotenv()`——放弃了,统一走 Settings 更符合现有配置模式。

### D4. i18n 中文化 + 统一字体
新建 `frontend/src/lib/i18n.ts` 提供 `t(key)` 字典(纯中文文案);模板外壳组件(标题栏、GlobalNavRail、TopNavbar、DrawingToolbar、RightDock 各面板、BottomDock、各 View、各 Modal)中硬编码英文替换为 `t()` 调用。在 `index.css` 定义全局字体栈(中文 `PingFang SC`/`Microsoft YaHei` 优先 + `Inter`/等宽数字),`html/body` 统一应用;`font-mono` 数字显示保留等宽特性。

### D5. 前端 symbol/period 引用稳定
`MultiChartGrid` 用 `useMemo` 缓存 `toProSymbol(symbol)` 与 `periodFromTimeframe(timeframe)` 的结果(以 symbol.id/timeframe 为依赖),避免每次渲染新对象导致 `KLineChartProView` 的 `setSymbol`/`setPeriod` effect 反复触发。

## Risks / Trade-offs

- [D2 动态订阅使每新增 symbol 增加一条 Bitget WS 订阅,可能触及通道上限] → 复用 `RefCountSubscription` 模式按需订阅/退订,切走即释放;前端 `useCellSync` 卸载时调用 `handle.close()`。
- [D1 改动后 candle 帧始终携带 `last_candle`,静默市场可能重复推送同 bar] → 前端 `bitgetWs` 已有 `sameCandle` 去重,不变更。
- [D4 全量汉化工作量集中在文案枚举] → 逐组件替换并配字典测试;保持 key 与组件一一对应。
- [BB_API_KEY 前缀改为 `MD_BB_API_KEY` 可能与已有用户环境变量 `BB_API_KEY` 冲突] → Settings 同时接受两者(`env_prefix` 默认 + 显式 `BB_API_KEY` 兼容读取),向后兼容。

## Migration Plan

1. 后端:`_snapshot()` 实时优先 → 动态订阅 → Settings 读 key,并补 pytest。
2. 前端:数据层引用稳定(useMemo)→ i18n 字典与组件替换 → 字体栈。
3. 联调验证:首屏后蜡烛持续更新、切任意币种联动、配置 `.env` 后新闻可见、全界面中文。

Rollback:各改动相互独立,可分别 `git revert`;后端 D1/D2 为纯增量,前端 D4 仅文案不触数据路径。

## Open Questions

- 新闻视图未配置 `BB_API_KEY` 时,是显示"未配置"提示还是静默隐藏?(倾向显示提示)
- 中文字体栈是否需要对等宽数字单独指定字体?(默认 `font-variant-numeric: tabular-nums` 处理)
