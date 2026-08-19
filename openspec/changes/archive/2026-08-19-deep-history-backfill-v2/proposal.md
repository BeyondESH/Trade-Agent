## Why

用户拖 K 线到 2025-11-01 后无法继续加载更早历史。根因：后端回灌走 MCP 桥的 `candlesHistory` → Bitget `/api/v3/market/history-candles`，该接口文档化限制**只能查询最近 90 天**（SDK 内嵌文档："within the last 90 days" / "maximum time query range is 90 days"）。且 `KlineIngestor.backfill_before` 把空页一律判定为 `earliest_reached=True`，前端 `exhausted` 后会话内不再重试，导致图表停在 90 天窗口边界。后端已有直连 Bitget **v2 REST** 的 `_seed_candles_from_rest`（`/api/v2/mix/market/candles`，无 90 天限制），但回灌路径未使用。

## What Changes

- 新增 v2 REST 历史分页回灌路径 `backfill_before_rest`（`KlineIngestor`）：以 `endTime` 向前逐页拉取并即时落库，支持 futures（`productType`）与 SPOT 两种端点，受 `max_pages` 与页间限速约束。
- `/candles/backfill` 端点优先走 v2 REST 回灌；REST 异常时回退到现有 MCP `backfill_before`（保持健壮性）。
- 修正 `earliest_reached` 判定：空页不再直接判"已到最早"，先带退避重试一次；仍空且分页已推进到边界才标记 `earliest_reached`，避免把"临时空页/接口异常"误判为交易所无更早数据。
- 新增/调整后端单测覆盖：v2 REST 分页推进、`earliest_reached` 判定、REST→MCP 回退。
- 前端不改动（已能正确处理后向空区间与 `earliest_reached`）。

## Capabilities

### New Capabilities
<!-- 无：能力归属现有 history-backfill。 -->

### Modified Capabilities
- `history-backfill`: 新增"深度历史回灌（突破 90 天窗口）"与"earliest_reached 仅表示真正到达交易所最早数据"两条需求，更新既有"按需越界历史回灌"与"无更多历史时的终止"语义。

## Impact

- `backend/src/market_data/ingestion.py` — 新增 v2 REST 历史分页回灌（核心改动）。
- `backend/src/market_data/webapi.py` — `/candles/backfill` 切换 REST 主路径 + MCP 回退。
- `backend/src/market_data/config.py` — 如需页间限速等参数化（可选新增设置）。
- `backend/tests/` — 新增 `backfill_before_rest` 单测（mock httpx）。
- 前端 `frontend/src/api/datafeed.ts` 与 vendor 均不改动。
