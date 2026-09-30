---
type: "Fragment"
id: .github/workflows/local-parity
title: "CI 质量门禁流水线 / 阈值棘轮与本地-CI-文档三方一致性"
description: "覆盖率门禁阈值能不能调？pre-commit 和 CI 为什么要同一套工具版本？改了 CI 命令还要同步哪些文档？"
parent: /.github/workflows/_overview.md
fragment: local-parity
architectural_role: "工程基础设施层 · 门禁数值与三方一致性契约，禁止单点改动破坏棘轮"
entity_names:
  constants:
    - name: "后端覆盖率门禁阈值 fail_under"
      source: backend/pyproject.toml（由 ci.yml `Coverage gate` step 强制执行）
      value: "80"
    - name: "后端覆盖率实测基线（引入时）"
      source: backend/pyproject.toml 注释 / README 质量门禁表
      value: "81%（356 单测，`pytest -q -m \"not integrity and not live and not online\"`）"
    - name: "前端覆盖率阈值 lines / statements"
      source: frontend/vite.config.ts（由 ci.yml `npm run test:coverage` 强制执行）
      value: "55 / 55"
    - name: "前端覆盖率实测基线（引入时）"
      source: frontend/vite.config.ts 注释 / README 质量门禁表
      value: "55.69% lines & statements（383 测试，`src/**`）"
    - name: "CI 后端 lint/format 工具与版本"
      source: .github/workflows/ci.yml + backend/uv.lock
      value: "ruff（setup-uv 安装，版本以 uv.lock 为准）"
    - name: "pre-commit ruff 钩子版本"
      source: .pre-commit-config.yaml
      value: "astral-sh/ruff-pre-commit rev v0.16.8（须与 backend/uv.lock 中 ruff 保持一致）"
    - name: "pre-commit Biome 钩子版本"
      source: .pre-commit-config.yaml
      value: "biomejs/pre-commit rev v2.5.9 + additional_dependencies @biomejs/biome@2.5.14"
    - name: "ruff 规则集与例外"
      source: backend/pyproject.toml [tool.ruff.lint]
      value: "select=E,F,I,UP,B；ignore=B008（FastAPI Depends/Body 惯用法，附再启用计划）"
    - name: "ruff 扫描排除"
      source: backend/pyproject.toml [tool.ruff]
      value: "line-length=100, target-version=py311, extend-exclude=src/market_data/_vendor"
    - name: "前端扫描排除（vendored 目录不得进门禁）"
      source: frontend/biome.json files.includes（否定项）/ vite.config.ts coverage.exclude
      value: "Biome: !vendor,!dist,!coverage,!playwright-report,!test-results,!package-lock.json（node_modules 隐式忽略）；coverage.exclude: src/**/*.test.ts(x)、src/**/*.d.ts、src/test-setup.ts、src/vendor/**、src/main.tsx"
    - name: "npm script `format:check` 实际命令"
      source: frontend/package.json
      value: "biome format .（只读检查模式，不带 --write）"
    - name: "CI 产物不得入库（.gitignore 覆盖项）"
      source: .gitignore
      value: ".pytest_cache/、.ruff_cache/、.coverage、coverage.json、htmlcov/、coverage/、build_ap_cmh.json、.omo/"
    - name: "L2 启动超时可调项"
      source: backend/tests/conftest.py / AGENTS.md
      value: "MD_TEST_SERVER_START_TIMEOUT（默认 180s）"
