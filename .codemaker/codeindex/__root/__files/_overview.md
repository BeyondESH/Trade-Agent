---
type: "Module"
id: __root/__files
title: "仓库治理根文件"
description: "本文件组承载仓库的对外合同：双语 README 的技术/门禁基线、AGENTS.md 的测试命令矩阵与工具约定、pre-commit 与 CI 的版本同源、.gitignore 的入库边界与 GPL-3.0 许可边界。"
module_id: __root/__files
src_path: "."
architectural_role: "仓库治理层（非运行时）——被所有代码模块引用，本身不含可执行符号"
world_model_hints:
  - "位于版本库根，是所有 agent 会话与所有贡献者的第一入口；不在任何 import 图内，但决定 import 图之外的三件事：什么入库、什么被门禁检查、什么许可生效"
  - "上游：全部模块（backend/*、frontend/*、agent_hub-main、.claude/.opencode 命令技能、openspec 规格）都以文件引用/路径正则的方式落到本组"
  - "下游：.github/workflows（pre-commit 镜像的对象）、backend（uv.lock ruff 钉 + .env.example + pyproject 阈值）、frontend（package.json biome 钉 + vite.config 阈值 + frontend/biome.json 规则）"
  - "本组为 file-group（叶子），扫描深度 depth=1，`openspec` 被排除在模块扫描之外（仅作为知识来源被摘抄）"
upstream_modules:
  - module: backend
    confidence: extracted
  - module: backend/src
    confidence: extracted
  - module: backend/tests
    confidence: extracted
  - module: backend/scripts
    confidence: extracted
  - module: frontend
    confidence: extracted
  - module: frontend/src
    confidence: extracted
  - module: frontend/tests
    confidence: extracted
  - module: frontend/vendor
    confidence: extracted
  - module: agent_hub-main
    confidence: extracted
  - module: agent_hub-main/installer
    confidence: extracted
  - module: .claude/skills
    confidence: inferred
  - module: .opencode/skills
    confidence: inferred
downstream_modules:
  - module: .github/workflows
    confidence: extracted
  - module: backend
    confidence: extracted
  - module: frontend
    confidence: extracted
  - module: openspec（规格知识源，非代码模块）
    confidence: extracted
---

## Files

### 源代码路径

- `.`（仓库根散落文件组，git 跟踪的根级文件共 8 个）

| 文件 | 归属子文档 | 一句话职责 |
|------|-----------|-----------|
| `README.md` | `__files_portal.md` | 中文对外门户：启动、环境变量、命令矩阵、门禁与许可口径 |
| `README.en.md` | `__files_portal.md` | 英文门户（与中文版平行手工维护，当前已漂移） |
| `AGENTS.md` | `__files_agent_contract.md` | agent 自动注入的测试命令矩阵 + codemap 工具约定区块 |
| `CLAUDE.md` | `__files_agent_contract.md` | 同 codemap 区块的历史载体；**工作区已删除但未提交** |
| `.pre-commit-config.yaml` | `__files_agent_contract.md` | CI lint/format 的本地镜像，钉住 ruff / Biome 版本 |
| `.gitignore` | `__files_repo_boundary.md` | 入库边界：知识库/agent 产物、构建导出、测试与覆盖率缓存 |
| `biome.json` | `__files_repo_boundary.md` | 仅 `"root": true` + schema，声明 Biome 配置解析终点 |
| `LICENSE` | `__files_repo_boundary.md` | GPL-3.0 全文（674 行），含 `agent_hub-main` MIT 例外口径 |

### 知识库文档

- `.codemaker/codeindex/__root/__files/_overview.md`（本文件）
- `.codemaker/codeindex/__root/__files/__files_portal.md`
- `.codemaker/codeindex/__root/__files/__files_agent_contract.md`
- `.codemaker/codeindex/__root/__files/__files_repo_boundary.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。本组为配置/文档文件，**无可执行符号**，符号索引为空是预期结果，不代表索引缺失。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `__files_portal.md` | 双语 README 的对外契约：版本声明、环境变量表、测试/门禁命令、覆盖率棘轮、项目结构真实性 | `fail_under = 80`、`55.69% / lines=55`、`MD_TEST_SERVER_START_TIMEOUT=180s`、`## 质量门禁`（英文版缺失） |
| `__files_agent_contract.md` | agent 上下文与提交前门禁：三层测试命令矩阵、marker 缺省行为、pre-commit 与 CI 版本同源、codemap 区块维护边界 | `rev v0.16.8`、`@biomejs/biome@2.5.14`、`files: ^backend/`、`pytest -m integrity`、`pytest -m live --run-live`、`npm run test:e2e`、`KNOWN_GAPS` |
| `__files_repo_boundary.md` | 仓库边界三件事：什么入库（.gitignore）、Biome 配置解析边界（root:true）、许可与免责（GPL-3.0 / MIT 例外） | `.codemaker/codeindex/`、`.omo/`、`build_ap_cmh.json`、`coverage/`、`"root": true`、`GPL-3.0`、`MIT (c) 2025 Bitget` |

## 模块概述

