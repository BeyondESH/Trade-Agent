---
type: "Module"
id: .github/workflows
title: "CI 质量门禁流水线"
description: "在 push/PR 时以 GitHub Actions 复现后端与前端的全部质量门禁，并保证 CI 与本地、pre-commit、文档三方一致。"
module_id: .github/workflows
architectural_role: "工程基础设施层（CI/门禁编排），不承载任何业务运行时逻辑"
world_model_hints:
  - "属于仓库最外层的工程基础设施，不被任何运行时代码调用"
  - "由 GitHub 事件（push / pull_request）触发，是代码合入主干前的唯一强制校验关口"
  - "它本身不实现检查，只『编排』检查：真正的规则住在 backend/pyproject.toml、frontend/vite.config.ts、backend/tests 的 marker 与 frontend/tests 的脚本里"
upstream_modules:
  - module: repo-root（AGENTS.md / README.md / .pre-commit-config.yaml）
    confidence: extracted
  - module: backend/tests
    confidence: extracted
  - module: frontend/tests
    confidence: extracted
downstream_modules:
  - module: backend/src（被 ruff + pytest + coverage 校验，门禁失败即阻断合入）
    confidence: extracted
  - module: frontend/src（被 Biome + tsc + vitest + coverage 校验）
    confidence: extracted
  - module: openspec/specs（ci-quality-gates 规格的落地实现方）
    confidence: inferred
---

## Files

### 源代码路径

- `.github/workflows/`（仓库唯一工作流目录）
- 同级散落代码文件：`.github/workflows/ci.yml`（当前唯一工作流，含 3 个 job：`backend` / `backend-l2` / `frontend`）

### 关联配置（CI 编排的规则实际存放处，改动需联动）

- `backend/pyproject.toml` — ruff 规则集、pytest marker 声明、`[tool.coverage.report] fail_under`
- `frontend/package.json` — `lint` / `format:check` / `typecheck` / `test` / `test:coverage` 脚本
- `frontend/vite.config.ts` — vitest coverage provider / include / thresholds
- `.pre-commit-config.yaml` — 本地提交门禁，工具版本必须与 CI 对齐
- `backend/uv.lock` / `frontend/package-lock.json` — CI 冻结安装的依赖事实源
- `README.md`「质量门禁」节 / `AGENTS.md`「Test Suite」节 — 命令矩阵的对外文档契约

### 知识库文档

