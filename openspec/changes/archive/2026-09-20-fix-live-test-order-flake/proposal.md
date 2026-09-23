## Why

后端单元回归命令 `python -m pytest -q -m "not integrity and not live and not online"`（以及 README/AGENTS.md 记录的 `python -m pytest -q` 全量回归）在本地稳定复现 **332 passed, 47 errors**：47 个 error 全部是 L2 `live_api` / `live_ws` 用例的 `live_server` fixture setup 失败，报 `live server failed to start`；但捕获的 uvicorn 日志中已出现 `Application startup complete` / `Uvicorn running on ...`。根因有二：

1. **选择策略失效（主因）**：`backend/tests/test_live_api.py` 与 `test_live_ws.py` 均未声明 `pytestmark = pytest.mark.live`，`pyproject.toml` 中声明的 `live` marker 形同虚设，`-m "not live"` 根本无法排除 L2 用例。这些重型子进程用例被排在 332 个单测之后执行，在内存/IO 压力下冷启动（导入 vectorbt / sklearn / numba）耗时逼近甚至超过 fixture 写死的 45s 就绪上限，于是超时失败。
2. **就绪判定过紧且缺诊断**：`live_server`（`backend/tests/conftest.py:119-177`）仅以固定 `deadline = time.time() + 45` 轮询 `/health`，既不自适应也不解析 uvicorn 日志，`pytest.fail` 读日志时进程其实已启动完毕。

对照证据：单独执行 `pytest tests/test_live_api.py tests/test_live_ws.py` 为 **47 passed, 3 skipped, 41.8s**，其中单个冷启动用例 38.8s——说明 L2 本身可用，问题出在**用例未被正确选择 + 固定超时过紧**，而非应用缺陷。

## What Changes

- 为 `backend/tests/test_live_api.py`、`backend/tests/test_live_ws.py` 增加 `pytestmark = pytest.mark.live`，使 `live` marker 真正生效，`-m "not live"` 能正确排除 L2。
- 新增 `--run-live` 命令行开关（与既有 `--run-online` 对称）：未显式传入时，`live` 标记用例在 collection 阶段被自动跳过。据此 `python -m pytest -q`（文档中的单元回归）不再隐式拉起重型 uvicorn 子进程，快速且稳定为绿；L2 由显式命令触发。
- 重构 `live_server` fixture 就绪判定为**流式 + 自适应**：在轮询 `/health` 的同时解析 uvicorn 日志中的 `Uvicorn running on http://...`（任一路径命中即就绪），等待上限显著放宽并命中即返回；失败时输出含 elapsed、`proc.poll()` 状态、日志尾部的诊断信息。
- 强化 teardown：`terminate → wait(timeout) → kill` 并确保关闭日志文件句柄，杜绝子进程/句柄泄漏。
- 同步文档命令：AGENTS.md / README 的 L2 命令更新为显式 `--run-live` 形式，并明确单元回归与 L1/L2 的 marker 矩阵。
- **不修改任何应用代码**（`backend/src/**` 不动）。

## Capabilities

### New Capabilities
- `e2e-test-infra`: L2 共享测试基础设施的规格——`live_server` fixture 的启动/就绪（流式 + 自适应）/诊断/清理契约，以及 L2 用例选择策略（`live` marker + `--run-live` 显式触发）。该契约被 `e2e-live-api` 与 `e2e-live-ws` 共同复用。

### Modified Capabilities
- `e2e-live-api`: 修正"真实进程 HTTP 测试"中过时且与实现不符的就绪描述（原文写 15s 超时，实现为 45s），改为引用 `e2e-test-infra` 的自适应就绪契约。

## Impact

- **代码（仅测试/文档）**：`backend/tests/conftest.py`（fixture 就绪判定 + `--run-live` 选项 + 清理）；`backend/tests/test_live_api.py`、`backend/tests/test_live_ws.py`（新增 `pytestmark`）；`AGENTS.md`、`README.md`（测试命令列表）。
- **配置**：`backend/pyproject.toml` 的 `live` marker 声明保持不变（本变更使其真正被使用）。
- **API / 依赖**：无变化，不新增第三方依赖。
- **行为**：`python -m pytest -q` 从"隐式运行 L2 且失败"变为"跳过 L2、快速通过"；L2 通过 `python -m pytest -m live --run-live` 显式运行，仍为 47 passed。
- **风险**：低。`--run-live` 使 L2 默认跳过，需确保文档命令同步更新，避免 L2 被长期遗忘（由 tasks 中的验证步骤兜底）。
