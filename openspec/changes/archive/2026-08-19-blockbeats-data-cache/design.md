## Context

BlockBeats data 端点（`/v1/data/*`）返回每日聚合指标：比特币 ETF 净流入、稳定币市值、合规交易所总资产、各链每日交易量、主流合约平台、10 年美债收益率、DXY、Bitfinex 杠杆多头、抄底逃顶指标、链上净流入前十。这些数据按日更新，缓存一天完全能满足展示需求。

当前代理 `backend/src/market_data/webapi.py` 的 `GET /blockbeats/data/{endpoint}` 每次都经 `blockbeats.fetch_data` 实时转发到 `api-pro.theblockbeats.info`，密钥从 `Settings.bb_api_key` 读取、仅后端持有。前端 `useMarketOverview` 一次性并发请求 9+ 端点，每次页面加载都触发多次上游网络往返，加载慢、且无谓消耗上游配额。

现有后端基建：
- `scheduler.py` 用 APScheduler `BackgroundScheduler` 做定时增量子任务（间隔触发）。
- `webapi.py::create_app` 有 `_lifespan`（启动/停止），可挂缓存预热与定时任务生命周期。
- `Settings.data_dir` 提供存储根目录（默认 `./data`）；已有 `parquet_dir`、`config` 等子目录先例。
- `blockbeats.fetch_data(endpoint, **params)` 已支持 `network` / `type` 可选参数透传。

约束：
- 密钥绝不能下放前端；缓存只在服务端读上游。
- 缓存必须对前端透明——消费方（`useMarketOverview`、`marketPulse.ts`）无需改动，只需响应里多一个 `from_cache` 标记。

## Goals / Non-Goals

**Goals:**

- 让 `GET /blockbeats/data/*` 命中本地缓存时零上游网络开销，首屏显著提速。
- 每日 12:00 定时刷新缓存，启动时立即预热一次，保证缓存始终可用且够新。
- 带参端点（`top10_netflow` 的 `network`、`us10y`/`dxy` 的 `type`）按参数组合分文件缓存。
- 提供 `POST /blockbeats/data/refresh` 手动触发全量抓取更新。
- 缓存写盘持久化，后端重启后仍可复用，不依赖内存态。

**Non-Goals:**

- 不缓存 BlockBeats 的 newsflash 快讯类接口（那是实时流，语义不同）。
- 不引入 Redis/内存缓存框架——每日小数据量 JSON 文件足够，保持简单。
- 不改变前端取数逻辑或响应结构（仅新增 `from_cache` 字段，向后兼容）。
- 不做缓存失效/强一致性——每日数据允许展示旧一天数值直至下一次定时刷新。

## Decisions

### 1. 缓存存储：单文件 JSON，`data/blockbeats_cache/<endpoint>[_key].json`

每个缓存项存两份信息：抓取到的 `data` 与 `fetched_at` 时间戳，形如：

```json
{ "fetched_at": "2026-08-19T12:00:00+00:00", "data": [...] }
```

按端点 + 参数字签名分文件：
- `btc_etf.json`, `daily_tx.json`, ..., 无参端点各一个文件。
- `top10_netflow.solana.json`, `top10_netflow.ethereum.json`, ... 按 `network`。
- `us10y.1M.json`, `dxy.1M.json` 缓存默认粒度（`type=1M`；`us10y`/`dxy` 前端只请求 `1M`，缓存这份）。

选 JSON 文件而非 Parquet/现有 `ParquetStore`：这些是异构的每日快照（数组/字典混合），不是规整的时序 K 线，Parquet 模型不匹配。JSON 简单、可读、易调试。目录用 `Settings.data_dir / "blockbeats_cache"`。

考虑过内存全局 dict + 定期写盘：引入脏状态与崩溃丢缓存的风险，文件直写更可预期。冷读取影响可忽略（文件小）。

### 2. 定时触法：APScheduler，每日 12:00 + 启动预热

新增一个 `cron` 触发的 job（`hour=12, minute=0`），调用全量抓取函数（同 `POST /refresh` 的底层逻辑）。在 `_lifespan` 启动阶段先同步预热抓取一次，再注册 cron job。

