## Context

仓库（`git@github.com:BeyondESH/Trade-Agent.git`）为零门禁状态：无 CI、无 lint、无覆盖率、无 pre-commit、后端无 lockfile。需要在不引入运行时依赖、不重写业务代码的前提下，建立最小可用的质量门禁，并清理明确的卫生债。

约束：
- 后端 `requires-python = ">=3.11"`；前端 README 声明 Node ≥ 20，`frontend/package-lock.json` 已存在。
- 启用 lint 时既有代码会产生大量告警，必须控制首次 diff 的爆炸半径。
- `backend/.env.example` / README 环境变量表与 `wire-orchestration-runtime` 变更重叠。
- 后端测试的 `httpx` 并未在 `pyproject.toml` 依赖中声明，却被打包进测试——CI 必须显式声明，否则不可复现。

## Goals / Non-Goals

**Goals:**
- PR/push 自动执行：后端 lint + 单元回归 + L1（+ L2 独立 job）、前端 lint + typecheck + 单测 + 覆盖率。
- 两端有覆盖率门禁，初始阈值不高于当前基线（可棘轮提升）。
- 依赖可复现：后端 `uv.lock` + `uv sync --frozen`；前端 `npm ci`。
- 清理卫生债：构建产物不入库、`.gitignore` 完整、`.env.example` 同步、README 结构准确。

**Non-Goals:**
- 不追求一次性把覆盖率拉到高水平；不做全量重构以迎合 lint。
- 不在本变更修改业务逻辑（`backend/src/**`、`frontend/src/**` 行为不变）。
- 不启用 `online` 外网用例（保持 skip）。
- 不引入运行时依赖。

## Decisions

**决策 1：CI 平台 = GitHub Actions**

远程仓库在 GitHub，且根目录无任何 CI 配置。选择 `.github/workflows/ci.yml`。

- 备选：GitLab CI → 无 `.gitlab-ci.yml`、远程非 GitLab，弃用。

**决策 2：后端环境 = uv + 提交 `uv.lock` + `uv sync --frozen`**

`pyproject.toml` 已声明 `[tool.uv] package = true`，采用 uv 生成 lockfile 最自然；`--frozen` 保证 CI 与本地一致。Python 固定 3.11。

- 备选：裸 `pip install -e ".[dev]"` → 无锁、跨平台解析漂移；弃用。
- 备选：不锁 Python、跟随 `>=3.11` → CI 行为随 runner 漂移；固定 3.11。

**决策 3：后端 CI marker 矩阵**

| 目标 | 命令 | CI 中 |
|---|---|---|
| 单元回归 | `python -m pytest -q`（`live`/`online` 自动跳过，见 `fix-live-test-order-flake`） | ✅ 后端主 job |
| L1 integrity | `python -m pytest -m integrity` | ✅ 后端主 job（紧随单元之后或同 job 分步） |
| L2 live | `python -m pytest -m live --run-live` | ✅ 独立 job（较慢，约 40s+ 冷启动，隔离在干净进程） |
| online 外网 | 需 `--run-online` | ❌ 不加 flag，保持 skip |

- 理由：L1/L2 依赖 `fix-live-test-order-flake` 引入的 marker 语义；把 L2 独立成 job 可避免其重型 uvicorn 子进程与单元回归互相干扰，同时获得干净的冷启动。
- 依赖：本决策**强依赖** `fix-live-test-order-flake` 已落地（`live` marker + `--run-live`）。若后者未合入，CI 中 L2 必须回退为显式路径调用 `pytest tests/test_live_api.py tests/test_live_ws.py`。
- 备选：CI 只跑单元回归，L2 交由本地/夜间任务 → 门禁覆盖不足；弃用（改为独立 job）。

**决策 4：后端 lint = ruff（lint + format）**

`backend/pyproject.toml` 增加：

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
# 既有代码无法一次性清理的规则按需 ignore，并在注释中记录原因。
```

Fix-or-ignore 策略：先 `ruff check --fix` 自动修复可修复项；剩余告警逐条决定"修复 / 规则 ignore / 单点 `# noqa: <code>` 并加说明"。`ruff format` 作为独立格式化提交一次性归一，避免与逻辑改动混在一起。

- 理由：ruff 单工具同时覆盖 lint 与格式化，速度远快于 flake8+isort+black 组合，且对 Python 3.11 与既有代码兼容。
- 备选：flake8 + black + isort → 三套配置与依赖；弃用。

**决策 5：前端 lint = Biome（单工具 lint + format）**

引入 `@biomejs/biome`，`frontend/biome.json` 配置 linter（含 `react`/`suspicious` 域，覆盖 `useExhaustiveDependencies`、`useHookAtTopLevel`、`noArrayIndexKey`）与 formatter；`files.includes` 排除 `vendor/**`、`dist/**`、`node_modules/**`、`package-lock.json`。

