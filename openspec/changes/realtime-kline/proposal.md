## Why

当前前端显示的"实时价格"实为 Parquet 里最后一次落库 bar 的收盘价，scheduler 每 300s 才增量拉一次，界面价格最多 5 分钟才更新一次；K 线图最后一根 bar 完全不会实时跳动。Bitget MCP 是纯 REST 轮询、无推送语义，实时 K 线的唯一正路是直连 Bitget 公共 WebSocket（`wss://ws.bitget.com/v2/ws/public`，公共行情无需 API key），这也正是系统架构 spec 预留的"DL 量化直连通道"。

## What Changes

- 后端新增 `realtime.py`：Bitget 公共 WS 客户端，订阅 `candle{interval}` 频道，心跳保活、断线自动重连并重订阅，解析 candle 帧存入内存 buffer（按 `category/symbol/timeframe`）。
- `webapi.py`：lifespan 启停流；`/ws` 快照注入 `last_candle` 字段，价格优先取实时 bar 收盘价，实时缺失时回退存储数据。
- `config.py`：新增 WS URL、心跳间隔、重连间隔配置。
- 前端：`Snapshot` 类型新增 `last_candle`；App 将快照中的 `last_candle` 传给 ChartTerminal，经 `Chart.vue` 已有的 `updateData` 消费点做最后一根 bar 增量更新（Change A 已预留接口）。
- **BREAKING**: `realtime-ws` 规格从"定时快照、非逐笔"扩展为"含实时 K 线增量"。
- **BREAKING**: `system-architecture` 中"DL 量化直连通道"扩展为同时服务前端实时行情。

## Capabilities

### New Capabilities
- `bitget-realtime-stream`: Bitget 公共 WebSocket K 线订阅能力——多频道订阅、帧解析、心跳保活、断线重连重订阅、内存 buffer 提供最新 bar。

### Modified Capabilities
- `realtime-ws`: `/ws` 快照语义从"定时快照、非逐笔"扩展为定时快照 + 实时 K 线增量（`last_candle`），价格优先实时。
- `system-architecture`: "两条执行/数据通道"中 Bitget 直连 WebSocket 通道从仅供 DL 量化扩展为同时服务前端实时行情。

## Impact

- `backend/`：新增 `src/market_data/realtime.py`（BitgetWsStream）；`config.py` 增加 `ws_public_url`/`ws_heartbeat_seconds`/`ws_reconnect_seconds`；`webapi.py` lifespan 启停 + `_snapshot` 注入 `last_candle`；`pyproject.toml` 新增 `websockets` 依赖。
- `frontend/`：`api/types.ts` Snapshot 增加 `last_candle`；`lib/transform.ts` 新增单根 candle → klinecharts KLineData 转换；`App.vue` 把 `snap.last_candle` 传给 ChartTerminal。
- 测试：后端新增 `tests/test_realtime.py`（帧解析、订阅消息、重连逻辑），`test_webapi.py` 增补快照含实时数据与回退语义；前端 transform 与 App/Chart 链路测试。
- 不涉及：Parquet 存储（实时 bar 仅内存、临时覆盖最后一根）、风控执行、AI Agent 层。
