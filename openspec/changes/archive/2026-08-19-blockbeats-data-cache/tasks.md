## 1. 后端：配置项

- [x] 1.1 在 `backend/src/market_data/config.py` 的 `Settings` 增加 `blockbeats_cache_dir: Path`（属性，指向 `data_dir / "blockbeats_cache"`）、`blockbeats_refresh_hour: int = 12`、`blockbeats_refresh_minute: int = 0`

## 2. 后端：缓存模块

- [x] 2.1 新建 `backend/src/market_data/blockbeats_cache.py`，实现缓存目录 `mkdir(parents=True, exist_ok=True)` 与「端点+参数 → 缓存文件名」映射（无参端点各一文件；`top10_netflow` 附 `network`；`us10y`/`dxy` 附 `type`，缺省 1M）
- [x] 2.2 实现 `load_cache(endpoint, network=None, type=None) -> dict | None`：返回 `{"fetched_at", "data"}` 或 None（文件不存在/损坏返回 None）
- [x] 2.3 实现 `save_cache(endpoint, data, network=None, type=None)`：写入 `{"fetched_at": <UTC iso>, "data": data}`，原子写（临时文件 + rename）
- [x] 2.4 实现 `path_for(endpoint, network=None, type=None)` 私有帮助函数，生成 `blockbeats_cache/<endpoint>[.<key>].json`
- [x] 2.5 实现 `refresh_all() -> dict`：并行/顺序调 `blockbeats.fetch_data` 抓取无参端点、各 `network` 的 `top10_netflow`、`us10y`/`dxy` 的 `type=1M`，写缓存；单端点失败隔离，返回 `{endpoint: "ok"|"error"}` 汇总

## 3. 后端：接入 webapi 与路由

- [x] 3.1 在 `webapi.py` 的 `blockbeats_data` 路由改为「缓存优先」：根据 `network`/`type` 计算缓存 key，命中缓存则返回 `{"status":0,"data":..., "from_cache":true, "fetched_at":...}`；未命中回退 `blockbeats.fetch_data` 返回 `{"status":0,"data":...,"from_cache":false}`
- [x] 3.2 新增 `POST /blockbeats/data/refresh` 路由，调用 `refresh_all()` 并返回各端点状态汇总
- [x] 3.3 在 `_lifespan` 启动阶段同步调用一次 `refresh_all()` 预热缓存（失败仅 `logger.warning`，不阻塞启动），并注册 APScheduler `cron(hour=12, minute=0)` job
- [x] 3.4 在 `_lifespan` 关闭阶段妥善关闭新增的 scheduler job，避免孤儿线程（复用既有 stream/market stop 流程）

## 4. 后端：测试

- [x] 4.1 在 `backend/tests/` 新增 `test_blockbeats_cache.py`：验证无参端点缓存文件名与读写往返
- [x] 4.2 验证 `top10_netflow` 按 network、`us10y`/`dxy` 按 type 分文件
- [x] 4.3 验证缓存命中返回 `from_cache: true` / `fetched_at`，且不调用上游（monkeypatch `fetch_data` 断言未调用）
- [x] 4.4 验证缓存未命中回退实时（`from_cache: false`，调用上游）
- [x] 4.5 验证 `refresh_all` 单端点失败隔离且旧缓存保留
- [x] 4.6 验证 `POST /blockbeats/data/refresh` 路由与启动预热在 lifespan 触发（可用 TestClient lifespan 验证）
- [x] 4.7 运行后端测试 `pytest tests/test_blockbeats.py tests/test_blockbeats_cache.py` 确认全绿

## 5. 端到端验证

- [x] 5.1 在后端启动后，用 HTTP 连续两次请求 `GET /blockbeats/data/btc_etf`，确认第二次起 `from_cache: true` 且无上游网络耗时
- [x] 5.2 请求 `GET /blockbeats/data/top10_netflow?network=solana` 与 `GET /blockbeats/data/us10y?type=1M`，确认命中各自分文件缓存
- [x] 5.3 调用 `POST /blockbeats/data/refresh`，确认返回各端点状态且缓存文件更新时间更新
- [x] 5.4 重启后端进程，确认可复用历史缓存文件（无需重新全量抓取）——可通过启动日志或缓存文件 `fetched_at` 未变化验证
