## ADDED Requirements

### Requirement: 真实进程 HTTP 测试
测试系统 SHALL 提供一个 `live_server` fixture：以隔离的数据目录（`MD_DATA_DIR=<tmp>`）启动真实 uvicorn 进程，暴露真实 HTTP 端口，供全端点测试直连。fixture SHALL 保证进程就绪（`/health` 轮询）并在 teardown 时彻底终止。
#### Scenario: 启动并就绪
- **WHEN** `live_server` fixture 被请求
- **THEN** fixture SHALL 启动 uvicorn、轮询 `/health` 至就绪（15s 超时），并 yield 服务基地址

#### Scenario: 干净清理
- **WHEN** 使用该 fixture 的测试结束
- **THEN** fixture SHALL 终止 uvicorn 进程并回收临时数据目录

### Requirement: 全 REST 端点成功路径覆盖
测试 SHALL 对全部 33 个 REST 端点逐一验证成功路径：`/health`、`/candles`、`/candles/recent`、`/candles/backfill`、`/analyze`、`/levels`、`/structure`、`/backtest`、`/jobs/{id}`、`/tickers`、`/books/{cat}/{sym}`、`/trades/{cat}/{sym}`、`/funding`、`/mark-price`、`/instruments`、`/config`（GET/PUT）、`/chart-config`（GET/PUT）、`/alerts`（CRUD）、`/agent/decide`、`/agent/cycle`、`/portfolio`、`/journal`、`/control`、`/order`、`/order/confirm`、`/blockbeats/newsflash/{type}`、`/blockbeats/data/{endpoint}`。
#### Scenario: 每个端点返回预期结构
- **WHEN** 对真实进程发起各端点成功请求
- **THEN** 响应 SHALL 为 2xx 且载荷结构与既有 `api/types.ts` / webapi 定义一致（关键字段存在）

#### Scenario: 数据变更端点可回读
- **WHEN** 通过 PUT/POST 修改配置、图表配置、告警、订单/确认
- **THEN** 后续 GET 或状态端点 SHALL 反映变更结果（roundtrip 成立）

### Requirement: 错误路径覆盖
测试 SHALL 覆盖主要错误路径：非法 timeframe/category 400、未知 symbol 空结果、超限参数 422、未知告警 id 404、blockbeats 未支持端点 400。
#### Scenario: 参数校验错误
- **WHEN** 发送非法参数（如不存在的 timeframe）
- **THEN** 响应 SHALL 为 4xx 并携带可解析的错误信息

### Requirement: 离线可运行
除显式标记为 `--live` 的用例外，L2 API 测试 SHALL 在无外部网络（Bitget/BlockBeats/LLM）环境下全部通过：历史与回填基于种子 parquet，告警/配置基于临时存储，agent 基于确定性 RuleBasedProvider。
#### Scenario: 断网运行
- **WHEN** 在无外网环境执行 L2 测试
- **THEN** 非 `--live` 用例 SHALL 全部通过，`--live` 用例 SHALL 被 skipif 跳过而非失败
