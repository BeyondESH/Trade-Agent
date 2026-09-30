---
type: "Fragment"
id: __root/__files/repo_boundary
title: "仓库边界与许可合规"
description: "哪些文件禁止入库？根 biome.json 起什么作用？GPL-3.0 与 agent_hub-main 的 MIT 如何共存？"
parent: /__root/__files/_overview.md
fragment: repo_boundary
architectural_role: "仓库边界层——版本控制纳入范围（.gitignore）、工具配置解析边界（biome.json）、法律边界（LICENSE）三合一"
entity_names:
  constants:
    - name: "知识库产物忽略项"
      value: ".codemaker/codeindex/"
      source: .gitignore
    - name: "codemap 构建产物忽略项"
      value: ".codemap/ 与 .codemaker/codemap/"
      source: .gitignore
    - name: "本地 agent 工作区忽略项"
      value: ".omo/（注释：Local agent workspace (never shared)）"
      source: .gitignore
    - name: "构建导出产物忽略项"
      value: "build_ap_cmh.json"
      source: .gitignore（注释：generated AP config dumps）
    - name: "缓存/覆盖率忽略项"
      value: ".pytest_cache/ .ruff_cache/ .coverage coverage.json htmlcov/ coverage/"
      source: .gitignore
    - name: "根 Biome 配置标记"
      value: '"root": true'
      source: biome.json
    - name: "Biome schema 版本"
      value: "2.5.14"
      source: biome.json（`$schema` URL，与 frontend/package.json 的 @biomejs/biome 对齐）
    - name: "许可证"
      value: "GPL-3.0-or-later（LICENSE 正文 674 行，GNU GPL v3, 29 June 2007）"
      source: LICENSE
    - name: "参考项目许可例外"
      value: "MIT，Copyright (c) 2025 Bitget"
      source: agent_hub-main/LICENSE（README ## 许可证 声明其不受本仓库 GPL-3.0 约束）
retrieval_hints:
  - "为什么 .codemaker/codeindex/ 和 workspace.json 在 git status 里？哪个该被忽略、哪个不该？"
  - "根目录的 biome.json 只有一个 root:true，是不是可以直接删？"
  - "别人基于本项目做二次开发，许可上要做什么？agent_hub-main 目录算哪份许可？"
  - "⚠️ 你要找的是前端**具体的 lint/格式化规则**（quoteStyle、includes 排除 vendor 等），不在这里 → 在 `frontend`（file-group）的 `frontend/biome.json`；根文件只声明配置解析边界。"
  - "⚠️ 你要找的是 CI 里覆盖率报告如何生成，不在这里 → 在 `.github/workflows`；这里只保证产物不入库。"
  - "⚠️ 你要找 Bitget MCP/SDK 的调用契约，不在这里 → 在 `backend/src`；本组只规定它必须以包形式引入、不得 fork 入库。"
  - "本文件组也叫「忽略规则 / 卫生门禁 / 授权边界」，对应需求中的「不入库」「vendor 目录」「开源许可」「免责声明」。"
  - "架构归属句：需要排除某个新生成的产物目录时，**只能追加到根 `.gitignore`**（并按职责就近注释），不得为子目录另建一份互相冲突的忽略清单，也不得靠手工 `git rm --cached` 长期掩盖。"
---

## 业务意图

回答三个「不该发生的事如何防止」：

1. **不该入库的东西别进来**：`.gitignore` 把本地 agent 工具链产物（codemap/codeindex 知识库、`.omo/`、`.codex/`、`.cursor/`、`opencode.json`、`.mcp.json`）、一次性构建导出（`build_ap_cmh.json`）和测试/覆盖率缓存挡在版本库外。知识库尤其关键——`codeindex` 产物会被 Grep 大量命中、且体量大，一旦入库会同时污染检索和 diff。
2. **工具配置解析边界要有一道终止符**：根 `biome.json` 用 `"root": true` 声明仓库根是 Biome 配置解析链的终点，避免从 `frontend/`（其自身配置标 `"root": false`）向上查找时越出仓库、命中开发机上层目录的私人配置。
3. **法律边界要写清**：`LICENSE` 落入 GPL-3.0 全文 674 行，配合 README「许可证」节的两条口径——衍生作品必须同样以 GPL-3.0 开源；`agent_hub-main/` 是引入的 MIT 参考项目（Bitget 版权），不受本仓库 GPL-3.0 约束。