- 理由：单一二进制/配置，避免 eslint flat config + prettier + 多个 plugin 的版本缠斗；对 TS/TSX/JSON 开箱即用。
- 代价：插件生态弱于 eslint（如 `eslint-plugin-react-hooks` 的边角规则）。缓解：若后续发现 hooks 规则缺口，可在 Biome 之上补充 eslint（增量，不阻塞本变更）。
- 备选：eslint + prettier → 配置面更大、依赖更多；弃用。

**决策 6：覆盖率 = 双端生成 + 低起点阈值（棘轮）**

- 后端：`pytest-cov`，`[tool.coverage.run] source = ["market_data"]`，`[tool.coverage.report] fail_under = <baseline>`。CI 产出 `term-missing`（+ 可选 `xml` 报告）。
- 前端：`@vitest/coverage-v8`，`vite.config.ts` 的 `test.coverage` 开启 `provider: "v8"`、`reporter: ["text", "html"]`、`thresholds` 设 lines/statements 阈值。
- 阈值规则：**先测基线，再设门禁**，`fail_under` = 基线向下取整到 5 的倍数（不高于基线），并记录于 README/设计说明，后续每个变更只升不降。
- 理由：一次性设高会立刻红灯并诱发"为覆盖率而测"；低起点 + 棘轮既建立门禁又不阻塞。

**决策 7：pre-commit = ruff + Biome**

`.pre-commit-config.yaml`：`astral-sh/ruff-pre-commit`（`ruff` + `ruff-format`，作用 `^backend/`）+ Biome hook（`biomejs/pre-commit`，作用 `^frontend/`）。pre-commit 与 CI 使用同一套工具与版本区间，避免"本地过、CI 挂"。

**决策 8：卫生修复**

- `build_ap_cmh.json`：`git rm --cached`（保留工作区文件），`.gitignore` 增加 `build_ap_cmh.json`（或更通用的 `*_cmh.json` / 构建产物模式）。
- `.omo/`：加入 `.gitignore`。
- `.env.example`：以 `backend/src/market_data/config.py` 的 `Settings` 字段为唯一事实源，补齐缺失变量并标注默认值与说明；与 README 环境变量表逐项对齐。
- `docs/`：选择**从 README 项目结构移除该条目**（目录为空且未跟踪；本项目的规格/设计文档以 `openspec/` 为事实源，不另设空目录造成误导）。
- 备选：创建 `docs/README.md` 索引 → 引入长期维护成本且当前无内容；弃用。
- 备选：保留条目 → 与实际不符的文档债；弃用。

**决策 9：`.env.example` 与 `wire-orchestration-runtime` 的协调**

`wire-orchestration-runtime` 会新增 `MD_AGENT_SCHEDULE_ENABLED` 并同样编辑 `.env.example`/README。决策：本变更**后置**，以合入后的 `config.py` 为准做全量同步（含该新变量）；若并行，则以 `config.py` 字段集合为基准做一次幂等同步，任一顺序都不丢变量。

## Risks / Trade-offs

- [首次启用 lint 产生数百条既有告警] → 分两步：`--fix` 自动修复 + 基线 ignore，剩余逐条 `noqa`；格式化单独提交，限制单次 diff。
- [覆盖率阈值设得高于基线导致 CI 从第一天就红] → 强制"先测基线后设阈值"，阈值 ≤ 基线。
- [CI 中 L2 依赖 change 1 的 `--run-live`] → 明确依赖顺序；未合入时回退显式路径调用。
- [`.env.example` 与 README 环境表随 `wire-orchestration-runtime` 并行修改冲突] → 以 `config.py` 为事实源做幂等同步，并约定合入顺序（见决策 9）。
- [Biome 的 React hooks 规则弱于 eslint] → 保留后续增补 eslint 的选项，不影响本变更落地。
- [移除 `docs/` 条目被视为"删文档"] → 目录本身为空，移除的是 README 中的误导性占位；在 README/变更说明中记录理由。

## Migration Plan

1. 先合入 `wire-orchestration-runtime`（或其环境变量部分）。
2. 生成 `backend/uv.lock`；补 dev 依赖（`pytest`、`pytest-cov`、`httpx`、`ruff`）。
3. 落地 ruff 配置 + 一次性 `--fix`/format 提交。
4. 落地 Biome 配置 + 依赖 + 脚本 + 一次性格式化提交。
5. 测覆盖率基线 → 设阈值 → 接入 CI workflow。
6. 卫生修复（构建产物、`.gitignore`、`.env.example`、README）。
7. 本地逐条执行验证命令，确认 CI 等价命令通过。
8. 回滚：各步骤独立提交，可单独 revert；无数据/API 迁移。

## Open Questions

- 覆盖率初始阈值具体取值（待测基线后确定，见 tasks 中的测量步骤）。
- 是否把前端 Playwright E2E（`npm run test:e2e`）纳入 CI？本变更默认**不纳入**（需安装浏览器、耗时长），仅作为文档化的可选项。
- Biome 是否需要立即补充 eslint 以覆盖更完整的 React hooks 规则？（默认否，后续观察。）
