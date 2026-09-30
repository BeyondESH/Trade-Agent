---
type: "Fragment"
id: __root/__files/portal
title: "双语门户与对外契约基线"
description: "README 里声明的版本、环境变量、命令、覆盖率门禁，哪些是真契约、哪些已经和代码不一致？"
parent: /__root/__files/_overview.md
fragment: portal
architectural_role: "仓库唯一对外门面（合同层），README 双语文档与代码事实之间的同步责任方"
entity_names:
  constants:
    - name: "README 声明 · Python 版本"
      value: ">=3.11"
      source: README.md（技术栈 / badge 指向 backend/pyproject.toml）
    - name: "README 声明 · Node 版本"
      value: ">=20（LTS）"
      source: "README.md（与 .github/workflows/ci.yml frontend job 的 node-version 20 一致）"
    - name: "覆盖率棘轮 · 后端基线/阈值"
      value: "81% 实测基线 / fail_under = 80"
      source: README.md（阈值实体在 backend/pyproject.toml `[tool.coverage.report]`）
    - name: "覆盖率棘轮 · 前端基线/阈值"
      value: "55.69% lines & statements / thresholds lines=55, statements=55"
      source: README.md（阈值实体在 frontend/vite.config.ts）
    - name: "L2 服务启动超时旋钮"
      value: "MD_TEST_SERVER_START_TIMEOUT，默认 180s"
      source: README.md（实现读取点在 backend/tests/conftest.py）
retrieval_hints:
  - "这个仓库怎么跑起来？端口、代理、启动命令分别是什么？"
  - "某个 MD_ 环境变量该写进哪张表？改了要同步哪几个文件？"
  - "对外暴露了哪些 REST / WS / SSE 接口？有没有清单可查？"
  - "⚠️ 你要找的是接口的**行为规格与校验规则**，不在这里 → 在 `.codemaker/codeindex/backend/src/src_api_stores.md`；这里只有清单式目录，不定义语义。"
  - "⚠️ 你要找的是 CI 实际执行了哪些步骤，不在这里 → 在 `.github/workflows` 模块；README 只做人类可读摘要。"
  - "本文件组也叫「项目门面 / 双语文档 / 一屏说明书」，对应需求中的「文档同步」「环境要求」「免责声明」。"
  - "架构归属句：新增任何面向用户的启动方式、环境变量、接口条目，**必须写进 README.md 与 README.en.md 两份**，不允许只写中文一份或由 openspec 规格替代。"
---

## 业务意图

README 双语对本仓库承担的不是「介绍」而是**合同**：外部使用者据它决定环境版本、据环境变量表决定能配什么、据「测试」与「质量门禁」两节决定什么样的 PR 会被判失败。因此本组文档与代码之间的任何偏差，都会被下游当作事实执行，属于**缺陷放大点**而不是文档瑕疵。

仓库以 OpenSpec 规格驱动开发：历史功能的权威规格在 `openspec/`，README 只保留「面向使用者的一屏事实」。这两者的分工是刻意的——规格描述系统必须怎样，README 描述用户实际怎么跑。

## 对外接口（本组无协议，接口=文档章节契约）

| 章节 | 面向谁 | 业务说明 | 对应实现（权威源） |
|------|--------|---------|-------------------|
| `## 技术栈` / 顶部 badge | 使用者、CI 维护者 | 声明 Python/Node/React/Vite/TS 版本口径 | `backend/pyproject.toml`、`frontend/package.json`、`.github/workflows/ci.yml` |
| `## 快速开始` | 新贡献者 | 唯一被支持的本地启动路径（后端 `:8000` + vite `:5173`，`/api`、`/ws` 代理） | `backend/src/market_data/webapi.py:create_app`、`frontend/vite.config.ts` |
| `## 环境变量` | 运维、测试 | `MD_` 前缀配置全表（含默认值），是 `.env.example` 的可读镜像 | `backend/src/market_data/config.py`（`Settings`）、`backend/.env.example` |
| `## 测试` | 贡献者 | 三层测试命令矩阵与 marker 开关语义 | `backend/pyproject.toml` markers、`backend/tests/conftest.py` |
| `## 质量门禁` | 贡献者、reviewer | CI 摘要 + 本地等价命令 + 覆盖率棘轮策略 | `.github/workflows/ci.yml`、`backend/pyproject.toml`、`frontend/vite.config.ts` |
| `## 项目结构` | 所有人 | 目录树事实清单（禁止列不存在/空目录） | 实际文件系统（由 `repo-hygiene` 规格强制） |
| `## 主要 API` | 前端与二次开发者 | REST/WS/SSE 端点目录 | `backend/src/market_data/webapi.py` 路由注册 |
| `## 许可证` | 二次分发者 | GPL-3.0 义务 + `agent_hub-main/` MIT 例外 + 免责声明 | `LICENSE`、`agent_hub-main/LICENSE` |

## 变更风险（改它会影响什么）

