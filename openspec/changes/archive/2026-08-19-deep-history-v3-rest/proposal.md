## Why

深度回灌目前走 Bitget v2 `candles` REST 端点，该端点对分钟/小时级有历史深度上限（实测 1m/1h 只能取最近 ~30 天，4h ~150 天，1d ~2022-10）。前端向左翻页到该深度后 v2 返回空页，后端将其误判为 `earliest_reached`，各周期都在远早于交易所真实数据边界的浅时间点停止加载。而 Bitget v3 `history-candles` 端点可回溯到 2019-07（BTCUSDT USDT-M 真实上市）的全量历史，但单次 limit≤100、单次区间≤90 天、20 req/s 频控。

## What Changes

- 深度回灌 REST 通道从 v2 `/api/v2/mix/market/candles` 切换为 v3 `/api/v3/market/history-candles`（endTime cursor 翻页，limit≤100，单次区间≤90 天）。
- 并行回灌按 v3 的每页 100 根计算 cursor 间隔，不再按 90 天窗口计算。
- `earliest_reached` 判定基于 v3 返回空页（重试一次后），与"渠道深度上限"解耦——各周期都能回溯到交易所真实最早数据。
- 保留 v2 `candles` 作为近期窗口的补充/回退通道（若 v3 失败或用于 MCP 回退不变）。
- 新增 v3 相关配置（端点、每页上限、频控退避沿用现有 backoff）。

## Capabilities

### New Capabilities
- `v3-history-channel`: 通过 Bitget v3 `history-candles` 端点进行无限深度历史回灌的能力（endTime cursor 翻页、limit≤100、90 天窗口、频控保护），作为深度回灌的 REST 主通道。

### Modified Capabilities
- `kline-ingestion`: 「全周期向更早方向深度回溯」要求深度回灌渠道 MUST 能到达交易所真实最早历史；当渠道因历史深度上限返回空页时不得判定为已到最早（需切换到可无限回溯的 v3 通道）。
- `history-backfill`: 「无更多历史时的终止」要求 `earliest_reached` 判定基于 v3 深历史通道的空页，而非受近端窗口限制的 v2 通道。

## Impact

- 后端代码：`backend/src/market_data/ingestion.py`（新增 v3 fetcher、并行 cursor 间隔计算、earliest 判定）、`backend/src/market_data/config.py`（v3 端点/每页上限配置）、`backend/src/market_data/webapi.py`（回灌参数传递不变，注入点复用）。
- 测试：`backend/tests/test_ingestion_rest.py`（v3 翻页/并行/earliest 判定用例）。
- 无前端改动；数据模型/存储不变。
- 依赖：httpx（已有）、Bitget v3 公共 REST（无需鉴权）。
