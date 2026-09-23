## MODIFIED Requirements

### Requirement: 真实进程 HTTP 测试
测试系统 SHALL 提供一个 `live_server` fixture：以隔离的数据目录（`MD_DATA_DIR=<tmp>`，并设 `MD_SCHEDULE_INTERVAL_SECONDS=0`）启动真实 uvicorn 进程，暴露真实 HTTP 端口，供全端点测试直连。fixture 的启动、就绪判定、失败诊断与 teardown 契约 SHALL 遵循 `e2e-test-infra` 能力——就绪 SHALL 为流式且自适应（`/health` 权威信号 + uvicorn 日志加速信号，命中即返回，上限显著高于冷启动耗时），SHALL NOT 使用固定 15 秒上限。fixture SHALL 在 teardown 时彻底终止进程并关闭日志句柄。

#### Scenario: 启动并就绪
- **WHEN** `live_server` fixture 被请求
- **THEN** fixture SHALL 启动 uvicorn，并按 `e2e-test-infra` 的自适应就绪契约等待至 `/health` 返回 200（或日志确认 `Uvicorn running on`），然后 yield 服务基地址
- **AND** 就绪等待 SHALL NOT 因固定 15 秒上限而失败

#### Scenario: 干净清理
- **WHEN** 使用该 fixture 的测试结束
- **THEN** fixture SHALL 终止 uvicorn 进程并回收临时数据目录
