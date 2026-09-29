# e2e-live-api Specification (delta)

## MODIFIED Requirements

### Requirement: 全 REST 端点成功路径覆盖
测试 SHALL 对保留下来的全部 21 个 REST 端点逐一验证成功路径：`/health`、`/candles`、`/candles/recent`、`/candles/backfill`、`/analyze`、`/levels`、`/structure`、`/tickers`、`/books/{cat}/{sym}`、`/trades/{cat}/{sym}`、`/funding`、`/mark-price`、`/instruments`、`/chart-config`（GET/PUT）、`/alerts`（CRUD）、`/blockbeats/newsflash/{type}`、`/blockbeats/data/{endpoint}`。已移除的端点（`/backtest`、`/jobs/{id}`、`/config`、`/agent/*`、`/portfolio`、`/journal`、`/control`、`/order`、`/order/confirm`）MUST NOT 再被覆盖。
#### Scenario: 每个端点返回预期结构
- **WHEN** 对真实进程发起各端点成功请求
- **THEN** 响应 SHALL 为 2xx 且载荷结构与既有 `api/types.ts` / webapi 定义一致（关键字段存在）

#### Scenario: 数据变更端点可回读
- **WHEN** 通过 PUT/POST 修改图表配置、告警
- **THEN** 后续 GET 或状态端点 SHALL 反映变更结果（roundtrip 成立）

### Requirement: 离线可运行
除显式标记为 `--live` 的用例外，L2 API 测试 SHALL 在无外部网络（Bitget/BlockBeats）环境下全部通过：历史与回填基于种子 parquet，告警/图表配置基于临时存储。原依赖确定性 RuleBasedProvider 的 agent 用例已随自定义 Agent 层移除。
#### Scenario: 断网运行
- **WHEN** 在无外网环境执行 L2 测试
- **THEN** 非 `--live` 用例 SHALL 全部通过，`--live` 用例 SHALL 被 skipif 跳过而非失败