- **[同步义务] 环境变量三处必须同源。** `Settings` 字段（含 `MD_` 前缀与别名）、`backend/.env.example`、README 环境变量表三者 SHALL 覆盖同一变量集合，新增字段（例如历史上的 `MD_AGENT_SCHEDULE_ENABLED`）必须在**同一个变更内**同步两份 README。漏同步的直接后果：使用者按 README 配了不存在的变量或漏配必需 Key（`BB_API_KEY` 缺失时快讯接口降级），排查成本落在行情/新闻模块。
  （来源: `openspec/specs/repo-hygiene/spec.md` · "`.env.example` 与环境变量表同步"）
- **[已检测到漂移] `README.en.md` 缺 `## Quality gates` 节。** 中文版有「质量门禁」（棘轮策略 + 本地等价命令 + pre-commit 安装），英文版 `## Testing` 之后直接进入 `## Project Structure`，且全文无 `pre-commit` / 覆盖率阈值字样。英文读者因此**看不到覆盖率只升不降这一硬约束**，英文版 PR 更可能把阈值调低。属于待修复项，不是可接受差异。
- **[只升不降] 覆盖率阈值下调即视为回归。** README 明确记录棘轮策略：阈值取自初次实测基线并向下取整，后续只允许上调；基线值（81% / 55.69%）与阈值（80 / 55）分列两栏，改任一都必须同步另一份文档与两侧配置文件，否则文档与门禁互相打脸。
  （来源: `openspec/specs/ci-quality-gates/spec.md` · "双端覆盖率门禁"）
- **[门禁范围] `## 项目结构` 不得写占位目录。** 规格要求只列真实存在的目录/文件，MUST NOT 出现空目录或占位条目（历史上因此删除过空 `docs/` 条目——该目录仍可能以空壳存在于本地工作区，不进 README）。
  （来源: `openspec/specs/repo-hygiene/spec.md` · "README 项目结构与实际目录一致"）
- **[免责与许可口径] 免责声明、"默认纸面运行"、"衍生作品必须同样 GPL-3.0 开源" 三段属于法律口径**，改文案前需确认与 `LICENSE` 正文（第 15–17 条无担保条款）与 `## 许可证` 节的表述一致；`agent_hub-main/`（MIT，Copyright (c) 2025 Bitget）不受本仓库 GPL-3.0 约束，不得在文档中被写成同一许可。

## 边界约束（能做什么 / 禁止什么）

- ✅ **可以**：在 README 增补功能特性、端点目录、环境变量、本地等价命令；中英文**同步**增补。
- ✅ **应该**：凡「规格 vs 文档」出现分歧，先改 `openspec/` 规格并归档，再回写 README；README 不定义行为，只转录事实。
- ❌ **禁止**：在 README 里写未被测量/未被 CI 执行的命令或阈值（如把 L3 Playwright E2E 写成 CI 门禁）——`online` 用例在 CI 中保持 skip、Playwright 不入 CI，文档若宣称相反即为虚假承诺。
  （来源: `openspec/specs/ci-quality-gates/spec.md` · "SHALL NOT 传入 `--run-online`"；`.github/workflows/ci.yml` 顶部注释）
- ❌ **禁止**：把 Bitget SDK（`bitget-agent-sdk` / `bitget-agent-mcp` / `bitget-signal`）写成可 fork 内置的源码，或文档中暗示仓库内含其源码副本——它们以包形式消费。
  （来源: `openspec/specs/system-architecture/spec.md` · "系统主语言 SHALL 为 Python，并以依赖形式消费 `bitget-agent-hub`，不得 fork 修改其源码"）
- ❌ **禁止**：削弱「默认运行在模拟盘（Paper），实盘风险自负」这一表述——它是系统安全基线（默认纸面、实盘需显式开启 + 二次确认）在文档层的唯一外露点。
  （来源: `openspec/specs/system-architecture/spec.md` · "安全基线默认纸面"）

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号/文件 | confidence |
|---------|---------|--------------|------------|
| `backend/src` | 环境变量表、API 目录转录自 `Settings` 与路由注册 | `config.py:Settings`、`webapi.py:create_app` | extracted |
| `backend`（file-group） | `.env.example` 与 README 变量表逐项对齐 | `backend/.env.example` | extracted |
| `frontend`（file-group） | 前端版本、lint/format/typecheck/coverage 脚本名与阈值 | `package.json` scripts、`vite.config.ts` thresholds | extracted |
| `.github/workflows` | 「质量门禁」节是 CI 步骤的人类可读摘要 | `ci.yml` jobs | extracted |
| `openspec/`（被扫描排除，非代码模块） | 功能与规格的权威来源，README 只摘要 | `specs/repo-hygiene`、`specs/ci-quality-gates`、`specs/system-architecture` | extracted |