## 对外接口

| 边界 | 方向 | 关键字段/条目 | 业务说明 | 权威约束源 |
|------|------|-----------|---------|-----------|
| `git` 纳入范围 | 本组 → 版本库 | 38 条 `.gitignore` 规则（含 5 条注释分组） | 决定 `git status` / CI checkout 看到什么 | `openspec/specs/repo-hygiene/spec.md` |
| Biome 配置链 | 本组 → 前端工具 | `root: true` + `$schema: .../2.5.14/schema.json` | 声明仓库根为配置解析终点；**不含任何规则** | `frontend/biome.json`（`root:false`，含 `includes` 排除 vendor/dist/coverage/playwright-report/test-results） |
| 许可与免责 | 本组 → 使用者/再分发者 | GPL-3.0；无担保条款（第 15–17 条）；MIT 例外目录；「仅供学习研究、默认模拟盘」 | 约束二次分发义务与技术风险提示 | `LICENSE`、`agent_hub-main/LICENSE`、`README.md ## 许可证` |

## 变更风险（改它会破坏什么）

- **[删除 `.gitignore` 中任一知识库条目]** `.codemaker/codeindex/`、`.codemaker/codemap/`、`.codemap/`、`.claude/skills/codemap-*/`、`.agents/skills/code-index-*/` 一旦可跟踪，会把 Agent 生成的中间产物提交进去：仓库体积膨胀、评审 diff 被噪声填满、并且知识产物会与源码产生「两份真相」。规格明确要求「构建产物不入库 / `.gitignore` 覆盖本地与 CI 产物」。
  （来源: `openspec/specs/repo-hygiene/spec.md` 两条 Requirement；`SKILL.md` Step 8.0 亦要求 `codeindex/` 中不得混入 `_desc_context.md` 等中间产物）
- **[删除/改写根 `biome.json`]** 移除 `root:true` 后，Biome 从 `frontend/` 向上解析配置时不再在仓库根止步，可能读到仓库外（用户目录/上层工程）配置，导致**同一份代码在不同机器上格式化结果不同**；若在根文件里随手加规则，则会与 `frontend/biome.json` 的规则叠加，产生「本地格式化和 CI 不一致」的隐性冲突。根文件的正确形态就是只有 `root` 与 `$schema`。
- **[只加 `frontend/biome.json` 的排除、不加 `.gitignore`（或反之）]** 二者是两套独立清单：`frontend/biome.json` 明确 `"vcs": { "useIgnoreFile": false }`，即 Biome **不读** `.gitignore`。所以「git 里干净」不代表「lint 覆盖到」，反之亦然——例如 `coverage/`、`htmlcov/`、`build_ap_cmh.json` 只在 `.gitignore` 里，`vendor`/`dist`/`playwright-report` 只在 Biome `includes` 里。新增生成目录时必须**两边同时判断**。
- **[许可表述被改弱]** 把「衍生作品必须同样以 GPL-3.0 授权并开放源代码」改成模糊表述，或与 `agent_hub-main` 的 MIT 表述混同，会直接误导二次开发者做不合规分发；同时 GPL-3.0 与仓库内「fork 引入第三方源码」的组合风险很高——规格因此从架构侧要求 Bitget SDK 以 npm 包依赖形式引入，仓库内不得存源码副本。
  （来源: `openspec/specs/system-architecture/spec.md` · "各层职责隔离" / "依赖以包形式引入" Scenario）
- **[免责声明删除]** 「仅供学习研究 / 不构成投资建议 / 默认 Paper」是本仓库对外的风险切割声明，同时也是 `system-architecture` 规格「安全基线默认纸面、实盘须显式开启 + 二次确认」在文档层的投影，删改即失去一致性。

## 边界约束（能做什么 / 禁止做什么）