选 cron 而非 interval：需求明确"每日中午 12 点"，cron 表达直观，且不随进程运行时长漂移。复用 `scheduler.py` 的 `BackgroundScheduler`，但那是"增量 K 线"专用 skeleton，本需求抓取目标完全不同——新增独立 job 注册到同一个 scheduler 实例（在 `webapi.py` 组装），不硬塞进 `build_scheduler`。

启动预热为**条件预热**：仅在缓存目录为空（全新部署/首次运行）时执行一次 `refresh_all()`；若已有历史缓存则直接复用，不重复全量抓取，由每日 cron 负责后续刷新。这样既保证首屏有数据，又避免每次重启都无谓刷上游。
- 预热失败不阻塞后端启动（best-effort，`logger.warning`）。
- cron job 仍注册，下次 12 点继续尝试。
- 前端请求此时走缓存未命中 → 回退实时拉取（见决策 3），不会白屏。

### 3. 读取策略：缓存命中直接返回，未命中回退实时

`GET /blockbeats/data/{endpoint}`：
1. 计算参数分文件 key（无参端点 key 即 endpooint；`top10_netflow`→附 `network`；`us10y`/`dxy`→附 `type`，缺省按 `1M`）。
2. 若对应缓存文件存在且非空 → 返回 `{"status":0, "data":..., "from_cache": true, "fetched_at":...}`，不打上游。
3. 若缓存未命中（如请求了未预热过的 `type=2M` 或某个陌生 network）→ 回退 `blockbeats.fetch_data` 实时拉取并返回（`from_cache: false`），**不写回缓存**（避免把非常规参数的偶发请求固化）。

这样常规前端路径（预热了全部默认组合）全程零上游请求，只有非常规参数才回退。

### 4. 手动刷新端点和失败语义

`POST /blockbeats/data/refresh`：全量抓取 11 个端点（含各 `network` 与 `us10y`/`dxy` 默认 type），逐个写缓存。单端点失败不影响其他端点（与 scheduler 的 per-target 隔离一致）。返回每个端点的成功/失败状态，便于运维确认。

逐端点失败时：保留旧缓存文件不清除（写盘失败不破坏旧数据），下次成功覆盖。

### 5. 响应兼容：新增 `from_cache` 字段，不破坏现有消费方

现有前端 `api.blockbeatsData` 只读 `.data`；`useMarketOverview` 与 `marketPulse` 也只消费 `.data`。新增 `from_cache`/`fetched_at` 后，TS 类型 `{status, data}` 不受影响（多余字段可忽略）。无需改前端。

## Risks / Trade-offs

- **启动预热 + 首次加载并发抓所有端点可能较慢/被限流** → 预热在 lifespan 启动阶段同步执行一次即可，非阻塞失败；cron 每日仅一次，上游负担极低。若某端点失败，前端回退实时也不致白屏。
- **缓存数据可能展示到旧一天（每日 12 点前是前一天的数）** → 这是"每日数据 + 每日刷新"的固有权衡，已接受；`fetched_at` 标记暴露给前端可自证数据新旧。
- **带参端点仅缓存了默认粒度** → 若未来前端需要其他 `type`（如 `1D`），该组合未命中会回退实时；届时只需在预热集合里补该组合。当前 `useMarketOverview` 只固定用 `1M`/指定 network，风险可控。
- **缓存文件与密钥同机存储** → 缓存内容是公开行情，无敏感信息；密钥仍只在内存/配置中，不进缓存。
- **新增后台线程（APScheduler）生命周期** → 复用现有 scheduler 在 `_lifespan` 的启动/关闭管理，避免孤儿线程。

## Migration Plan

- 无破坏性迁移：新增缓存层，`blockbeats_data` 路由行为从"总是实时"变为"缓存优先"，对外响应结构增字段不回退。
- 部署即生效：后端重启后启动预热填缓存，无需人工。升级窗口内旧缓存目录不存在会自动创建。
- 回滚：移除缓存模块 + 恢复 `blockbeats_data` 为直接 `fetch_data` 即可，一键改回实时。

## Open Questions

- 前端是否希望在 UI 上展示 `fetched_at`（提示"数据更新于昨日 12:00"）？当前默认不做，仅在响应中透传。
