## Context

本 change 是 TradingView 1:1 重建的地基层，聚焦与 Bitget 交互的三个真实缺陷。现状要点：

- **前端 K 线流**：`api/ws.ts` 的 `connectSnapshot` 只建一次 `WebSocket`，`onmessage` 解析快照，**无 `onclose`/`onerror`/重连**。断线后图表静默停更。
- **通用行情流**：`hooks/useExchangeSocket.ts` 的 `ExchangeSocket` 已有退避重连 + 重订阅（onclose 递增退避、onopen 重发订阅），可作为 K 线流重连的参考实现。
- **历史拉取**：`api/datafeed.ts` 的 `getHistoryKLineData` 先取 store（`/candles` limit 500），失败兜底 `/candles/recent`（≤500），无向前越界回灌。
- **后端回灌能力**：`ingestion.py` 的 `KlineIngestor.fetch_range` 已实现按 `endTime` 向后分页；`ingest_incremental` / `find_gaps` 已具备。缺的是"向更早方向深度回溯"的触发 API 与调度。
- **symbol 唯一性**：`hooks/useTickerList.ts` 用 `category:instId` 作 snapshot key（已正确），但对外暴露的 `symbols` 用 `instId` 去重；`App.tsx` 的 `toSymbolInfo` 在 ticker 列表里 `find` 首个匹配、精度回退到 `2`；顶栏 `TVTopBar` 搜 `symbols`（内存 ticker），datafeed 搜 `/instruments`——两条不一致路径。

决策（本次探索已拍板）：回灌触发采用 **C = 按需越界 + 当前 symbol 后台预取**。

## Goals / Non-Goals

**Goals:**
- K 线快照流断线自动重连 + 重订阅 + 连接态上报，图表不再静默停更。
- 全周期按需越界历史回灌 + 当前 symbol 后台预取，翻页可持续向前滚动。
- 跨品类同名 symbol 以 `category:instId` 消歧；精度统一取自 instrument；搜索收敛为单一 `/instruments` 入口。
- `TVStatusBar` 显示连通性 badge（实时 / 重连中 / 断开）。

**Non-Goals:**
- 不改 `/ws` 帧协议与 `/candles` 契约（仅新增行为/端点，向后兼容）。
- 不做多格联动 / 回放 / 警报（属后续 change）。
- 不引入外部数据源（Screener 基本面仍仅用 Bitget 维度，属 shell change）。

## Decisions

### D1. K 线流重连：复用 ExchangeSocket 语义，不新建连接层
在 `connectSnapshot` 内实现与 `ExchangeSocket` 一致的重连模型：`onclose` → 若非主动关闭则 `retry+1`、`setTimeout(min(500*retry, 5000))` 后重开；`onopen` 重新发送订阅（该流是 URL query 订阅，重连即重建同 URL）。新增 `manualClose` 标志区分主动关闭。暴露 `onStatus(state)` 回调（`live | reconnecting | closed`）。
- 备选：把 K 线流也并入 `ExchangeSocket` 的 op-subscribe 模型。**否决**：K 线快照流是独立 query-string 端点、语义不同，合并风险大于收益，留作后续统一。

### D2. 连接态传播：datafeed → App → TVStatusBar
`BitgetDatafeed.subscribe` 透传 `connectSnapshot` 的状态到一个回调；`App` 持有 `connState` state；`TVStatusBar` 增加 badge。datafeed 已是 App 单例（`useMemo`），可挂状态监听。

### D3. 越界回灌：前端触发、后端分页、区间去重
- 前端：`getHistoryKLineData(from,to)` 中，当 `from` 早于本地最早 bar 时调用新端点 `POST /candles/backfill { category, symbol, timeframe, before }`，后端用 `fetch_range` 向 `before` 之前分页拉取落库，返回补齐后的区间；随后 `/candles` 连续返回。
- 后端"无更早"判定：`fetch_range` 某页返回空或 `page_min` 不再前进 → 标记 `earliest_reached`，前端据此停止再触发（对齐 spec "已到最早"）。
- 去重/并发合并：前端对 `(series, before)` 做在途请求去重（预取与按需可能撞同一区间），复用同一 Promise。

### D4. 后台预取：选定 symbol 后异步预取当前周期深度
`handleSelect` 后触发一次后台 `backfill`（低优先、节流），深度为"额外 N 页"。与 D3 共用在途去重，避免和用户翻页重复。

### D5. 回灌节流与频控：后端串行 + 退避
后端回灌对同一 `series` 串行、跨 series 限并发（小信号量）；遇交易所频控错误退避重试且保留已拉取分页进度（`fetch_range` 已按页 append，可在其上加 try/退避）。全周期回灌一次性成本高，故**深度按需增量**而非启动即全量。

### D6. symbol 消歧：唯一键升级为 category:instId
- `useTickerList.symbols`：由 `instId` 去重改为返回 `{category, instId}` 或 `category:instId` 复合标识；顶栏搜索/选中携带 category。
- `App.toSymbolInfo`：按 `category:instId` 精确匹配，精度取自 instrument（`pricePrecision/volumePrecision`），移除回退 `2`。
- 搜索入口统一：顶栏改用 datafeed 的 `searchSymbols`（基于 `/instruments`），删除对内存 `symbols` 的第二条路径。

## Risks / Trade-offs

- **全周期回灌的时间/存储成本**：按需增量已缓解；但极老周期（如 1m 数年）体量大，本 change 只保证"能持续向前"，不保证一次拉满——可在 tasks 中限制单次回灌页数上限。
- **重连风暴**：退避上限 5s + 主动关闭标志规避；需确保切 symbol 时先 `manualClose` 再建新连，避免旧连重连。
- **消歧的迁移面**：`category:instId` 触及搜索/选中/精度/持久化多处；localStorage 里旧的以 `instId` 存的绘图 key 可能失配——本 change 不迁移历史绘图 key，接受一次性失配（后续 multichart change 统一 series key）。
- **在途去重的正确性**：预取与按需撞区间需 key 化 Promise 缓存，注意失败后要清除缓存以允许重试。
