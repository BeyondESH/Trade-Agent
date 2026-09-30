---
type: "Module"
id: "backend/__files"
title: "后端根级配置契约"
description: "后端 `backend/` 根目录下的四个散落文件构成「后端如何被配置、被安装、被复现、被把关」的契约面：`.env.example` 定义运行时唯一可配置面，`pyproject.toml` 定义依赖面与质量门禁，`uv.lock` 冻结可复现的解析结果，`.gitignore` 划出不许入库的边界；它们不含任何行情/交易逻辑，却是 `backend/src` 能否确定性跑起来的前提。"
module_id: "backend/__files"
architectural_role: "构建与配置契约层（声明式，无运行时执行逻辑）"
world_model_hints:
  - "属于分层架构最底层的「工程契约层」：不参与数据层/分析层/风控层/AI Agent 层任何一次业务调用，但决定这些层在目标机器上装出什么版本、读什么配置"
  - "上游是工程流程而非业务调用：开发者改代码、GitHub Actions 在 push/PR 上执行 `uv sync --frozen` + pytest + ruff、pre-commit 钩子在本地提交前拦截"
  - "下游是三个消费者：`backend/src` 的 Settings（读 .env）、`backend/tests` 的 marker/覆盖率策略（读 pyproject 的 ini_options）、CI job（读 uv.lock 与 fail_under）"
  - "这组文件是「三处同步」的责任方：Settings 字段 ↔ backend/.env.example ↔ README 环境变量表必须同集合；漏一处即违反 repo-hygiene 规格"
upstream_modules:
  - module: .github/workflows
    confidence: extracted
  - module: openspec
    confidence: extracted
  - module: backend/src
    confidence: extracted
  - module: backend/tests
    confidence: extracted
downstream_modules:
  - module: backend/src
    confidence: extracted
  - module: backend/tests
    confidence: extracted
  - module: backend/scripts
    confidence: inferred
  - module: README.md / __root/__files
    confidence: inferred
---

## Files

### 源代码路径

- `backend/`（根级散落文件，模块边界为该目录下的 4 个非代码文件；`backend/src`、`backend/tests`、`backend/scripts` 有各自独立的知识库模块）

### 本模块覆盖的散落文件

| 文件 | 性质 | 归属子文档 |
|------|------|-----------|
| `backend/.env.example` | 运行时环境变量契约模板（该写什么、默认值是多少） | `__files_env.md` |
| `backend/pyproject.toml` | 依赖声明 + Python 下限 + 打包入口 + ruff/coverage/pytest 门禁配置 | `__files_deps.md`（依赖/打包）与 `__files_gates.md`（门禁/卫生） |
| `backend/uv.lock` | uv 冻结的依赖解析结果（含 hash 与 resolution markers） | `__files_deps.md` |
| `backend/.gitignore` | 后端目录级忽略规约（与仓库根 `.gitignore` 分层叠加） | `__files_gates.md` |

### 知识库文档

