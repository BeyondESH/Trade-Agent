## ADDED Requirements

### Requirement: K 线读取量上限

系统 SHALL 对 `GET /candles` 的 `limit` 施加与 `GET /candles/recent` 一致的上界：`limit` 小于 1 或大于 500 时 MUST 返回结构化的 422 错误，MUST NOT 静默截断或按超限值读取。默认 `limit` 保持 500，合法范围内的请求行为不变。

#### Scenario: 超限 limit 被拒绝

- **WHEN** 以大于 500 的 `limit` 请求 `GET /candles`
- **THEN** 系统 SHALL 返回 422 与结构化错误信息
- **AND** MUST NOT 按该超限值读取存储

#### Scenario: 合法 limit 正常返回

- **WHEN** 以 1..500 之间的 `limit` 请求 `GET /candles`
- **THEN** 系统 SHALL 返回不超过该数量的 OHLCV 数据

### Requirement: 后台任务有界保留

系统 SHALL 将回测/拉取后台任务的状态字典限制在固定数量上限内，采用最旧优先的淘汰策略。被淘汰任务的查询 MUST 返回结构化的 404，MUST NOT 导致进程内任务状态无限增长。

#### Scenario: 超过上限时淘汰最旧任务

- **WHEN** 后台任务数量达到上限后再次提交新任务
- **THEN** 系统 SHALL 淘汰最早创建的任务状态
- **AND** SHALL 保留新任务可查询

#### Scenario: 查询已淘汰任务

- **WHEN** 查询一个已被淘汰的任务 id
- **THEN** 系统 SHALL 返回结构化的 404
