## Why

以 TradingView 为 1:1 蓝本的重建被拆为 4 个 change，本 change 是**地基层**：先修复与 Bitget 数据交互中的真实 bug，并补齐"专业终端"必须的连通性能力。当前存在三个会直接砸掉体验/正确性的问题：

1. **K 线实时流断线后静默失效** —— `frontend/src/api/ws.ts` 的 `connectSnapshot` 没有 `onclose`/重连，网络抖动后图表永久停更且无任何提示。
2. **历史深度过浅** —— 图表只能取 store 中约 500 根 + 兜底 live 200 根，向前翻很快到头，与 TradingView 可回溯多年的观感差距巨大。后端 `KlineIngestor.fetch_range` 已具备向后分页能力，但缺少"按需深度回灌 + 全周期"的触发链路与 API。
3. **跨品类同名 symbol 歧义** —— SPOT 与 USDT-FUTURES 均存在 `BTCUSDT`，顶栏搜索按 `instId` 去重、`toSymbolInfo` 取首个匹配，会静默选错品类与价格精度。

这些问题是后续 `tv-parity-cleanup-shell` / `tv-multichart-sync` / `tv-replay-and-alerts` 的共同前提，因此优先落地。

## What Changes

- **K 线 WS 自动重连**：`connectSnapshot` 增加断线检测、指数退避重连、重连后自动重订阅；与 `useExchangeSocket` 的重连语义对齐。
- **全周期历史回灌**：新增按需"深度回灌"能力——前端向图表左侧翻页越界时触发后端回灌，后端对**全部支持的周期**用 `KlineIngestor.fetch_range` 向后分页拉取并落 `chartstore`，`/candles` 支持更早区间的连续返回。
- **连接状态标识**：前端暴露实时/延迟/断线连接态，`TVStatusBar` 增加连通性 badge（对齐 TradingView 状态栏的"实时/延迟"提示）。
- **跨品类 symbol 消歧**：symbol 的唯一键从 `instId` 升级为 `category:instId`；搜索、选中、精度解析统一以 instrument 的 `category + pricePrecision/volumePrecision` 为准，消除首个匹配的静默错选。
- **搜索/精度路径统一**：顶栏搜索与 datafeed 搜索合并为单一入口（基于 `/instruments`），精度一律取自 instrument，不再回退到硬编码 `2`。

## Capabilities

### New Capabilities
- `kline-stream-resilience`: K 线实时快照流的断线检测、自动重连、重连重订阅与连接状态上报能力。
- `history-backfill`: 按需触发的全周期历史深度回灌能力（前端越界翻页触发 → 后端分页拉取落库 → 连续区间返回）。

### Modified Capabilities
- `market-symbol-search`: symbol 唯一性与精度解析从 `instId` 升级为 `category:instId`，统一为基于 `/instruments` 的单一搜索入口，精度取自 instrument。
- `kline-ingestion`: 增加"按需深度回灌覆盖全部支持周期"的要求（在已有分页/增量/缺口能力之上明确全周期与越界回溯语义）。
- `realtime-ws`: 明确 K 线 `snapshot` 频道在客户端断线后需支持自动重连与重订阅，并对外暴露连接态。

## Impact

- **前端**：`api/ws.ts`（重连）、`api/datafeed.ts`（历史回灌触发、统一搜索）、`hooks/useTickerList.ts`（`category:instId` 键）、`App.tsx` 的 `toSymbolInfo`/精度解析、`layout/TVStatusBar.tsx`（连通 badge）、`layout/TVTopBar.tsx`（搜索入口统一）。
- **后端**：`webapi.py`（历史回灌触发 API、`/candles` 越界区间支持）、`ingestion.py`/`chartstore.py`（全周期深度回灌）、`scheduler.py`（可选的后台深度回灌任务）。
- **数据源**：Bitget REST/MCP 存在频控，深度回灌需分页节流；全周期回灌会显著增加首次拉取耗时与存储占用。
- **无破坏性 API 变更**：现有 `/candles`、`/ws` 契约保持向后兼容，仅新增行为与端点。
