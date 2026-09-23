## Context

L2 测试（`backend/tests/test_live_api.py` / `test_live_ws.py`）是唯一需要真实 uvicorn 子进程的层，共享 `backend/tests/conftest.py` 的 session 级 `live_server` fixture。fixture 现有实现（`conftest.py:105-177`）：

- `_spawn_live`：`subprocess.Popen(uvicorn ...)`，stdout/stderr 重定向到 `${MD_DATA_DIR}/uvicorn.log`，cwd 为 `backend/`。
- `live_server`：`tmp_path_factory.mktemp` 建数据目录 → 播种 parquet → `_free_port()` → 设 `MD_DATA_DIR` / `MD_SCHEDULE_INTERVAL_SECONDS=0` / `MD_LOG_LEVEL=WARNING` → 启动 → `deadline = time.time() + 45` 固定上限轮询 `/health`（0.25s 间隔，1.0s 超时）→ 超时则读日志尾部并 `pytest.fail`。
- teardown：`proc.terminate()` → `wait(5)` → 超时 `kill()`（日志文件句柄未显式关闭）。

复现证据（两次）：

- `pytest -q -m "not integrity and not live and not online"` → **332 passed, 47 errors**，47 个 error 均为 `live_server` setup "live server failed to start"，但日志含 `Application startup complete` / `Uvicorn running on ...`。
- `pytest tests/test_live_api.py tests/test_live_ws.py` → **47 passed, 3 skipped, 41.8s**，单用例最长 38.8s（首个使用 session fixture 的用例 = 冷启动）。

关键约束：本变更**不得修改应用代码**（`backend/src/**`），只能在测试基础设施/文档层修复。

## Goals / Non-Goals

**Goals:**
- `python -m pytest -q` 稳定为绿，且不再隐式拉起重型 uvicorn 子进程。
- `python -m pytest -q -m "not integrity and not live and not online"` 稳定为 332 passed、0 error。
- L2 通过显式命令稳定运行（47 passed），冷启动不再受固定 45s 上限约束。
- `live` marker 真正生效；就绪判定具备诊断信息与确定性清理。

**Non-Goals:**
- 不优化应用启动耗时（例如惰性导入 vectorbt/sklearn/numba）——属应用代码，超出范围。
- 不改动 L1（integrity）与 `online` 子集的既有语义。
- 不新增第三方依赖。

## 调查方法（Investigation Method）

按以下可复现步骤定位根因，设计阶段与实现后各执行一次并对照：

1. **给子进程日志打时间戳**：uvicorn 自身日志已含时间戳；在 fixture 内记录 `t_spawn`、每次轮询的 `t_poll`、`ready` 时刻的 `t_ready`，输出 `cold_start = t_ready - t_spawn`。
2. **对照两种执行顺序的冷启动耗时**：
   - 单独运行 L2（无前置压力）→ 观察 `cold_start`（实测 ≈38s）。
   - 在 332 个单测之后运行 L2（内存/IO 压力）→ 观察 `cold_start` 是否 ≥45s。
3. **区分"进程未存活" vs "进程存活但未监听"**：就绪失败时打印 `proc.poll()`。若 `poll() is None` 且日志已出现 `Uvicorn running on`，说明是**超时阈值过紧**（本案例），而非端口冲突/进程崩溃。
4. **验证选择策略缺陷**：检查两个 L2 模块是否有 `pytestmark`；用 `pytest --collect-only -q -m "not live"` 统计被选中的 L2 用例数——修复前应仍收集到 L2 用例（证明 `live` marker 未生效），修复后应为 0。
5. **自适应等待验证**：把上限改为自适应后，重复步骤 2，确认两种顺序下均命中即返回、无超时。

## Decisions

**决策 1：就绪判定改为"日志流式信号 + `/health` 轮询"双通道**

在轮询 `/health` 的同时读取 `${MD_DATA_DIR}/uvicorn.log` 尾部，匹配 `Uvicorn running on`（uvicorn 绑定端口后输出）。`/health` 是**权威**信号，日志是**加速 + 诊断**信号，二者任一确认即视为就绪。

- 理由：日志行出现代表 socket 已绑定，比首个成功 `/health` 更早；但日志可能被日志级别/缓冲影响，故不单独依赖它。
- 备选：只解析日志 → 若 uvicorn 日志格式/级别变化则脆弱，弃用。
- 备选：只轮询 `/health`（现状）→ 无加速、无法区分"未绑定/未启动"，诊断差。

**决策 2：固定 45s 上限改为自适应（默认 ≥120s，命中即返回）**

`timeout = int(os.environ.get("MD_TEST_SERVER_START_TIMEOUT", "180"))`；循环每 0.2s 检查一次，就绪即 break；仅当超时才失败。

