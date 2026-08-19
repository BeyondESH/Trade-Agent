## ADDED Requirements

### Requirement: 定时抓取与启动预热
系统 SHALL 在服务端定时抓取 BlockBeats data 端点并刷新缓存：每日中午 12:00 触发一次全量抓取；后端启动时 SHALL 立即预热抓取一次，使缓存尽快就绪。抓取失败 SHALL 不阻塞后端启动与后续调度。

#### Scenario: 每日定时刷新
- **WHEN** 到达每日 12:00
- **THEN** 后端 SHALL 抓取全部 BlockBeats data 端点并更新本地缓存

#### Scenario: 启动预热
- **WHEN** 后端启动且缓存未就绪
- **THEN** SHALL 执行一次全量抓取填充缓存

#### Scenario: 启动抓取失败不影响服务
- **WHEN** 启动预热时上游抓取失败（如上游不可用、密钥未配置）
- **THEN** 后端 SHALL 记录告警并继续正常启动
- **AND** 定时任务 SHALL 仍在下次触发时重试

### Requirement: 缓存按参数分文件
系统 SHALL 按端点参数组合分文件缓存：无参端点各一个文件；`top10_netflow` 按 `network` 各一份；`us10y` 与 `dxy` 按 `type` 各一份，默认预缓存 `type=1M`。前端请求携带参数时 SHALL 命中对应参数组合的缓存。

#### Scenario: 无参端点单独缓存
- **WHEN** 定时抓取 `btc_etf`、`daily_tx` 等无参端点
- **THEN** 每个端点 SHALL 保存到独立缓存文件

#### Scenario: top10_netflow 按 network 分文件
- **WHEN** 定时抓取 `top10_netflow` 的不同 network（如 solana、ethereum）
- **THEN** 各 network SHALL 保存到独立缓存文件
- **AND** 前端请求 `top10_netflow?network=ethereum` 时 SHALL 命中 ethereum 的缓存文件

#### Scenario: us10y / dxy 按 type 分文件
- **WHEN** 定时抓取 `us10y` 或 `dxy`
- **THEN** SHALL 预缓存 `type=1M` 的对应文件
- **AND** 前端请求 `us10y?type=1M` 时 SHALL 命中该缓存

### Requirement: 手动刷新端点
系统 SHALL 提供 `POST /blockbeats/data/refresh` 触发一次全量抓取并更新缓存，用于运维/开发即时刷新。单端点失败 SHALL 不影响其余端点，现有缓存 SHALL 保留不被失败写覆盖。

#### Scenario: 手动触发全量刷新
- **WHEN** 调用 `POST /blockbeats/data/refresh`
- **THEN** 后端 SHALL 抓取全部端点并更新缓存
- **AND** 返回各端点的成功/失败状态

#### Scenario: 单端点失败隔离
- **WHEN** refresh 过程中某端点抓取失败
- **THEN** 其余端点缓存 SHALL 正常更新
- **AND** 失败端点的旧缓存 SHALL 保留，不被覆盖

### Requirement: 缓存持久化
系统 SHALL 将 BlockBeats data 缓存写盘持久化，存于后端 `data` 目录下的专用缓存目录，避免进程重启后丢失；缓存文件中 SHALL 记录抓取时间戳 `fetched_at`。

#### Scenario: 重启后复用缓存
- **WHEN** 后端重启而缓存目录中存在历史缓存文件
- **THEN** 后端 SHALL 直接复用现有缓存，无需重新从上游抓取