retrieval_hints:
  - "覆盖率门禁是多少？能不能把阈值调高/调低？"
  - "本地 pre-commit 通过了为什么 CI 还挂？"
  - "改动 CI 的检查命令后还要改哪些地方？"
  - "哪些文件/目录被排除在 lint 与覆盖率统计之外？"
  - "⚠️ 如果你要找的是覆盖率数字本身或测试用例实现，不在这里：后端阈值在 `backend/pyproject.toml`，前端阈值在 `frontend/vite.config.ts`，用例在 `backend/tests`、`frontend/tests`；本模块只负责『用哪条命令把它跑起来并卡住』。"
  - "⚠️ 如果你要找环境变量清单同步规则（`backend/.env.example` ↔ README 环境表 ↔ `Settings`），执行动作在 backend 配置模块，本模块只承载该同步纪律的需求来源（repo-hygiene 规格）。"
  - "棘轮 / 只升不降 / 基线 / 门禁阈值 / 提交前检查 / pre-commit，这些词都指向本模块的这条契约"
  - "新增或调整任何门禁数值（阈值、工具版本、排除目录）必须落在其**权威配置文件**（pyproject / vite.config / biome.json / package.json），并在同一变更内同步 README 与 AGENTS.md 的命令矩阵；禁止在 ci.yml 里用命令行参数临时覆盖阈值。"
---

## 业务意图

它解决的是「门禁可信度」问题：一道门禁只有在**本地能预先复现、数值可追溯到有据的基线、且在所有入口（GitHub Actions / pre-commit / 文档）表达完全一致**时才会被开发者尊重。因此本模块沉淀的不是 yml 语法，而是三条纪律——覆盖率阈值棘轮（只升不降、不得低于实测基线）、CI 与 pre-commit 工具同源同版本（杜绝「本地绿、CI 红」）、CI 命令矩阵与 `AGENTS.md`/`README.md` 逐项一致（杜绝失效命令）。违反其中任意一条，团队会立刻退化成「靠反复试错猜门禁规则」，这才是它真正的业务代价。
（来源: `openspec/specs/ci-quality-gates/spec.md`「双端覆盖率门禁」「提交前门禁（pre-commit）」、`openspec/changes/archive/2026-09-20-ci-lint-coverage/design.md` 决策 6/7、`openspec/specs/e2e-test-infra/spec.md`「测试命令与 marker 策略一致」）

> 阈值为什么只能往上调：棘轮策略的意义不在「现在差多少」，而在「不会退步」。一旦允许下调，后续任何变更只要遇到自己无法覆盖的新测试，第一反应就会是改数字而不是改代码；阈值一旦从 80 降到 75 就几乎不可能再回到 80，门禁从此只剩形式意义。因此变更时若确实需要调低，必须归为一个单独的回退变更并要求基线重新测量与说明。
（来源: `openspec/changes/archive/2026-09-20-ci-lint-coverage/design.md` 决策 6「先测基线再设门禁 + 只升不降」、`backend/pyproject.toml` 与 `frontend/vite.config.ts` 中的策略注释）

## 对外接口

本子模块无独立协议，其接口是**一组被 CI 强制读取的数值与脚本契约**：

| 契约 | 权威定义位置 | CI 执行点 | 业务说明 |
|---|---|---|---|
| 后端覆盖率阈值 | `backend/pyproject.toml` `[tool.coverage.report] fail_under = 80` | `backend` job → `Coverage gate` | 通过率由此判定；阈值 = 基线 81% 向下取整到 5 的倍数 |
| 前端覆盖率阈值 | `frontend/vite.config.ts` `test.coverage.thresholds{lines:55, statements:55}` | `frontend` job → `npm run test:coverage` | 基线 55.69% 向下取整到整百分比；只统计 `src/**` |
| 后端静态检查规则 | `backend/pyproject.toml` `[tool.ruff]` / `[tool.ruff.lint]` | `ruff lint` + `ruff format check` | 规则级 ignore 必须附原因与收敛计划 |
| 前端静态检查 | `frontend/biome.json` + `frontend/package.json` scripts | `npm run lint` / `format:check` | Biome 单工具同时管 lint 与 format；必须排除 `vendor/**` 等目录 |
| 本地前置镜像 | `.pre-commit-config.yaml` | 不经 CI，但版本需与 CI 对齐 | 注释显式声明「mirroring CI (see .github/workflows/ci.yml)」，作用域 `^backend/`（ruff）与 `^frontend/`（Biome） |
| 命令矩阵文档 | `AGENTS.md`「Test Suite」、`README.md`「质量门禁 / 测试」 | — | 三层测试（L1/L2/L3）+ 单元回归命令必须与 CI 一致 |