- 理由：冷启动本质是"导入重型依赖（vectorbt/sklearn/numba）的时间"，随机器负载波动，固定值必然脆弱；自适应上限 + 命中即返回兼具鲁棒与速度。
- 备选：继续固定但调大到 120s → 失败时仍要等满 120s，反馈慢；自适应更优。
- 备选：预热导入（sessionstart 提前 import app）→ 会拖慢所有单测会话，且仍无法保证；弃用。

**决策 3：失败诊断信息结构化**

`pytest.fail` 载荷包含：`elapsed`、`proc.poll()`（含 returncode）、尝试的 base URL、日志尾部（末尾 ~3000 字符）。就绪成功时 `logger.info("live server ready in %.1fs: %s", elapsed, base)`。

- 理由：把"到底是没启动、启动慢、还是端口被占"一次性说清，避免再次出现"日志已启动却报失败"的误导。

**决策 4：L2 选择策略 = `live` marker + `--run-live` 显式触发（默认跳过）**

- 两个 L2 模块新增 `pytestmark = pytest.mark.live`。
- `pytest_addoption` 新增 `--run-live`（`action="store_true"`, default False），与既有 `--run-online` 对称。
- `pytest_collection_modifyitems` 中，未传 `--run-live` 时对 `live` 标记用例 `add_marker(pytest.mark.skipif(True, reason="--run-live not passed; L2 live subset disabled"))`。跳过发生在 collection 阶段，`live_server` fixture 不会被实例化，重型子进程根本不启动。
- 理由：直接消除"顺序/压力依赖"——单元回归与 L2 彻底解耦；`pytest -q` 快速、确定、可复现；L2 作为独立命令在干净进程中一次冷启动。这也是"可复现"的根本保证（仅靠调大超时仍受前序压力影响）。
- 备选：只加 marker、不默认跳过（`pytest -q` 仍包含 L2）→ 慢且仍可能因压力抖动，不满足"可复现"，弃用。
- 备选：用 `.ini` `addopts = -m "not live"` 统一排除 → 命令行 `-m` 覆盖 addopts 的语义较隐蔽，且会让"跑全部"变别扭；用与 `--run-online` 一致的显式开关更直观。

**决策 5：teardown 确定性清理**

`_spawn_live` 显式持有日志文件句柄；teardown 为 `proc.terminate()` → `wait(timeout=5)` → 超时 `kill()` → `wait()`，随后 `log_fh.close()`，全部包在 `finally` 中。

- 理由：Windows 下文件句柄未关闭会阻止临时目录清理；kill 后不 wait 会残留僵尸/孤儿进程。

**决策 6：capability 归属**

新增 `e2e-test-infra` 承载共享契约（fixture 生命周期 + 选择策略），并 MODIFIED `e2e-live-api` 修正其过时的 15s 描述。

- 理由：就绪/选择是 API 与 WS 共享的基础设施，重复写进两个 L2 spec 会漂移；`e2e-live-api` 的原文（"15s 超时"）与实现（45s）矛盾，属必须修正的直接冲突。
- `e2e-live-ws` 未描述就绪/选择行为，故不改（避免与 `spec-drift-cleanup` 重叠）。

## Risks / Trade-offs

- [`--run-live` 默认跳过导致 L2 被长期遗忘] → 文档命令列表显式列出 L2 命令；tasks 验证步骤要求实际执行 L2 并记录结果。
- [日志匹配字符串耦合 uvicorn 版本] → `/health` 为权威信号，日志仅加速/诊断；字符串失配时退化为纯轮询，不影响正确性。
- [自适应上限过大导致真正失败时等待过久] → 默认 180s 且可通过 `MD_TEST_SERVER_START_TIMEOUT` 调小；失败时立即带诊断输出。
- [加 `live` marker 后，仍有人用裸 `pytest -m live`（不带 `--run-live`）] → 结果会是 47 skipped，属预期（需 `--run-live`）；文档明确写出完整命令。

## Migration Plan

1. 修改 `conftest.py`（决策 1/2/3/5/4 的选项与跳过逻辑）。
2. 给两个 L2 模块加 `pytestmark`。
3. 更新 AGENTS.md / README 命令列表。
4. 依次执行 tasks 中的验证命令并记录结果（顺序：单元回归 → L1 → L2）。
5. 回滚策略：本变更仅测试/文档，回滚即 `git revert`；无数据/API 迁移。

## Open Questions

- 就绪自适应上限默认值取 180s 是否合适？（依据实测 ~38s 冷启动，180s 留 ~4.7x 余量；如 CI 更慢可调 `MD_TEST_SERVER_START_TIMEOUT`。）
- 是否在 Change 2 的 CI 中把 L2 作为独立 job 运行 `--run-live`？（建议是，交由 `ci-lint-coverage` 设计，避免与其 marker 矩阵冲突。）
