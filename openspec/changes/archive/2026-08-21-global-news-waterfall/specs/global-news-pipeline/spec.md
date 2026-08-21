## ADDED Requirements

### Requirement: 快照封顶与最新在前

系统 SHALL 在 `/news/stream` 的 `snapshot` 事件中仅回放最近 `SNAPSHOT_MAX_ITEMS`(默认 100)条缓冲条目,且条目顺序 SHALL 为最新在前(newest-first),以控制断线重连时的帧体积并匹配瀑布流最新置顶语义。

#### Scenario: 快照条数封顶

- **WHEN** 客户端建立 `/news/stream` 连接且缓冲条目超过 100 条
- **THEN** `snapshot` SHALL 仅携带最新 100 条

#### Scenario: 快照顺序

- **WHEN** `snapshot` 携带条目
- **THEN** 条目 SHALL 按时间最新在前排列

### Requirement: 历史分页接口

系统 SHALL 提供 `GET /news/history?offset=&limit=&category=` 对环形缓冲分页查询,返回最新在前的 `{items, total}`;`limit` 缺省 100、上限 200,`category` 为逗号分隔的可选过滤。

#### Scenario: 分页翻页

- **WHEN** 请求 `offset=100&limit=100`
- **THEN** 返回缓冲中第 101~200 条(最新在前),`total` 为当前缓冲可翻页总数

#### Scenario: 分类过滤

- **WHEN** 请求 `category=macro,crypto`
- **THEN** `items` SHALL 仅含对应分类条目,`total` 为该分类下的可翻页总数

#### Scenario: 越界行为

- **WHEN** `offset` 大于缓冲内条目数
- **THEN** 返回空 `items` 与当前 `total`,而非报错

### Requirement: 瀑布流载荷顺序一致

驱动瀑布流的载荷(`snapshot` 与 `/news/history`)SHALL 统一为最新在前;`/news/context` 与 `/news/health` 的行为 SHALL 保持不变。

#### Scenario: 载荷顺序统一

- **WHEN** 客户端同时收到 `snapshot` 帧并发起 `/news/history` 分页
- **THEN** 两者返回的条目 SHALL 均为最新在前,前端无需区分处理

#### Scenario: 既有接口不变

- **WHEN** 请求 `/news/context` 或 `/news/health`
- **THEN** 响应结构 SHALL 与改版前一致,不受瀑布流改版影响
