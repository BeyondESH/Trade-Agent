## 1. 就绪判定与清理（`backend/tests/conftest.py`）

- [x] 1.1 `_spawn_live` 显式持有并返回日志文件句柄（与 `proc`、`log_path` 一并返回），供 teardown 关闭
- [x] 1.2 新增 `_wait_for_ready(base, proc, log_path, timeout) -> tuple[bool, float, str]`：每 0.2s 轮询 `/health`，同时读取日志尾部匹配 `Uvicorn running on`；任一路径确认即返回 `(True, elapsed, tail)`
- [x] 1.3 `live_server` 将固定 `deadline = time.time() + 45` 替换为自适应上限 `int(os.environ.get("MD_TEST_SERVER_START_TIMEOUT", "180"))`，命中即返回
- [x] 1.4 就绪成功时 `logger.info("live server ready in %.1fs: %s", elapsed, base)`
- [x] 1.5 就绪失败时 `pytest.fail` 载荷包含 elapsed、`proc.poll()`（返回码）、base URL 与日志尾部（末尾 3000 字符）
- [x] 1.6 进程提前退出（`proc.poll() is not None`）时快速失败，诊断含退出码与日志尾部
- [x] 1.7 teardown 强化：`terminate()` → `wait(timeout=5)` → 超时 `kill()` → 再次 `wait()`，并 `log_fh.close()`，全部置于 `finally`

## 2. L2 选择策略

- [x] 2.1 `pytest_addoption` 新增 `--run-live`（`action="store_true"`, default `False`），与既有 `--run-online` 对称
- [x] 2.2 `pytest_collection_modifyitems` 中：未传 `--run-live` 时对 `live` 标记用例 `add_marker(pytest.mark.skipif(True, reason="--run-live not passed; L2 live subset disabled"))`
- [x] 2.3 `backend/tests/test_live_api.py` 顶部新增 `pytestmark = pytest.mark.live`
- [x] 2.4 `backend/tests/test_live_ws.py` 顶部新增 `pytestmark = pytest.mark.live`
- [x] 2.5 确认 `backend/pyproject.toml` 的 `[tool.pytest.ini_options].markers` 已声明 `live`（已存在，无需改动）

## 3. 文档同步

- [x] 3.1 `AGENTS.md` 测试表：L2 命令改为 `cd backend && python -m pytest -m live --run-live`；单元回归注明 live 自动跳过
- [x] 3.2 `README.md` 测试小节同步 L1/L2/单元命令，并说明 `--run-live` 与 `--run-online`
- [x] 3.3 确认文档中不再出现会隐式运行/失败 L2 的旧命令

## 4. 验证

- [x] 4.1 `cd backend && .venv\Scripts\python.exe -m pytest -q` → 期望无 error（live 被跳过），退出码 0
- [x] 4.2 `cd backend && .venv\Scripts\python.exe -m pytest -q -m "not integrity and not live and not online"` → 期望 332 passed、0 error
- [x] 4.3 `cd backend && .venv\Scripts\python.exe -m pytest -q --collect-only -m "not live"` → 期望收集到的 L2 用例数为 0
- [x] 4.4 `cd backend && .venv\Scripts\python.exe -m pytest -m live --run-live` → 期望 47 passed、3 skipped，并记录冷启动 elapsed
- [x] 4.5 执行 `Get-Process python`（或任务管理器）确认无遗留 uvicorn 子进程
