## Why

当前 K 线图的时间级别只有 8 个内联按钮(`1m 5m 15m 30m 1h 4h 12h 1d`),而 Bitget 实际原生支持 13 个级别——包含用户需要的秒级 `1s`、以及 `3m/2H/6H/3D/1W/1M`。缺失的级别中,周线/月线尤其影响长周期趋势判断。

同时代码里已埋下两处静默故障:后端 `_TIMEFRAME_GRANULARITY` 缺 `1w` 映射(选周线直接抛 `ValueError`),前端 `periodFromTimeframe` 正则只认 `m/h/d`(选周线/月线会静默 fallback 成 5 分钟线)。级别一旦扩容,这些坑会立刻暴露。

## What Changes

- 时间级别扩展到 **Bitget 原生全集**(13 个):`1s`、`1m 3m 5m 15m 30m`、`1H 2H 4H 6H 12H`、`1D 3D`、`1W`、`1M`。所有级别均经真实接口实测确认原生可用,不含任何前端合成周期。
- 周期栏改为 **pin 机制**:常驻栏只显示用户 pin 的级别,新增扩展按钮打开弹窗展示全部级别并可切换 pin 状态。默认 pin `1m 15m 1H 6H 1D 1W 1M`。
- pin 偏好持久化到 localStorage(全局用户偏好,不随 symbol/series 变化)。允许 pin 全空,此时常驻栏仅剩扩展按钮。
- **BREAKING**:后端时间级别标识符重命名,将「月」与「分钟」彻底分开。现有 `_normalize_timeframe` 做 `.lower()` 会把月线 `1M` 压成分钟线 `1m`,两者在接口层撞车。重命名后月线使用独立不冲突的标识符,消除大小写歧义。
- `1s` 为**仅实时**级别:Bitget 无秒级 REST 历史(实测 400),故秒级不请求历史、不落盘、不回灌,图表从空开始逐秒累积,并在 UI 上标注"仅实时"。

## Capabilities

### New Capabilities

- `period-selector-pinning`: 周期选择器的扩展弹窗与 pin 机制——常驻栏渲染已 pin 级别、扩展弹窗展示全集并切换 pin、pin 偏好持久化、允许全空。
- `timeframe-identifier-scheme`: 时间级别标识符的规范化方案——覆盖秒到月的全集标识符、月线与分钟线的消歧规则、前后端标识符映射与往返一致性。
- `realtime-only-timeframe`: 仅实时级别(`1s`)的行为约束——不请求 REST 历史、不落盘、不回灌、UI 标注,以及切换进出时的数据表现。

### Modified Capabilities

- `klinecharts-pro-integration`: 原「采用 Pro 原生开箱 UI,周期条全部启用可见」的契约需修订——周期条改由 pin 机制驱动,新增扩展按钮与弹窗,vendor 需补 `second` 时间跨度分支。
- `kline-ingestion`: 「支持所有 MCP 支持的品类/币种」与「全周期向更早方向深度回溯」需增加例外——仅实时级别不参与历史回溯与落盘。
- `market-endpoints`: K 线端点接受的时间级别集合扩展,且月线标识符变更影响请求参数契约。

## Impact

**后端**
- `backend/src/market_data/models.py`:`_TIMEFRAME_STEP_MS` / `_TIMEFRAME_GRANULARITY` 补全 13 个级别;`_normalize_timeframe` 月线消歧。
- `backend/src/market_data/config.py`:`timeframes` 默认值(影响定时抓取的 series 数量与存储量)。
- `backend/src/market_data/realtime.py`:秒级订阅与 `candle{granularity}` 通道拼接。
- `backend/src/market_data/webapi.py`:`_seed_candles_from_rest` 需跳过仅实时级别。

**前端**
- `frontend/src/api/datafeed.ts`:`periodFromTimeframe` / `periodToTimeframe` 支持 `second/week/month`;月线消歧;仅实时级别短路历史请求。
- `frontend/src/components/chart/KLineChartProView.tsx`:`NATIVE_PERIODS` 扩到 13 个。
- `frontend/src/lib/`:新增 pin 偏好 store(沿用 `alertsStore.ts` 的 localStorage + 订阅通知范式)。
- `frontend/src/types/trading.ts`:`Timeframe` 联合类型对齐原生全集。

**vendor(最小改造)**
- `frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx`:`adjustFromTo` 与 `formatDate` 补 `second` 分支(现无此分支,秒级区间计算与 X 轴秒显示失效)。
- `frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx`:平铺渲染改为 pin 驱动 + 扩展按钮。
- `frontend/vendor/klinecharts-pro/src/widget/period-bar/index.less`:扩展按钮与弹窗样式。

**数据与兼容**
- 已落盘数据目录按 `category/symbol/timeframe` 分片,月线标识符重命名需考虑既有目录的兼容或迁移。
- 新增级别会增加定时抓取的 series 数量,需评估请求配额与存储增长。