## 跨模块依赖

| 依赖对象 | 引用原因 | 关键符号/文件 | confidence |
|---|---|---|---|
| `backend`（配置层） | 覆盖率阈值/规则集的事实源，CI 只调用不定义 | `backend/pyproject.toml` | extracted |
| `frontend`（配置层） | npm script 名与 vitest 阈值的事实源 | `frontend/package.json`、`vite.config.ts`、`biome.json` | extracted |
| 仓库根（卫生规约） | CI 产物与本地工具缓存必须不入库，否则每次跑都会在 diff 里制造噪声 | `.gitignore`（coverage/.pytest_cache/.ruff_cache/`build_ap_cmh.json`/.omo） | extracted |
| `backend/src/market_data/config.py`（Settings） | repo-hygiene 规格要求 `.env.example` 与 README 环境表与之逐项一致；CI 的 L2 job 依赖该纪律（缺变量→本地/CI 行为分叉） | `backend/.env.example`、README 环境变量表 | inferred |

| 反向依赖（谁受本模块约束） | 约束场景 | confidence |
|---|---|---|
| 任意新增测试代码的变更 | 必须落在既有 marker 归属内，否则触发阈值重测与棘轮核对 | extracted |
| `docs`（`README.md` / `AGENTS.md`） | 命令矩阵同变更内同步义务 | extracted |
| 依赖升级变更 | `uv.lock` / `package-lock.json` 与 pre-commit 版本三方同步 | extracted |

## 典型调用链

### 链路 A：覆盖率门禁的判定路径（谁真正卡住 CI）
```
job backend → step `Coverage gate`: uv run pytest -q --cov=market_data --cov-report=term-missing
  → pytest-cov 读取 backend/pyproject.toml [tool.coverage.report] fail_under=80   ← 跨模块：backend 配置层
    → 实际覆盖率 < 80 → 进程非零退出 → job backend 失败 → PR 红灯
```

### 链路 B：前端阈值判定路径
```
job frontend → npm run test:coverage → vitest run --coverage
  → 读取 frontend/vite.config.ts test.coverage.thresholds{lines:55, statements:55}   ← 跨模块：frontend 配置层
    → 低于阈值 → vitest 非零退出 → job frontend 失败
```

### 链路 C：本地提交与 CI 的等价执行
```
git commit → .pre-commit-config.yaml:ruff-check(--fix)/ruff-format（^backend/）
           → .pre-commit-config.yaml:biome-check（^frontend/）
  → 同一套工具/版本在 CI 侧重现：ruff lint / ruff format check / npm run lint / format:check
     → 若两处版本不一致：本地绿、CI 红（本子模块存在的全部理由）
```

## 边界约束与由来（什么能做、什么禁止）

本子模块的约束本质上都在回答同一个问题：「门禁数值到底在哪里改、改动要连带谁」。**能做的**只有一件事：在权威配置文件（`backend/pyproject.toml`、`frontend/vite.config.ts`、`frontend/biome.json`、`frontend/package.json`）里修改规则或阈值——因为 CI 只做调用，不内联参数；**禁止的**则是所有让数值变成两处真相的做法：在 `ci.yml` 命令行临时覆盖阈值、在 pre-commit 侧静默 `skip` 钩子、只改 CI 不改 pre-commit、只改工具版本不改锁文件、把 vendored 目录纳入扫描或覆盖率分母。约束由来可以追到三处硬证据：规格中「阈值 MUST NOT 高于实测基线」「例外规则必须携带原因与收敛计划」的硬写法；`backend/pyproject.toml` 与 `vite.config.ts` 里对「只升不降」棘轮策略的注释；`.pre-commit-config.yaml` 头部「mirroring CI」及两处「Keep in sync with …」注释——它们共同把门禁的可信度变成了可验证的工程契约，而不是口头约定。

## 变更风险（动它会破坏什么）