- `.codemaker/codeindex/backend/__files/_overview.md`（本文件）
- `.codemaker/codeindex/backend/__files/__files_env.md`
- `.codemaker/codeindex/backend/__files/__files_deps.md`
- `.codemaker/codeindex/backend/__files/__files_gates.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。
- 本组文件为 TOML / 文本配置，**无源码符号**。唯一与之耦合的代码符号是 `backend/src/market_data/config.py:Settings`（由 `backend/src` 模块的 `src_data_store.md` 负责），本模块只描述它的**外部契约**（哪些变量、什么默认值、必须与谁同步）。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `__files_env.md` | 运行时唯一可配置面：22 个 `Settings` 字段对应的环境变量、默认值、凭据口径、`.env` 解析位置与三处同步责任 | `MD_AGENT_SCHEDULE_ENABLED`(false)、`MD_CATEGORIES`(SPOT,USDT-FUTURES)、`MD_V3_CANDLE_PAGE_LIMIT`(100)、`BB_API_KEY`(空)、`MD_TEST_SERVER_START_TIMEOUT`(180s，测试专用) |
| `__files_deps.md` | 后端能跑在什么环境、装了什么、升级会崩在哪：Python 下限、运行时/开发依赖、`plotly<7` 硬 pin、`uv.lock` 冻结结果与打包入口 | `requires-python`(>=3.11)、`plotly<7`（锁 6.9.0）、`numpy>=2.4`（锁 2.5.3/2.4.6）、`vectorbt>=1.1`、`market-data = market_data.cli:main` |
| `__files_gates.md` | 什么改动会被拦下、本地与 CI 是否同一把尺子、哪些产物不许入库：ruff 规则集与例外、pytest marker 分层、覆盖率棘轮、目录忽略边界 | `fail_under`(80)、`baseline`(81%)、`line-length`(100)、`ruff select`(E,F,I,UP,B)、`ignore`(B008)、markers(integrity/live/online) |

## 模块概述

**业务定位**：`backend/` 根目录这四个文件共同回答一个工程问题——「后端这套行情/交易能力，换一台机器后能不能装出同样的版本、读到同一套配置、被同一把尺子拦住」，从而让 `backend/src` 的代码具备**确定性**：公开行情不需要任何凭据即可跑通，需要凭据或限额时可用环境变量确定性覆盖，依赖解析结果被 `uv.lock` 冻结，质量下限由 CI 用同一份 `pyproject.toml` 断言。它们不实现任何业务能力，因此是**契约层**而非实现层——改动它们的后果不是"功能变了"，而是"所有人的机器和 CI 一起变"。

**上游触发**：本组文件没有任何运行时调用者，其变更完全由工程流程驱动——① 开发者新增 `Settings` 字段或依赖（`backend/src/market_data/config.py` 改动会连带触发 `.env.example` 同步义务）；② GitHub Actions 在 push / PR 时执行 `uv sync --frozen`、`ruff check`、`pytest -q`、`pytest -m integrity` 与独立的 L2 job，直接消费 `pyproject.toml` 与 `uv.lock`；③ pre-commit 钩子在本地提交前用与 CI 相同的 ruff / Biome 工具版本拦截。（来源: openspec/specs/ci-quality-gates/spec.md）

**下游影响**：本组文件的任一处改动都会沿三条链外溢——① **安装链**：改 `pyproject.toml` 的依赖区间却不重新生成并提交 `uv.lock`，CI 的 `uv sync --frozen` 会因解析结果与锁文件不一致而直接失败，把整个 PR 卡死；② **配置链**：改 `.env.example` 不同步 `Settings` 或 README 环境变量表，会让部署方按错的默认值启动（例如以为 `MD_AGENT_SCHEDULE_ENABLED` 默认开启，实际默认 `false`），而 `extra="ignore"` 会让拼错的变量名**静默失效**而非报错；③ **门禁链**：把 `fail_under` 调高到高于实测基线（81%，阈值为向下取整的 80）会让 CI 立刻变红，把 `plotly<7` 的 pin 单独解除会让后端在 `import` 阶段就崩。（来源: openspec/specs/ci-quality-gates/spec.md）

## 架构简析

本模块是**四个声明式文件的并联结构**，没有内部调用关系，只有**单向的口径依赖与一致性义务**：

分层结构（单行）：`pyproject.toml（声明依赖区间 + 打包入口 + 门禁阈值）` → `uv.lock（把区间解析成确定版本 + hash）` → `.env.example（运行时参数口径）` / `.gitignore`（什么不许入库）

- **核心文件**：`pyproject.toml` 是本组唯一"有逻辑含义"的文件（依赖区间、`requires-python`、console script、ruff 规则集、coverage 棘轮、pytest marker 声明六件事挤在一处）；`uv.lock` 是它的机器化投影，只被 `uv sync --frozen` 消费；`.env.example` 是运行时唯一可配置面的**人类可读清单**；`.gitignore` 是目录级卫生边界，与仓库根 `.gitignore` 叠加生效。
- **关键数据流**：`Settings` 新增字段（`backend/src`）→ 同一变更内同步 `backend/.env.example` 与 README 环境变量表（repo-hygiene 硬要求）→ 本地 `backend/.env` 覆盖默认值 → 进程启动读入。另一条链：`pyproject.toml` 依赖区间变更 → `uv lock` 生成新 `uv.lock` → CI `uv sync --frozen` 校验一致性 → `--cov=market_data` 触发 `fail_under` 断言。
- **无代码验证路径**：本组文件没有单元测试，唯一的验证是"跑命令"——CI 的 `uv sync --frozen`（锁一致性）、`ruff check .`（规则集）、`pytest -q`（marker 生效）、`pytest -q --cov=market_data`（覆盖率阈值）四条命令即本模块的"测试"。
- **三处同步责任**：`Settings` 字段集合 ↔ `backend/.env.example` ↔ README 环境变量表，三者必须覆盖同一变量集合；这是本组最易漂移的点，且漂移不会报错（`extra="ignore"`）。

## 上下游关系

| 方向 | 对象 | 关系 | confidence |
|------|------|------|-----------|
| 上游 | `.github/workflows/ci.yml` | 消费 `uv.lock`（`uv sync --frozen`）、`pyproject.toml` 的 ruff/coverage/marker 配置；L2 独立 job 执行 `pytest -m live --run-live` | extracted |
| 上游 | `openspec/specs/ci-quality-gates`、`repo-hygiene`、`e2e-test-infra` | 规格直接约束本组文件必须包含什么（marker 声明、`.env.example` 同步、棘轮策略、冻结安装） | extracted |
| 上游 | `backend/src/market_data/config.py` | `Settings` 字段的增删改是本组 `.env.example` 变更的唯一触发源 | extracted |
| 下游 | `backend/src` | 依赖能否装上、`market-data` 命令能否注册、运行时读什么变量，全由本组决定 | extracted |
| 下游 | `backend/tests` | `pytest` 的 marker 声明（`integrity`/`live`/`online`）与 `testpaths`、覆盖率门禁均来自 `pyproject.toml` | extracted |
| 下游 | `backend/scripts` | 一次性回填脚本复用同一份依赖与同一套 `MD_*` 环境变量 | inferred |
| 下游 | `README.md` 环境变量表（`__root/__files`） | 三处同步义务的第三处，README 表必须以 `.env.example` 为准保持同集合 | inferred |
| 下游 | `.pre-commit-config.yaml`（仓库根） | 钩子工具与版本须与 CI 保持一致，避免本地绿、CI 红 | inferred |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/e2e-test-infra/spec.md`、`openspec/specs/system-architecture/spec.md`、`openspec/specs/orchestration-jobs/spec.md`（仅提炼契约与约束，非完整规范）

