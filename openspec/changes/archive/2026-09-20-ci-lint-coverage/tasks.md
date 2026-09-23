## 1. 依赖与 lockfile

- [x] 1.1 在 `backend/pyproject.toml` 增加 dev 依赖组（`pytest`、`pytest-cov`、`httpx`、`ruff`），并确认运行时依赖不变
- [x] 1.2 运行 `cd backend && uv lock` 生成 `backend/uv.lock` 并提交
- [x] 1.3 在 `frontend/package.json` 增加开发依赖 `@biomejs/biome`、`@vitest/coverage-v8`
- [x] 1.4 运行 `cd frontend && npm install` 更新 `frontend/package-lock.json`

## 2. 后端静态检查（ruff）

- [x] 2.1 在 `backend/pyproject.toml` 增加 `[tool.ruff]`（`line-length = 100`、`target-version = "py311"`）与 `[tool.ruff.lint]`（`select = ["E","F","I","UP","B"]`）
- [x] 2.2 运行 `cd backend && uv run ruff check --fix .` 自动修复可修复项
- [x] 2.3 对无法一次性清理的规则在配置中 `ignore` 并附注释说明原因与收敛计划；剩余单点问题用 `# noqa: <code>` 标注
- [x] 2.4 运行 `cd backend && uv run ruff format .`（独立"格式化"提交，避免与逻辑改动混合）
- [x] 2.5 验证：`cd backend && uv run ruff check .` 与 `uv run ruff format --check .` 均通过

## 3. 前端静态检查（Biome）

- [x] 3.1 新增 `frontend/biome.json`：启用 formatter 与 linter（含 react/suspicious 规则），`files.includes` 排除 `vendor/**`、`dist/**`、`node_modules/**`、`package-lock.json`
- [x] 3.2 在 `frontend/package.json` 增加脚本 `"lint": "biome check ."`、`"format": "biome format --write ."`、`"format:check": "biome format ."`
- [x] 3.3 运行 `cd frontend && npx biome check --write .` 自动修复（独立"格式化"提交）
- [x] 3.4 对无法一次性清理的规则在 `biome.json` 中按规则降级/忽略并附注释
- [x] 3.5 验证：`cd frontend && npm run lint` 与 `npm run format:check` 均通过

## 4. 覆盖率门禁

- [x] 4.1 在 `backend/pyproject.toml` 增加 `[tool.coverage.run] source = ["market_data"]` 与 `[tool.coverage.report]`
- [x] 4.2 运行 `cd backend && uv run pytest -q --cov=market_data --cov-report=term-missing` 记录基线覆盖率
- [x] 4.3 将 `fail_under` 设为基线向下取整到 5 的倍数（不高于基线），并记录该值与"只升不降"策略
- [x] 4.4 在 `frontend/vite.config.ts` 的 `test.coverage` 开启 `provider: "v8"`、`reporter: ["text","html"]` 与 thresholds
- [x] 4.5 运行 `cd frontend && npx vitest run --coverage` 记录基线，将 thresholds 设为不高于基线的值
- [x] 4.6 在 `frontend/package.json` 增加 `"test:coverage": "vitest run --coverage"`

## 5. CI 工作流

- [x] 5.1 新增 `.github/workflows/ci.yml`：`on: [push, pull_request]`
- [x] 5.2 后端主 job：Python 3.11 + `astral-sh/setup-uv` + `uv sync --frozen`，依次运行 `uv run pytest -q` 与 `uv run pytest -m integrity`
- [x] 5.3 后端 lint 步骤：`uv run ruff check .` 与 `uv run ruff format --check .`
- [x] 5.4 后端 L2 独立 job：`uv run pytest -m live --run-live`（依赖 `fix-live-test-order-flake` 已合入；未合入时回退为 `uv run pytest tests/test_live_api.py tests/test_live_ws.py`）
- [x] 5.5 前端 job：Node 20 + `npm ci`，依次运行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:coverage`
- [x] 5.6 确认 workflow 中**不含** `--run-online`（online 子集保持 skip）
- [x] 5.7 在 workflow 注释中说明 Playwright E2E（`npm run test:e2e`）需安装浏览器，本变更暂不纳入 CI

## 6. pre-commit

- [x] 6.1 新增 `.pre-commit-config.yaml`：`astral-sh/ruff-pre-commit`（`ruff` + `ruff-format`，`files: ^backend/`）与 Biome hook（`files: ^frontend/`）
- [x] 6.2 运行 `pre-commit run --all-files` 确认钩子通过且与 CI 版本一致

## 7. 仓库卫生

- [x] 7.1 运行 `git rm --cached build_ap_cmh.json`（保留工作区文件）并在 `.gitignore` 增加对应模式
- [x] 7.2 在 `.gitignore` 增加 `.omo/`
- [x] 7.3 以 `backend/src/market_data/config.py` 的 `Settings` 为事实源，补齐 `backend/.env.example` 缺失变量：`MD_CATEGORIES`、`MD_REST_CANDLE_PAGE_LIMIT`、`MD_V3_CANDLE_PAGE_LIMIT`、`MD_BACKFILL_PAGE_DELAY`、`MD_NEWS_POLL_SECONDS`、`MD_NEWS_BUFFER_SIZE`、`MD_WS_PUBLIC_URL`、`MD_WS_HEARTBEAT_SECONDS`、`MD_WS_RECONNECT_SECONDS`、`MD_BLOCKBEATS_REFRESH_HOUR` / `MD_BLOCKBEATS_REFRESH_MINUTE`
- [x] 7.4 与 `wire-orchestration-runtime` 协调：合入后同步加入 `MD_AGENT_SCHEDULE_ENABLED`（默认 `false`）到 `.env.example` 与 README 环境变量表
  - 实施记录：由 `wire-orchestration-runtime` 任务 1.2/1.3 完成；已核验 `backend/.env.example` 含 `MD_AGENT_SCHEDULE_ENABLED=false`、README 环境变量表含对应行。
- [x] 7.5 逐项核对 `.env.example` ↔ `config.py` `Settings` ↔ README 环境变量表三者变量名与默认值一致
- [x] 7.6 从 README"项目结构"移除空目录 `docs/` 条目（权威文档来源为 `openspec/`）

## 8. 验证

- [x] 8.1 `cd backend && uv sync --frozen && uv run ruff check . && uv run pytest -q && uv run pytest -m integrity` 全部通过
- [x] 8.2 `cd backend && uv run pytest -m live --run-live` 通过
- [x] 8.3 `cd frontend && npm ci && npm run lint && npm run typecheck && npm run test && npm run test:coverage` 全部通过
- [x] 8.4 `git ls-files --error-unmatch build_ap_cmh.json` 返回非零（未被跟踪）；`git check-ignore .omo` 有输出（已被忽略）
- [x] 8.5 本地 `pre-commit run --all-files` 通过
- [ ] 8.6 [搁置：本会话不 push；workflow 已就绪，推送后验证] 推送分支确认 GitHub Actions 全部 job 为绿
