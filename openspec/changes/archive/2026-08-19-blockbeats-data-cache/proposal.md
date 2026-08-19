## Why

BlockBeats data 是**每日更新**的指标数据（ETF 净流入、稳定币市值、合约平台、美债收益率等）。当前 `GET /blockbeats/data/*` 每次前端请求都实时转发到 `api-pro.theblockbeats.info`，导致页面首屏每次都要等上游网络往返，加载非常慢；同时频繁实时拉取每日数据既浪费又不必要地依赖上游可用性与限流。

## What Changes

- **新增 BlockBeats 数据缓存存储层**：后端新增一个轻量 JSON 缓存（`data/blockbeats_cache/`，每个端点一个文件），保存 BlockBeats data 端点抓取到的响应 `data`，连同抓取时间戳。
- **后端定时抓取**：APScheduler 每日 12:00 定时触发，抓取全部 11 个 BlockBeats data 端点写入缓存；启动时立即预热抓取一次，避免缓存未就绪导致首屏空。
- **带参端点按参数分文件缓存**：`top10_netflow` 按 `network` 各一份；`us10y`/`dxy` 缓存默认 `type=1M` 一份；其余无参端点各一份。
- **前端请求改读本地缓存**：`GET /blockbeats/data/{endpoint}` 命中本地缓存时直接返回缓存内容（含 `from_cache` 标记），不再请求上游；仅在缓存未命中（如请求了未预热的参数组合）时回退实时拉取。
- **提供手动刷新入口**：新增 `POST /blockbeats/data/refresh` 触发一次性全量抓取更新缓存，便于运维/开发即时更新。

## Capabilities

### New Capabilities
- `blockbeats-data-cache`: BlockBeats 每日数据在服务端的定时抓取、本地持久化、缓存命中读取与手动刷新机制。

### Modified Capabilities
- `blockbeats-data`: 数据代理路由改为「优先读本地缓存、未命中才实时转发」的行为；新增 `from_cache` 响应标记与手动刷新端点（行为变化，需更新 spec）。

## Impact

- `backend/src/market_data/`：新增缓存模块（如 `blockbeats_cache.py`）；`webapi.py` 的 `blockbeats_data` 路由改读缓存；`scheduler.py`/`config.py` 增加定时抓取任务与缓存路径/时刻配置。
- `backend/src/market_data/config.py`：新增 `blockbeats_cache_dir`、`blockbeats_cache_hour/minutes`（默认 12:00）等设置项。
- `backend/src/market_data/webapi.py`：`GET /blockbeats/data/{endpoint}` 响应增加 `from_cache` 字段；新增 `POST /blockbeats/data/refresh`。
- `backend/tests/`：缓存命中/未命中/带参分文件/启动预热/手动刷新相关测试。
- 依赖 APScheduler（已存在）与上游 BlockBeats data API。
- 前端无需改动；缓存对 `/api/blockbeats/*` 消费方透明。