- **调高覆盖率阈值而不先测基线** → CI 从合入当天起红灯，且诱发「为凑数而写的空测试」；规格写法是阈值 SHALL NOT 高于实测基线（`ci-quality-gates`「阈值不高于基线」Scenario）。
- **调低或注释掉阈值** → 破坏「只升不降」棘轮策略，后续变更再想升回去会持续撞既有债，门禁形同虚设。
- **只改 CI 不改 pre-commit（或反之）** → 出现「本地提交通过、CI 挂」，开发者开始不信任钩子并绕过提交前检查。
- **`coverage` step 挪成 pytest `addopts`** → L1 那一跑被计入单元覆盖率基线，基线数值不再可比（ci.yml 内注释明确保留独立 step 的原因）。
- **把 vendored 目录纳入 lint/覆盖率统计** → `frontend/vendor/**`、后端 `_vendor` 会产生数百条无法修复的告警，且把分母撑大导致阈值失去意义（规格「排除 vendored 目录」Scenario）。
- **改了 CI 命令但不改 `README.md`/`AGENTS.md`** → 文档里的命令不再等价于门禁，规格将其列为 MUST NOT 保留的「会隐式失败或与实现不符」的债务。

## 实现约束清单

### 必须保持同步的数值 / 版本

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|---|---|---|---|---|
| `fail_under` | `80` | `backend/pyproject.toml` | 后端覆盖率门禁；基线 81% 向下取整到 5 的倍数 | 棘轮策略「只升不降」，design 决策 6 |
| coverage `lines` / `statements` | `55` / `55` | `frontend/vite.config.ts` | 前端覆盖率门禁；基线 55.69% 向下取整 | 同上 |
| ruff pre-commit `rev` | `v0.16.8` | `.pre-commit-config.yaml` | **必须与 `backend/uv.lock` 里的 ruff 版本一致** | 配置文件内注释「Keep in sync with the `ruff` version pinned in backend/uv.lock」 |
| Biome pre-commit `rev` / pin | `v2.5.9` / `@biomejs/biome@2.5.14` | `.pre-commit-config.yaml` | 必须与 `frontend/package.json` devDependency 一致 | 配置文件内注释「Keep in sync with the `@biomejs/biome` devDependency」 |
| ruff `ignore` | `B008` | `backend/pyproject.toml` | 唯一被 ignore 的规则（FastAPI `Depends()`/`Body()` 默认值惯用法），附再启用条件 | 规格「既有告警有据可查」：不得无说明地关闭整条规则 |
| 排除目录 | Biome：`!vendor`、`!dist`、`!coverage`、`!playwright-report`、`!test-results`、`!package-lock.json`（`node_modules` 隐式）；coverage：`src/vendor/**`、`src/main.tsx`、`*.test.ts(x)`、`test-setup.ts`；ruff：`src/market_data/_vendor` | `frontend/biome.json` / `frontend/vite.config.ts` / `backend/pyproject.toml` | vendored 与生成物不进门禁与分母 | 规格「排除 vendored 目录」 |
| `MD_TEST_SERVER_START_TIMEOUT` | 默认 `180` 秒 | `backend/tests/conftest.py`（L2 job 生效） | CI 冷启动等待上限，可环境变量覆盖 | `e2e-test-infra`「自适应就绪」：MUST NOT 使用固定短上限（旧 45s 造成 flaky） |

### 必须达成的三方一致（CI ↔ pre-commit ↔ 文档）

| 一致项 | CI 侧 | 本地侧 | 文档侧 |
|---|---|---|---|
| 后端 lint/format | `uv run ruff check .` + `ruff format --check .` | ruff-pre-commit（`ruff-check --fix` + `ruff-format`） | README「本地等价命令」`ruff check/. format --check` |
| 前端 lint/format | `npm run lint` + `npm run format:check` | biome-check 钩子 | README 本地等价命令段 |
| 测试命令矩阵 | `pytest -q` / `-m integrity` / `-m live --run-live`；前端 `npm run test` | pre-commit 不含测试（仅静态检查） | `AGENTS.md` 三层表 + README 测试表（三处命令必须同义） |
| 依赖可复现 | `uv sync --frozen` / `npm ci` | 同一份 `uv.lock` / `package-lock.json` | README 安装说明 |

