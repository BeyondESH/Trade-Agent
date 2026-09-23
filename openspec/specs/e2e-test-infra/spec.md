# e2e-test-infra Specification

## Purpose
TBD - created by archiving change fix-live-test-order-flake. Update Purpose after archive.
## Requirements
### Requirement: live_server 启动与自适应就绪

测试系统 SHALL 提供 session 级 `live_server` fixture，在隔离数据目录（`MD_DATA_DIR=<tmp>`）与关闭增量调度（`MD_SCHEDULE_INTERVAL_SECONDS=0`）的前提下启动真实 uvicorn 子进程，并 yield 真实基地址 `http://127.0.0.1:{port}`。就绪判定 SHALL 采用双通道：既轮询 `/health`（权威信号），又读取子进程日志中的 `Uvicorn running on`（加速与诊断信号），任一路径确认即视为就绪。就绪等待 SHALL 为自适应——具备明确上限且命中即返回，上限 MUST 显著高于实测冷启动时长（默认 ≥120 秒），并 SHALL 可通过环境变量覆盖。fixture 在就绪成功时 SHALL 记录冷启动 elapsed。

#### Scenario: 冷启动在压力下仍就绪
- **WHEN** `live_server` fixture 在一次已执行大量前置单测的会话中被请求，且冷启动耗时接近或超过旧固定上限
- **THEN** fixture SHALL 在自适应上限内等待至 `/health` 返回 200（或日志确认 `Uvicorn running on`），并 yield 基地址
- **AND** fixture SHALL NOT 因固定 45 秒上限而失败

#### Scenario: 命中即返回
- **WHEN** uvicorn 在远短于上限的时间内完成启动
- **THEN** fixture SHALL 在确认就绪后立即返回，SHALL NOT 等待至上限耗尽
- **AND** fixture SHALL 记录本次冷启动 elapsed

#### Scenario: 就绪超时失败带诊断
- **WHEN** uvicorn 在上限内仍未就绪
- **THEN** fixture SHALL fail，且失败信息 SHALL 包含 elapsed、子进程状态（`poll()`/退出码）、基地址与 uvicorn 日志尾部

#### Scenario: 子进程提前退出快速失败
- **WHEN** uvicorn 进程在就绪前退出（如端口冲突）
- **THEN** fixture SHALL 尽快 fail，并 SHALL 在诊断中包含退出码与日志尾部，而非空等到上限

### Requirement: live_server 确定性清理

`live_server` fixture 的 teardown SHALL 确保子进程被终止且不残留孤儿进程：先 `terminate`，在有限时间内 `wait`，超时则 `kill` 并再次 `wait`。teardown SHALL 关闭重定向的日志文件句柄。

#### Scenario: 正常清理
- **WHEN** 使用该 fixture 的测试全部结束
- **THEN** fixture SHALL 终止 uvicorn 子进程、关闭日志句柄，SHALL NOT 遗留运行中的子进程

#### Scenario: 僵死进程强制清理
- **WHEN** `terminate` 后子进程在等待窗口内未退出
- **THEN** fixture SHALL `kill` 该进程并回收，SHALL NOT 因清理异常掩盖测试结果

### Requirement: L2 用例选择策略

L2 用例模块（`tests/test_live_api.py`、`tests/test_live_ws.py`）SHALL 声明 `live` marker。测试系统 SHALL 提供 `--run-live` 命令行开关；未显式传入时，`live` 标记用例 SHALL 在 collection 阶段被跳过，且 SHALL NOT 实例化 `live_server` fixture（不启动重型 uvicorn 子进程）。传入 `--run-live` 时，`live` 标记用例 SHALL 正常执行。

#### Scenario: 默认跳过 L2
- **WHEN** 执行 `python -m pytest -q` 且未传 `--run-live`
- **THEN** `live` 标记用例 SHALL 被 skip，且 SHALL NOT 启动 uvicorn 子进程

#### Scenario: marker 过滤生效
- **WHEN** 执行 `python -m pytest -q -m "not live"` 且未传 `--run-live`
- **THEN** `live` 标记用例 SHALL 被排除，收集结果 SHALL NOT 包含任何 L2 用例

#### Scenario: 显式运行 L2
- **WHEN** 执行 `python -m pytest -m live --run-live`
- **THEN** 全部 `live` 标记用例 SHALL 执行并共享同一个 `live_server` 实例

### Requirement: 测试命令与 marker 策略一致

仓库文档（`AGENTS.md`、`README.md`）SHALL 记录与 marker 策略一致的命令矩阵：单元回归 `python -m pytest -q`（L2 自动跳过）、L1 `python -m pytest -m integrity`、L2 `python -m pytest -m live --run-live`、online 子集需 `--run-online`。文档中 SHALL NOT 保留会隐式失败或与实现不符的 L2 命令。

#### Scenario: 文档命令可直接执行
- **WHEN** 核对文档并逐条执行单元回归、L1、L2 命令
- **THEN** 各命令 SHALL 与文档描述的行为一致（单元回归不启动 L2；L2 显式运行时通过）