- 后端 job **MUST** 使用 Python 3.11；依赖安装 **SHALL** 基于已提交的 `backend/uv.lock` 并用 `uv sync --frozen`，**SHALL NOT** 在 CI 中解析出与锁文件不同的版本。（来源: openspec/specs/ci-quality-gates/spec.md）
- 后端 CI **SHALL** 执行 `python -m pytest -q`（`live`/`online` 自动跳过）、`python -m pytest -m integrity`，并将 L2 `python -m pytest -m live --run-live` 放独立 job；**SHALL NOT** 传 `--run-online`（外网用例不得成为失败源）。（来源: openspec/specs/ci-quality-gates/spec.md）
- ruff（lint + format）**SHALL** 作为静态门禁覆盖 `backend/`；无法一次清理的告警 **SHALL** 以规则级 `ignore` 或带原因的 `# noqa` 处理，**SHALL NOT** 直接关闭整条规则而不留说明。（来源: openspec/specs/ci-quality-gates/spec.md）
- 覆盖率阈值 **MUST NOT** 高于实施时实测基线；阈值 **SHALL** 按实测基线向下取整确定，并 **SHALL** 在文档中记录"只升不降"的棘轮策略。（来源: openspec/specs/ci-quality-gates/spec.md）
- `backend/.env.example` **SHALL** 包含 `Settings` 定义的全部公开配置项（含 `BB_API_KEY` / `BITGET_*` 凭据占位），并 **SHALL** 与 README 环境变量表逐项一致；新增或修改 `Settings` 字段的变更 **SHALL** 在同一变更内同步该文件。（来源: openspec/specs/repo-hygiene/spec.md）
- 仓库 **MUST NOT** 跟踪生成型产物；`.gitignore` **SHALL** 覆盖本地工具与 CI 产生的目录/文件。（来源: openspec/specs/repo-hygiene/spec.md）
- 系统 **SHALL** 默认运行于纸面交易，实盘 **MUST** 由用户显式开启；凭据 **MUST** 仅从环境变量读取。（来源: openspec/specs/system-architecture/spec.md）
- `MD_AGENT_SCHEDULE_ENABLED` **SHALL** 默认 `false`（默认不自动交易、不自动训练），但熔断保护性平仓任务 **SHALL** 始终注册、不受该开关影响。（来源: openspec/specs/orchestration-jobs/spec.md）
- 测试系统 **SHALL** 提供 `--run-live` 开关，未显式传入时 `live` 用例 **SHALL** 在 collection 阶段跳过且 **SHALL NOT** 实例化重型 `live_server`；服务启动上限 **SHALL** 可通过环境变量覆盖（`MD_TEST_SERVER_START_TIMEOUT`，默认 180s）。（来源: openspec/specs/e2e-test-infra/spec.md）
