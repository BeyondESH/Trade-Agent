## Why

K 线数据链路在"多 series 并存"场景下存在真实缺陷:后端 `/ws` 订阅键 `subs[(channel, symbol)]` 不含 category/timeframe,同 symbol 不同周期的订阅互相覆盖;推送帧也缺少 category/timeframe,前端 `bitgetWs.deliver()` 只按 symbol+category 匹配,导致**不同 timeframes 的蜡烛串流、时间轴错乱**。此外心跳格式 `{"event":"ping"}` 非 Bitget 官方格式(服务端返回 `30002 Unrecognized request`),连接稳定性受影响;pro 组件历史窗口对 4h/12h 周期未对齐到周期边界,请求范围与蜡烛边界错位。目标是按交易所级别重写 `/ws` 订阅路由与前端 `bitgetWs` 客户端,使多 series 精确路由、帧格式完整、连接稳定。

## What Changes

- **后端 `/ws` 订阅键**改为完整 4 元组 `(channel, category, symbol, timeframe)`:同 symbol 不同周期的订阅不再互相覆盖;退订/断连清理按完整 key 注销。
- **推送帧统一携带完整 series 标识**:`snapshot`/`update` 帧均含 `channel`、`category`、`symbol`、`timeframe`、`action`、`data`,前端可精确路由到订阅者。
- **前端 `bitgetWs.deliver()`** 改为按 `category:symbol:timeframe` 4 维精确匹配,杜绝跨周期串流;订阅/退订协议携带完整 series。
- **心跳格式修正**:`realtime.py` 与 `streamhub.py` 的 `{"event":"ping"}` 改为 Bitget 官方字符串 `ping`(期望回复 `pong`),提高连接稳定性。
- **pro 历史窗口对齐**:修正 vendor `klinecharts-pro` 的 `N1` 窗口计算(或前端补偿),使 4h/12h 等周期请求窗口与蜡烛边界对齐。
- 事件驱动推送(实时 `last_candle` + 低频指标/S-R 完整帧)与单例复用 WS 客户端保留,`datafeed`/`useCandles` 外部接口不变。

## Capabilities

### New Capabilities
- `ws-series-routing`: `/ws` 按完整 series(4 元组)路由与推送——订阅键、帧格式、退订清理、心跳。

### Modified Capabilities
- `realtime-ws`: candle 订阅路由从 `(channel, symbol)` 升级为完整 4 元组;推送帧携带 `category`/`timeframe`;心跳采用 Bitget 官方格式。
- 前端 `bitgetWs.deliver` 由 symbol+category 匹配升级为 `category:symbol:timeframe` 精确匹配、订阅协议携带完整 series —— 该行为由 `ws-series-routing` 规范覆盖(`realtime-candle-push` 未归档,其实时推送行为保持不变)。

## Impact

- `backend/src/market_data/webapi.py`:`ws()` 的 `subs` 键、推送帧构造、退订/断连清理;心跳常量。
- `backend/src/market_data/realtime.py`、`backend/src/market_data/streamhub.py`:心跳帧格式(`ping` 字符串)。
- `frontend/src/api/bitgetWs.ts`:`deliver` 4 维匹配;订阅/退订协议;断线重连逻辑适配。
- `frontend/vendor/klinecharts-pro`: `N1` 窗口对齐(小时/日周期按 multiplier 对齐边界)。
- 测试:`backend/tests/test_webapi.py`(多 series 路由、帧格式)、`test_realtime.py`(心跳)、`test_streamhub.py`(心跳);`frontend/src/api/bitgetWs.test.ts`(deliver 匹配)。
- 不涉及:数据存储、指标算法、REST 端点、pro 组件外部接口。