| 调用方模块 | 使用场景 | 关键符号 |
|-----------|---------|---------|
| 全部模块 | Agent/新人首次进入仓库时的默认上下文来源（技术选型、命令、端口） | `README.md`、`README.en.md` |
| `frontend/tests`、`backend/tests` | 用例失败/跳过口径以README「测试」节为对外解释 | 三层命令矩阵 |
| `.claude` / `.opencode` 命令技能 | `opsx` 文档同步类变更以 README 三处一致为验收条件 | `repo-hygiene` 要求 |

## 典型调用链（文档事实 → 代码权威源）

```
需求新增一个环境变量
  → backend/src/market_data/config.py:Settings 定义字段（唯一权威源）
    → backend/.env.example 补占位行                ← 跨模块（backend file-group）
    → README.md ## 环境变量 补行                    ← 本模块入口
      → README.en.md ## Environment Variables 同步补行 ← 本约束常漏（当前英文版已整体缺 Quality gates）
```

```
贡献者按文档自检
  README.md ## 质量门禁（本地等价命令）
    → .github/workflows/ci.yml:backend / backend-l2 / frontend job ← 跨模块：.github/workflows
      → backend/pyproject.toml:[tool.coverage.report] fail_under=80 ← 跨模块：backend
      → frontend/vite.config.ts:coverage.thresholds(55/55)          ← 跨模块：frontend
```

## 实现约束清单

> 改动 README 双语本前必须逐条核对。

### 必须保持同步的字面量（文档 ↔ 代码）

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| Python 下限 | `>=3.11` | README + `backend/pyproject.toml` + `ci.yml` | CI 与本地必须同版本口径 | `openspec/specs/ci-quality-gates/spec.md`「CI 流水线与作业编排」 |
| Node 版本 | `20`（≥20 LTS） | README + `ci.yml` frontend job | 前端构建环境口径 | 同上 |
| 后端覆盖阈值 | `fail_under = 80`（基线 81%） | README + `backend/pyproject.toml` | 棘轮只升不降 | 同上「双端覆盖率门禁」；git: `chore(ci): add GitHub Actions + pre-commit gates, untrack large build artifact, sync env/readme docs` |
| 前端覆盖阈值 | `lines=55`、`statements=55`（基线 55.69%） | README + `frontend/vite.config.ts` | 同上 | 同上 |
| L2 启动超时 | `MD_TEST_SERVER_START_TIMEOUT` 默认 `180s` | README + `AGENTS.md` + `backend/tests/conftest.py` | 三处表述必须一致，且 MUST 显著高于实测冷启动 | `openspec/specs/e2e-test-infra/spec.md`「live_server 启动与自适应就绪」 |
| L2 隔离开关 | `MD_SCHEDULE_INTERVAL_SECONDS=0` | README/`AGENTS.md` + `backend/tests/conftest.py` | 测试期关闭增量调度 | `openspec/specs/e2e-test-infra/spec.md` |

### 必须实现的文档章节（缺章节即视为漂移）

| 章节 | 所在文件 | 说明 |
|------|---------|------|
| `## 质量门禁` | `README.md` | 含棘轮策略表、本地等价命令、pre-commit 安装一句话 |
| `## Quality gates`（缺失） | `README.en.md` | **当前不存在，需补齐**；补齐前英文读者无法获知门禁与 pre-commit 契约 |
| `## 项目结构` / `## Project Structure` | 两份 README | 只列真实存在目录；结构性变更后必须重核 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 权威源分工 | 规格写 `openspec/`，README 只做使用者视角摘要 | README 兼任规格文档 | `openspec/` 有 131 份已归档规格，README 若复刻必然腐化；`scan_mode` 已把 `openspec` 排除出模块扫描（来源: `workspace.json` `exclude_dirs`） |
| 双语维护 | 两份手工平行维护（`README.md` 为主源） | 单一语言 + 自动生成 | 无 i18n 工具链，实测已漂移（英文版少 38 行）→ 说明「主源优先 + 同步检查」是当前唯一可执行约束 |
| 覆盖率基线记录位置 | README 表格同时写「初始基线」和「门禁阈值」 | 只写阈值 | 阈值低于基线是刻意为之（防初次启用即红），只写阈值会诱使他人上调到实测值以上 |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/e2e-test-infra/spec.md`、`openspec/specs/system-architecture/spec.md`（仅提炼与本组文档相关的条款，非完整转录）

- `.env.example` ↔ README 环境变量表 ↔ `Settings` 三源同步，同一变更内完成。
- README 项目结构不得含空目录/占位条目；规格与设计文档权威来源为 `openspec/`。
- 测试命令矩阵（单元 / L1 / L2 / online）在 `AGENTS.md` 与 `README.md` 中 SHALL 与 marker 实现一致，SHALL NOT 保留会隐式失败的 L2 命令写法。
- 覆盖率初始阈值 MUST NOT 高于实测基线，且 SHALL 在文档中记录「只升不降」棘轮策略。
- 默认纸面交易、凭据仅从环境变量读取、Bitget SDK 以包形式引入不得 fork。