1. **业务定位**：本组不实现任何交易或行情逻辑，它解决的是**多人 + 多 AI agent 协作时的口径一致性问题**——外部使用者按 README 决定环境与「什么算通过」，贡献者按 `AGENTS.md` 决定用哪条命令验证，本地按 pre-commit 决定提交会不会被拦，二次分发者按 `LICENSE` 决定义务边界，`.gitignore` 决定哪些东西永远不会污染仓库与检索。它把「运行手册 + 门禁 + 法律边界」从口头约定变成被版本控制的事实。
2. **业务上游**：没有协议或函数调用触发它；上游是**引用关系**——`backend`、`backend/src`、`backend/tests`、`backend/scripts`、`frontend`、`frontend/src`、`frontend/tests`、`frontend/vendor`、`agent_hub-main`、`agent_hub-main/installer` 全部指向本组（`workspace.json.cross_module_hints` 静态抽取），触发时机分别是 git 操作（`.gitignore`）、`git commit`（pre-commit）、agent 会话启动（`AGENTS.md`）、CI checkout（`.gitignore` + `ci.yml` 的 `working-directory`）。
3. **业务下游**：改动它会跨层外溢——README/AGENTS 的命令口径错误会让贡献者跑错测试层并把「本地绿、CI 红」当成环境问题排查；pre-commit 版本漂移会让 lint 结果与 CI 不一致，进而诱发绕过门禁；`.gitignore` 放松会把 agent 知识库与构建 dump 提交进仓库并污染检索（`Grep` 大量命中噪声）；许可表述放松会把 GPL-3.0 的衍生开源义务与 `agent_hub-main` 的 MIT 例外说成一回事，直接误导二次分发；根 `biome.json` 形态改变会引入跨目录的隐式格式化。

## 架构简析

**分层结构（本组为治理层，按「约束流向」而非调用流）：**
`openspec/ 规格`（权威规则）→ `README.md / README.en.md`（人读摘要）+ `AGENTS.md`（agent 读约定）→ `.pre-commit-config.yaml`（本地强制执行）→ `.github/workflows/ci.yml`（远端权威门禁）→ `backend/pyproject.toml` + `frontend/{package.json,vite.config.ts,biome.json}`（阈值与规则实现）

- **核心文件**：`README.md`（对外合同主源，320 行）· `AGENTS.md`（agent 上下文，含机器维护的 codemap 区块）· `.pre-commit-config.yaml`（版本钉 + 目录作用域）· `.gitignore`（入库白名单式排除，38 行含分组注释）· `LICENSE`（GPL-3.0 全文）。
- **关键数据流（同步方向）**：代码事实（`Settings` 字段、pytest marker、覆盖率实测）→ 配置文件（`pyproject.toml` / `vite.config.ts` / `package.json` / `uv.lock`）→ 本组文档（README 两张表 + AGENTS 命令矩阵）；反向流动（先改文档再改实现）是本组最主要的缺陷来源。
- **生命周期/状态**：无运行时状态。存在一条**文档状态**约定——`AGENTS.md`/`CLAUDE.md` 的 `<!-- codemap:start -->…<!-- codemap:end -->` 区块由 codemap 工具链再生成，区块外内容归人维护，两处不可混淆。
- **扩展点**：新增仓库级约定只有三个落点——`AGENTS.md`（agent 可见约定）、`.gitignore`（入库边界）、`.pre-commit-config.yaml`（门禁）；**不允许新增第四个根级治理文档**。

## 上下游关系

> `extracted` = 来自 `workspace.json.cross_module_hints` 的静态引用；`inferred` = Agent 推断待复核

**上游（引用/落到本组）**

| 模块 | 关系 | confidence |
|------|------|-----------|
| `backend`、`backend/src`、`backend/tests`、`backend/scripts` | 被 pre-commit `^backend/` 覆盖；其 `pyproject.toml`/`uv.lock`/`.env.example` 是 README 与 AGENTS 条目的权威源；`conftest.py` 是命令矩阵语义的实现 | extracted |
| `frontend`、`frontend/src`、`frontend/tests`、`frontend/vendor` | 被 `^frontend/` 覆盖；`package.json`/`vite.config.ts`/`frontend/biome.json` 决定 README 阈值与 lint 口径 | extracted |
| `agent_hub-main`、`agent_hub-main/installer` | 引用根目录（README/LICENSE 路径），同时是被 `.gitignore`/`files` 正则刻意排除、`MIT` 许可例外保护的对象 | extracted |
| `.claude/commands`、`.claude/skills`、`.opencode/commands`、`.opencode/skills` | `opsx-*` 变更流程以根文档三源同步为验收；`.gitignore` 排除其 codemap 技能目录 | inferred |
| `.github/workflows` | 与本组互为镜像：CI 注释指向 `openspec/specs/ci-quality-gates`，本组声明「pre-commit 复现 CI」 | extracted |

**下游（本组引用/依赖谁）**

| 模块 | 引用原因 | confidence |
|------|---------|-----------|
| `.github/workflows` | `.pre-commit-config.yaml` 与 README「质量门禁」以 CI 为唯一事实 | extracted |
| `backend`（含 `pyproject.toml`/`uv.lock`/`.env.example`） | ruff 版本钉、`fail_under=80`、环境变量三源同步 | extracted |
| `frontend`（含 `package.json`/`vite.config.ts`/`biome.json`） | Biome 版本钉、`thresholds 55/55`、实际 lint/格式化规则 | extracted |
| `openspec/`（知识源，`exclude_dirs` 内不参与模块建模） | 治理规格的权威文本（`repo-hygiene`、`ci-quality-gates`、`e2e-test-infra`、`system-architecture`） | extracted |

## 本模块改动前的自检问句

1. 这条命令/阈值/版本，代码与 CI 里现在**真的是这个值**吗（三源是否一致）？
2. 中文版 README 改了，英文版同节是否同时存在（当前英文版整体缺 `## Quality gates`）？
3. 新引入的生成目录/文件是否同时判定过「要不要 `.gitignore`」与「要不要 `frontend/biome.json` 排除」（两者互相独立，`useIgnoreFile: false`）？
4. 我要写的约定是否属于 agent 上下文（→ `AGENTS.md` 区块外），而不是新开一份根文档？
5. 涉及第三方代码的落库位置，是否触碰 `agent_hub-main`（MIT）或 Bitget SDK（必须包依赖、不得 fork）这两条既有边界？