- `.codemaker/codeindex/.github/workflows/_overview.md`（本文件）
- `.codemaker/codeindex/.github/workflows/workflows_ci.md`
- `.codemaker/codeindex/.github/workflows/workflows_local_parity.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）；本模块为 YAML 声明式配置，无函数级符号，检查命令的入口以 job/step 名为准。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `workflows_ci.md` | 触发条件、三个 job 的分工与 marker 矩阵、为什么 L2 独立成 job、为什么 Playwright E2E 不进 CI | `on:[push,pull_request]`、job `backend` / `backend-l2` / `frontend`、`-m integrity`、`-m live --run-live`、`--run-online`（禁止使用）、`uv sync --frozen` |
| `workflows_local_parity.md` | 覆盖率阈值棘轮与判定链、lint/format 工具版本、pre-commit↔CI↔文档三方同步契约、依赖可复现与仓库卫生约束 | `fail_under=80`、`lines/statements=55`、`ruff v0.16.8`、`@biomejs/biome 2.5.14`、`MD_TEST_SERVER_START_TIMEOUT=180`、`.gitignore` CI 产物项 |

## 模块概述

**业务定位**：本模块解决的是「任意一次提交都不允许把回归悄悄带进主干」这一工程问题——它把后端单元回归、L1 数据完整性、L2 真实进程 API/WS、双端 lint/format/typecheck/覆盖率这些检查固化成 push/PR 时的强制关口，从而保证行情数据质量与交易端行为在每次变更后仍然可信。
（来源: `openspec/specs/ci-quality-gates/spec.md`、`README.md`「质量门禁」节）

**业务上游**：无代码调用方。唯一触发者是 GitHub 事件——`on: [push, pull_request]`，即任何分支推送与 PR 更新；因此本地开发者的 pre-commit 钩子与仓库文档中的命令矩阵是它的「上游等价执行者」，三者必须同源。
（来源: `.github/workflows/ci.yml`、`openspec/changes/archive/2026-09-20-ci-lint-coverage/design.md` 决策 7）

**业务下游影响**：门禁失败会直接阻断 `backend/src`（行情 ingestion / WS 推送 / Agent 与量化引擎）与 `frontend/src`（K 线终端、全球快讯、交易面板）相关 PR 的合入；同时它约束所有需求实现的工作方式——例如新增一个需要外网的测试会让 CI 变成不稳定红灯源，新增重型 pytest 步骤若不拆 job 会拖慢每次 PR。CI 命令矩阵一旦与 `AGENTS.md`/`README.md` 不一致，文档中就会出现「按描述执行却失败」的假命令，属于被规格明令禁止的债务。
（来源: `openspec/specs/e2e-test-infra/spec.md`「测试命令与 marker 策略一致」Requirement）

## 架构简析

模块采用「触发层 → job 编排层 → 规则落地点」三层声明式结构，本模块只做编排，不写检查逻辑：

`on:[push, pull_request]` → job `backend`（lint + unit + L1 + coverage）/ job `backend-l2`（L2 真实进程）/ job `frontend`（Biome + typecheck + test + coverage） → 规则落地点：`backend/pyproject.toml`、`frontend/vite.config.ts`、`frontend/package.json` scripts、`backend/tests` marker

- **核心文件**：`ci.yml`（唯一工作流，3 job）；`.pre-commit-config.yaml`（同一套检查的本地镜像，版本需与 CI 对齐）；`backend/pyproject.toml`（决定 CI 里 `--frozen` 安装什么、`Coverage gate` 步骤判多少分）；`frontend/vite.config.ts`（决定前端覆盖率阈值）。
- **关键数据流**：checkout → `setup-uv`/`setup-node` → `uv sync --frozen` / `npm ci`（冻结依赖）→ ruff / Biome 静态检查 → `pytest -q` → `pytest -m integrity` → `pytest -q --cov=market_data`（阈值门禁）→（独立 job）`pytest -m live --run-live` → 前端 `lint / format:check / typecheck / test / test:coverage`。
- **marker 生命周期**（CI 侧状态语义）：`unit`（`pytest -q`，`live`/`online` 自动 deselect）→ `L1`（`-m integrity`，无数据时自适应 skip）→ `L2`（`-m live --run-live`，独占干净进程）→ `online`（**CI 永不传 `--run-online`**，设计使然，非待补的缺口）。
- **扩展点**：新增检查只能以「新 step 挂到既有 job」或「新增 job」两种方式接入；新增 job 的判断标准是「是否需要干净/隔离进程」或「是否显著更慢」，两条均来自 L2 拆分的既有决策。

## 上下游关系

> `extracted` = 静态分析/配置文件可验证；`inferred` = Agent 推断待复核

**上游（谁触发本模块）**

| 上游 | 触发方式 | 依据 | confidence |
|------|---------|------|------------|
| GitHub 事件 | `push` / `pull_request` | `ci.yml` `on:` 字段 | extracted |
| 开发者本地提交 | pre-commit 钩子执行同一套 ruff/Biome 检查（CI 的本地前置镜像） | `.pre-commit-config.yaml` 首行注释「mirroring CI (see .github/workflows/ci.yml)」 | extracted |

**下游（本模块约束谁）**

| 下游 | 影响 | confidence |
|------|------|------------|
| `backend/src` | 未过 ruff / 单测 / L1 / 覆盖率阈值的后端改动无法合入 | extracted |
| `backend/tests` | marker 语义（`integrity`/`live`/`online`）被 CI 命令矩阵锁定；新测试若需外网必须打 `online`，否则 CI 变 flaky | extracted |
| `frontend/src`、`frontend/tests` | Biome + `tsc --noEmit` + vitest + 阈值门禁；缺 `lint/format:check/typecheck/test:coverage` 任一脚本 CI 直接报错 | extracted |
| `AGENTS.md` / `README.md` | 文档命令矩阵必须与 CI 实际执行保持一致（规格级硬要求） | extracted |
| `openspec/specs/ci-quality-gates`、`repo-hygiene` | 本模块是这两份规格的落地实现方；规格变更须同步 workflow | inferred |

## 变更风险速览（详见子文档）

- 删/改 `backend-l2` 的独立 job → L2 的 uvicorn 子进程与单元回归共享进程，测试顺序污染类 flaky 复现（正是拆分要解决的问题）。
- 在 CI 引入 Playwright E2E 或 `--run-online` → 每次 PR 都要下载浏览器 / 依赖外网，门禁退化为不可信红灯，属规格明确排除项。
- 单独调高覆盖率阈值 → 若高于实测基线则 CI 从第一天起红灯，并诱发「为覆盖率而写测试」。
- 只改 CI 不改 pre-commit / 文档 → 本地与 CI 结果不一致、文档命令失效，是被规格点名的债务模式。