### 依赖可复现与仓库卫生（repo-hygiene 规格的落地）

| 约束 | 说明 | 约束由来 |
|------|------|---------|
| 测试/检查所需 dev 依赖必须显式声明 | 后端测试用的 `httpx`、`pytest-cov`、`ruff` 必须在 `backend/pyproject.toml` 的依赖中声明，不得依赖「恰好装上了」 | design 提到 `httpx` 未声明却被打包进测试，CI 必须显式声明否则不可复现 |
| 依赖变更必须同时更新锁文件 | 改依赖后必须提交更新后的 `backend/uv.lock` / `frontend/package-lock.json` | 规格「冻结依赖安装」：CI SHALL NOT 解析出与锁文件不同的版本 |
| CI 产物与本地工具缓存不入库 | `.gitignore` 覆盖 `coverage/`、`htmlcov/`、`.coverage`、`.pytest_cache/`、`.ruff_cache/` 与构建导出物（如 `build_ap_cmh.json`） | `openspec/specs/repo-hygiene/spec.md`「构建产物不入库」「.gitignore 覆盖本地与 CI 产物」 |
| 新增或修改 `Settings` 字段必须同步 `.env.example` 与 README 环境表 | 三者必须覆盖同一变量集合（含 `MD_AGENT_SCHEDULE_ENABLED`、`MD_TEST_SERVER_START_TIMEOUT` 等） | 规格「.env.example 与环境变量表同步」：不一致会导致本地与 CI 行为分叉 |
| CI 变更不得夹带业务逻辑修改 | 门禁类变更只允许动配置/脚本/文档，`backend/src/**`、`frontend/src/**` 行为保持不变 | design Non-Goals：不在门禁变更中修改业务逻辑，便于单独 revert |

### 设计决策（已选定，勿重复讨论）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|---|---|---|---|
| 覆盖率阈值起点 | 实测基线向下取整（80 / 55）+ 只升不降棘轮 | 直接设高目标（如 80%→90%） | 高起点会让 CI 首日即红并诱发凑数测试（design 决策 6） |
| 前端检查工具 | Biome 单工具（format + lint；`domains.react`/`test` 取 recommended，`useExhaustiveDependencies`/`useHookAtTopLevel`/`noArrayIndexKey` 设为 `warn`，`assist` 关闭） | biome(eslint 兼容模式) + eslint + prettier 三件套 | 消除多套配置、互搏格式规则与版本缠斗；React hooks 规则缺口后续可在 Biome 之上增量补 eslint，不阻塞本变更（design 决策 5） |
| 后端检查工具 | ruff（lint + format 同一工具） | flake8 + black + isort | 三套配置与依赖，慢且易漂移（design 决策 4） |
| 本地门禁实现 | pre-commit 调**与 CI 完全相同的工具与版本** | 本地只跑格式化、CI 跑全部 | 工具或版本不同即产生「本地过 CI 挂」，门禁失去信任（design 决策 7） |

### 禁忌项（禁止事项）

- **禁止**在 `ci.yml` 内用命令行参数（如 `--cov-fail-under=60`）临时覆盖阈值来让红灯消失——阈值只在权威配置文件里改，且必须同变更内说明基线来源。
- **禁止**在 pre-commit / CI 任一侧静默跳过（`skip: true`）某个钩子或 step；确有例外须写明原因与收敛计划（与 ruff `ignore` 必须附理由同源的要求）。
- **禁止**新增未被 CI 执行的「影子门禁」（只在某人手跑、既不在 yml 也不在 pre-commit 的检查）；检查项要生效就必须进这两处之一，并同步文档。
- **禁止**把 vendored 代码（`frontend/vendor/**`、后端 `_vendor`）纳入 lint 或覆盖率分母。
- **禁止**在门禁之外新增第二个 CI 配置文件；发布/部署类 workflow 若确需引入，须另立变更并在 `_overview.md` 补充模块边界。
