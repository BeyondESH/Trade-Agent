## Why

前端重建(``frontend-tv-rebuild``)后存在四个影响使用的缺陷:(1) K 线蜡烛图首次加载后不再实时更新,右侧订单簿/成交等数据也不刷新;(2) 切换币种后图表与联动面板无法显示新 symbol 数据;(3) BlockBeats 新闻接口始终取不到数据;(4) 全界面为英文硬编码、字体不统一,不符合中文用户预期。

## What Changes

- **修复 K 线实时更新**:后端 `/ws` 的 K 线 snapshot/update 通道当前依赖 parquet 存储(`_snapshot` 先读 `_read()`),而 parquet 默认为空导致返回 `{"error":"no data"}` 且从不带 `last_candle`,前端 `bitgetWs` 因此丢弃所有更新帧。改为优先从实时流(`stream.latest()`)提供 `last_candle`,parquet 仅作历史回填。
- **修复切币种联动**:后端 `BitgetWsStream` 目前静态订阅固定 symbol×timeframe(默认仅 BTCUSDT/ETHUSDT/SOLUSDT),未配置 symbol 无任何实时数据。改为按 `/ws` 订阅动态增删 symbol 订阅,使任意 symbol 的 K 线/盘口/成交联动可用。
- **修复 BlockBeats 配置**:`BB_API_KEY` 目前直接从 `os.environ` 读取,而 pydantic `Settings` 使用 `MD_` 前缀且 `.env` 不会注入 `os.environ`,导致 key 永不生效。改为将 `BB_API_KEY` 纳入后端配置加载链,`.env` 配置即生效。
- **全界面中文 + 统一字体**:新增 i18n 字典,将模板全部 UI 文案(标题栏、导航、右侧栏、视图、弹窗等)汉化;统一全局中文字体栈(含数字等宽),替换散落的 `font-mono`/默认字体。
- **前端对象稳定性**:`MultiChartGrid` 的 `toProSymbol()` 与 `periodFromTimeframe()` 每次渲染新建对象,导致 `setSymbol`/`setPeriod` 效应反复触发、订阅抖动;改为 `useMemo` 稳定引用。

## Capabilities

### New Capabilities
- `ui-i18n-zh`: 全界面中文文案与统一字体栈,覆盖模板所有 UI 外壳组件

### Modified Capabilities
- `klinecharts-pro-chart`: K 线实时更新与切币种联动——`last_candle` 恒推送、任意 symbol 可订阅、前端 symbol/period 引用稳定
- `realtime-ws`: K 线快照/更新通道不再依赖 parquet,实时流优先;symbol 订阅支持动态增删
- `blockbeats-news`: `BB_API_KEY` 通过配置加载链读取(支持 `.env`),接口可达且错误可见
- `tv-template-shell`: UI 文案语言由英文改为中文,全局字体统一

## Impact

- `backend/src/market_data/webapi.py`:`_snapshot()` 实时优先、candle 订阅动态化
- `backend/src/market_data/realtime.py`:`BitgetWsStream` 支持运行时增删 symbol/timeframe 订阅
- `backend/src/market_data/config.py` / `blockbeats.py`:`BB_API_KEY` 纳入 Settings 加载
- `frontend/src/components/chart/MultiChartGrid.tsx`:`toProSymbol`/period 缓存稳定引用
- `frontend/src/api/bitgetWs.ts`:断线重连与订阅去抖稳定
- `frontend/src/` 全部 UI 组件:文案汉化、字体统一(新增 `lib/i18n.ts` 字典)
- 测试:`backend/tests/`(snapshot 无 parquet 兜底、动态订阅、config key)、`frontend/`(i18n 字典、订阅稳定性)