- ✅ **可以**：按分组追加忽略项（现有分组：Agent 工具链 → 本地工作区 → 构建导出 → 测试与 lint 缓存），并在成组处留一行注释说明「这是什么、为什么」。
- ✅ **必须**：若某目录既可能进 git 又会被 lint 扫到，同时更新 `.gitignore` 与 `frontend/biome.json` 的 `files.includes`（后者需真实前缀匹配，如 `!vendor`、`!dist`、`!coverage`）。
- ❌ **禁止**：将 `.codemaker/`、`workspace.json` 之类**当前由工具生成**的文件纳入版本库；`workspace.json` 目前显示未忽略且未跟踪（`?? workspace.json`）——它属于 codemap enhance 的临时输入，收尾应清理，而不是提交（见「现状注记」）。
- ❌ **禁止**：在根 `biome.json` 添加 `linter.rules` / `formatter` 规则来「统一全仓风格」。前端规则的唯一归属地是 `frontend/biome.json`；根文件不承担规则定义。
- ❌ **禁止**：在仓库内置入被 fork 修改的 `bitget-agent-*` 源码，或把 `agent_hub-main/` 的代码搬进 `frontend/src`、`backend/src` 后仍声称其保持 MIT——一旦被 GPL 主体吸收，衍生部分即落入 GPL-3.0 义务。搬运前必须重新确认可兼容性并记录来源。
- ❌ **禁止**：删除 `LICENSE` 全文（当前 674 行完整 GPL-3.0），只保留 README 的指向性描述。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号/文件 | confidence |
|---------|---------|--------------|------------|
| `frontend`（file-group） | 实际 Biome 规则所在；`root:false` 与根配置构成解析链 | `frontend/biome.json`（`files.includes`、`formatter`、`linter.rules`） | extracted |
| `backend`（file-group） | 后端侧同名卫生门禁（`backend/.gitignore`）与 ruff 配置 | `backend/.gitignore`、`backend/pyproject.toml [tool.ruff]` | extracted |
| `.github/workflows` | CI checkout 后 `.gitignore` 决定工作区 cleanliness；覆盖率产物由 CI 生成 | `ci.yml`（`--cov-report=term-missing`、`npm run test:coverage`） | extracted |
| `agent_hub-main`（file-group） | MIT 参考项目整体，被许可例外条款覆盖，也被 lint/pre-commit 作用域排除 | `agent_hub-main/LICENSE`、`.pre-commit-config.yaml` 的 `files` 限定 | extracted |
| `openspec/`（扫描排除） | 规格层规定「构建产物不入库」「.gitignore 覆盖本地与 CI 产物」 | `specs/repo-hygiene/spec.md` | extracted |

| 调用方模块 | 使用场景 | 关键载体 |
|-----------|---------|---------|
| 全部模块 | 任何生成型产物（导出 JSON、缓存、覆盖率、报告目录）是否入库由 `.gitignore` 判定 | `.gitignore` |
| `frontend/*` 全部 TS 变更 | Biome 配置解析链以根文件为终点 | `biome.json` |
| 外部二次开发者 / 分发者 | 许可义务与免责口径（含 `agent_hub-main` 例外） | `LICENSE` + `README.md ## 许可证` |

## 典型调用链

```
开发者生成一份导出/缓存产物（如本地跑覆盖率或 agent 工具）
  仓库根 .gitignore                       ← 本模块入口
    → 命中忽略 → git status 干净 → CI 工作区不含该产物   ← 跨模块：.github/workflows
    → 未命中 → 被提交 → 违反 repo-hygiene 规格（构建产物不入库）
```

```
前端执行 `npm run lint`（biome check .）
  frontend/package.json scripts           ← 跨模块：frontend
    → frontend/biome.json（root:false，规则与 includes 排除） ← 跨模块：frontend
      → 向上解析配置，至根 biome.json（root:true）终止        ← 本模块边界生效
```

## 实现约束清单

> 动这三份文件前逐条核对。

### 必须保持存在的忽略项

