## Why

仓库当前没有任何 CI、静态检查、覆盖率或提交门禁，质量完全依赖开发者自觉：

- 仓库根**无** `.github/`、**无** `.gitlab-ci.yml`、**无** pre-commit 配置。
- `backend/pyproject.toml` **无** ruff/lint 配置、**无** coverage 配置；`frontend` **无** eslint/prettier/biome 配置，`package.json` **无** lint 脚本。
- 后端**无** lockfile（`backend/uv.lock` 不存在）；两端均**无**覆盖率工具（`pytest-cov` 未安装、`@vitest/coverage-*` 不在依赖中）。

因此格式/静态缺陷只能在人工评审阶段发现，回归是否执行无法强制。同时存在明确的仓库卫生问题：

- 1.87MB 构建产物 `build_ap_cmh.json` 被 git 跟踪（`git ls-files` 确认）。
- `backend/.env.example` 缺失 README 环境变量表中约 10 个变量（`MD_CATEGORIES`、`MD_REST_CANDLE_PAGE_LIMIT`、`MD_V3_CANDLE_PAGE_LIMIT`、`MD_BACKFILL_PAGE_DELAY`、`MD_NEWS_POLL_SECONDS`、`MD_NEWS_BUFFER_SIZE`、`MD_WS_PUBLIC_URL`、`MD_WS_HEARTBEAT_SECONDS`、`MD_WS_RECONNECT_SECONDS`、`MD_BLOCKBEATS_REFRESH_HOUR` / `MINUTE`）。
- `.omo/` 既未被跟踪也未被 `.gitignore` 忽略。
- `docs/` 是空目录，却被 README 项目结构列为"文档（待补充）"。

## What Changes

- **CI（GitHub Actions，`.github/workflows/ci.yml`）**：push/PR 触发。后端 job 使用 Python 3.11 + `uv sync --frozen`（配合新生成的 `backend/uv.lock`）；前端 job 使用 Node 20 + `npm ci`。marker 矩阵：单元回归 `pytest -q`（`live`/`online` 自动跳过）、L1 `pytest -m integrity`、L2 `pytest -m live --run-live` 独立 job、`online` 子集保持跳过（不加 `--run-online`）。
- **后端 lint**：`backend/pyproject.toml` 增加 `[tool.ruff]`（lint + format），策略为"能自动修复的先修，无法修复的按规则 ignore 或用 `# noqa` 标注并说明"。
- **前端 lint**：引入 **Biome**（单工具 lint + format，替代 eslint+prettier 组合），排除 `frontend/vendor/**`、`dist`、`node_modules`；新增 `lint` / `format` / `format:check` 脚本。
- **覆盖率**：后端增加 `pytest-cov`（`--cov=market_data`）与初始阈值；前端增加 `@vitest/coverage-v8` 与初始阈值。阈值采取"先低后棘轮"：先测基线，再把门禁设到基线附近（不高于基线），后续逐步提高。
- **pre-commit**（`.pre-commit-config.yaml`）：ruff + ruff-format（后端）+ Biome（前端）。
- **可复现依赖**：生成并提交 `backend/uv.lock`；CI 用 `uv sync --frozen`。
- **卫生修复**：从 git 移除 `build_ap_cmh.json`（`git rm --cached`）并加入 `.gitignore`；补齐 `backend/.env.example` 缺失变量；`.omo/` 加入 `.gitignore`；从 README 项目结构移除空 `docs/` 条目。
- 本变更不修改任何应用逻辑代码（`backend/src/**`、`frontend/src/**` 的业务代码不动；仅测试/配置/文档）。

## Capabilities

### New Capabilities
- `ci-quality-gates`: 持续集成流水线与质量门禁——CI workflow 的 marker 矩阵、ruff/Biome 静态检查、双端覆盖率阈值、pre-commit、基于 lockfile 的可复现构建。
- `repo-hygiene`: 仓库卫生契约——构建产物不入库、`.gitignore` 覆盖本地/CI 产物、`.env.example` 与 README 环境变量表同步、README 项目结构与实际目录一致。

### Modified Capabilities
- (none)

## Impact

- **新增文件**：`.github/workflows/ci.yml`、`.pre-commit-config.yaml`、`frontend/biome.json`、`backend/uv.lock`。
- **修改文件**：`backend/pyproject.toml`（ruff + coverage + dev 依赖）、`frontend/package.json`（Biome/coverage 依赖与脚本）、`frontend/vite.config.ts`（coverage 配置）、`.gitignore`、`backend/.env.example`、`README.md`。
- **依赖**：新增开发依赖 `ruff`、`pytest-cov`（后端）与 `@biomejs/biome`、`@vitest/coverage-v8`（前端）；不改变运行时依赖。
- **行为**：PR/push 触发 lint、typecheck、单元测试、L1、L2、覆盖率门禁；`online` 用例保持 skip，不外联。
- **依赖顺序（重要）**：本变更与 `wire-orchestration-runtime` 都要修改 `backend/.env.example` 与 README 环境变量表（后者新增 `MD_AGENT_SCHEDULE_ENABLED`）。建议 `wire-orchestration-runtime` **先合入**，本变更随后以 `config.py` 的实际 `Settings` 字段为准做一次全量同步（含 `MD_AGENT_SCHEDULE_ENABLED`），避免互相覆盖。
- **风险**：ruff/Biome 首次启用会对既有代码产生大量告警，采用"自动修复 + 基线 ignore + 棘轮收口"的渐进策略，避免一次性巨大 diff 阻塞评审。
