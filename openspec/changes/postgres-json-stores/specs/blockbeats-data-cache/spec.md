## MODIFIED Requirements

### Requirement: 缓存按参数组合存储

系统 SHALL 按端点参数组合分别缓存：无参端点各一条缓存记录；`top10_netflow` 按 `network` 各一条；`us10y` 与 `dxy` 按 `type` 各一条，默认预缓存 `type=1M`。每条记录以 `cache_key`（`<endpoint>[.<network>][.<type>]`）唯一标识。前端请求携带参数时 SHALL 命中对应参数组合的缓存。

#### Scenario: 无参端点单独缓存

- **WHEN** 定时抓取 `btc_etf`、`daily_tx` 等无参端点
- **THEN** 每个端点 SHALL 保存为独立的缓存记录

#### Scenario: top10_netflow 按 network 分记录

- **WHEN** 定时抓取 `top10_netflow` 的不同 network（如 solana、ethereum）
- **THEN** 各 network SHALL 保存为独立的缓存记录
- **AND** 前端请求 `top10_netflow?network=ethereum` 时 SHALL 命中 ethereum 的缓存记录

#### Scenario: us10y / dxy 按 type 分记录

- **WHEN** 定时抓取 `us10y` 或 `dxy`
- **THEN** SHALL 预缓存 `type=1M` 的对应记录
- **AND** 前端请求 `us10y?type=1M` 时 SHALL 命中该缓存

### Requirement: 缓存持久化

系统 SHALL 将 BlockBeats data 缓存持久化到 PostgreSQL `blockbeats_cache` 表（连接串来自 `MD_POSTGRES_DSN`），避免进程重启后丢失；每条缓存记录 SHALL 记录抓取时间戳 `fetched_at`。

#### Scenario: 重启后复用缓存

- **WHEN** 后端重启而缓存表中存在历史缓存记录
- **THEN** 后端 SHALL 直接复用现有缓存，无需重新从上游抓取