| 标识符/条目 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| 知识库产物 | `.codemaker/codeindex/` | `.gitignore` | 保证知识库不入库、不污染检索 | `openspec/specs/repo-hygiene/spec.md`；知识库根解析规则（`SKILL.md` Step 0-config） |
| codemap 中间物 | `.codemap/`、`.codemaker/codemap/` | `.gitignore` | 索引/WAL/构建缓存 | 同上 |
| Agent 本地工作区 | `.omo/`、`.codex/`、`.cursor/`、`.agents/skills/code-index-*/`、`.claude/skills/codemap-*/` | `.gitignore` | 「never shared」——工具与机器相关 | 同上；注释原文 `Local agent workspace (never shared).` |
| Agent 本地配置 | `opencode.json`、`.mcp.json`、`.claude/settings.local.json`、`.codemaker/rules/codemap.mdc`、`.codemaker/mcps.json`、`.codemaker/hooks.json` | `.gitignore` | 含本机路径/凭据风险，禁止入库 | 同上 |
| 构建导出 | `build_ap_cmh.json` | `.gitignore` | 生成的 AP 配置 dump，体积大且无语义 diff | `openspec/specs/repo-hygiene/spec.md` Scenario「构建产物被忽略」 |
| 测试/覆盖率缓存 | `.pytest_cache/`、`.ruff_cache/`、`.coverage`、`coverage.json`、`htmlcov/`、`coverage/` | `.gitignore` | pytest-cov（后端）+ vitest v8（前端）产物 | L1/L2/覆盖率门禁运行副产物（见 README `## 质量门禁`） |

### 必须保持的文件形态

| 项 | 期望形态 | 说明 |
|----|---------|------|
| `biome.json`（根） | 仅 `root: true` + `$schema`（2.5.14） | 一旦加入规则，即与 `frontend/biome.json` 形成双真相 |
| `frontend/biome.json` | `root: false` + `vcs.useIgnoreFile: false` | 明确「Biome 忽略清单独立于 `.gitignore`」，因此新增排除项必须显式写 |
| `LICENSE` | GPL-3.0 全文（674 行） | 许可文本不可缩写；README 只做摘要与指向 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 忽略清单粒度 | 单份根 `.gitignore` + 子目录各留最小 `.gitignore`（`backend/.gitignore`、`frontend/.gitignore`） | 纯根清单 | 子包独立构建/打包时需要本地忽略；跨仓共性（知识库、缓存、导出）集中在根，便于按分组审查 |
| Biome 配置分层 | 根只声明解析边界，规则落在 `frontend/biome.json` | 根放共享规则、前端继承 | 当前只有前端用 Biome；根放规则会让未来任何新 JS 目录被隐式套用同一风格，且 `--fix` 会改写非前端代码 |
| 第三方代码入库方式 | `agent_hub-main/` 以独立目录 + 独立 MIT 许可原样保留，不参与门禁与格式化作用域 | 复制其代码进 `frontend/src` | 保留许可可追溯性，避免 MIT→GPL 吸收争议；同时避免改写上游代码导致 diff 无意义（来源: `README.md ## 许可证`、`openspec/specs/system-architecture/spec.md` 不得 fork 入仓） |

## 现状注记（本次扫描观察到）

- `workspace.json` 出现在仓库根且状态为**未跟踪未忽略**（`git status` → `?? workspace.json`）。它是 codemap enhance 的临时输入，属「本应被忽略或收尾删除」一类；下次治理变更时应并入 `.gitignore` 的 Agent 工具链分组或直接删除（`.codemaker/codemap/` 已被忽略，根级这份不属于被忽略路径）。
- 根目录仍可能存在空的 `docs/` 目录：`repo-hygiene` 规格要求 README 的「项目结构」不得列空目录/占位条目，因此 `docs/` 不在 README 结构清单中属**正确状态**，不要「补文档目录回来」。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/system-architecture/spec.md`、`openspec/specs/ci-quality-gates/spec.md`（仅提炼与本组相关的条款）

- 仓库 MUST NOT 跟踪生成型产物（例：`build_ap_cmh.json`）；此类文件 SHALL 从版本控制移除并由 `.gitignore` 覆盖，避免仓库膨胀与无意义 diff。
- `.gitignore` SHALL 覆盖本地工具与 CI 产生的目录/文件（至少含 `.omo/` 与已识别构建产物）。
- 系统以依赖（npm 包 `@bitget-ai/bitget-agent-*`）形式引入 Bitget 能力，仓库内 MUST NOT 含被 fork 的源码副本。
- 前端 lint SHALL 排除 vendored 与生成目录（`frontend/vendor/**`、`dist/**`、`node_modules/**`），SHALL NOT 扫描或报告其中文件。
