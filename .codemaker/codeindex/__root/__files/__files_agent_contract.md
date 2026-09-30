---
type: "Fragment"
id: __root/__files/agent_contract
title: "Agent 指令与提交前门禁"
description: "AGENTS.md 与 pre-commit 到底约束了哪些命令和工具版本？改动会破坏什么？"
parent: /__root/__files/_overview.md
fragment: agent_contract
architectural_role: "仓库治理层——把 CI 契约下沉到本地（pre-commit）与到 AI 会话上下文（AGENTS.md/CLAUDE.md）"
entity_names:
  constants:
    - name: "ruff-pre-commit rev"
      value: "v0.16.8"
      source: .pre-commit-config.yaml（需与 backend/uv.lock 中 ruff==0.16.8 一致）
    - name: "biome pre-commit 插件 rev"
      value: "v2.5.9"
      source: .pre-commit-config.yaml（`astral-sh`/`biomejs` 插件仓库版本）
    - name: "@biomejs/biome additional_dependencies"
      value: "2.5.14"
      source: .pre-commit-config.yaml（需与 frontend/package.json devDependency `^2.5.14` 一致）
    - name: "ruff 钩子作用范围"
      value: "files: ^backend/"
      source: .pre-commit-config.yaml
    - name: "biome 钩子作用范围"
      value: "files: ^frontend/"
      source: .pre-commit-config.yaml
    - name: "L1 完整性 marker 命令"
      value: "python -m pytest -m integrity"
      source: AGENTS.md（表格 L1 行）
    - name: "L2 live marker 命令"
      value: "python -m pytest -m live --run-live"
      source: AGENTS.md（表格 L2 行）
    - name: "L3 浏览器旅程命令"
      value: "cd frontend && npm run test:e2e"
      source: AGENTS.md（表格 L3 行）
    - name: "外网用例开关"
      value: "--run-online（缺省 skip，不允许失败）"
      source: AGENTS.md Notes
    - name: "codemap 区块定界注释"
      value: "<!-- codemap:start --> / <!-- codemap:end -->"
      source: AGENTS.md / CLAUDE.md
retrieval_hints:
  - "跑某层测试的正确命令是什么？为什么 `pytest -q` 没有启动 uvicorn？"
  - "本地提交被 pre-commit 阻断了，它到底执行了哪些检查、只管哪些目录？"
  - "AI 编码助手在这个仓库里被强制使用哪些工具约定（codemap 优先于 grep）？"
  - "⚠️ 你要找的是 pytest marker 的**注册与跳过实现**，不在这里 → 在 `backend`（file-group，`pyproject.toml`）与 `backend/tests`（`conftest.py`）；本组只做命令口径声明。"
  - "⚠️ 你要找的是 CI 实际 job 步骤/缓存策略，不在这里 → 在 `.github/workflows` 模块；pre-commit 只是它的本地镜像，覆盖范围更小（不含 typecheck/coverage）。"
  - "⚠️ 你要找 Playwright E2E 用例与诊断脚本，不在这里 → 在 `frontend/tests`。"
  - "本文件组也叫「仓库治理三件套 / Agent 说明书 / 提交前门禁」，对应需求中的「CI 一致性」「工具版本钉」「测试命令矩阵」。"
  - "架构归属句：新的**跨层命令口径或工具版本钉**必须写进 AGENTS.md 的 Notes 与 .pre-commit-config.yaml 注释，**不得新建独立的 ROOT_GUIDE/CONTRIBUTING 文件**分散约束。"
---

## 业务意图

解决两个具体的失效模式：

1. **本地通过、CI 红。** `.pre-commit-config.yaml` 的存在意义就是把 CI 的 lint/format 检查前置到 commit，并显式钉住与 CI 相同的工具版本（注释里写明 "Keep in sync with ..."），使开发者不会在 push 之后才发现格式化差异。
2. **AI 会话每次重新摸索仓库约定。** `AGENTS.md`（以及仓库内曾以同一定位存在的 `CLAUDE.md`）是被 agent CLI 自动注入的上下文，承载「三层测试怎么跑」「必须用 codemap 而不是 grep」这类不需要读代码就该知道的规则。写错的代价不是文档难看，而是**每一次会话都重复犯同一个错**。

## 对外接口（本组无协议；接口=约束条目）

| 约束载体 | 面向谁 | 业务说明 | 生效时机 |
|---------|--------|---------|---------|
| `.pre-commit-config.yaml` → `ruff-check`（`--fix`） | 后端提交者 | 对 `^backend/` 文件做 lint 并**自动改写工作区** | 本地 `git commit`（需 `pre-commit install`） |
| `.pre-commit-config.yaml` → `ruff-format` | 后端提交者 | 对 `^backend/` 做格式化 | 同上 |
| `.pre-commit-config.yaml` → `biome-check` | 前端提交者 | 对 `^frontend/` 做 lint+format | 同上 |
| `AGENTS.md` · Test Suite 表 + Notes | 人与 AI agent | 三层测试命令、marker 缺省行为、隔离 fixture 关键 env、缺口白名单文件位置 | 每次 agent 会话开始 |
| `AGENTS.md` · codemap 区块 | AI agent | 强制 codemap MCP 优先；批量查询；计数类问题用 `query_cypher`；subagent 用 `general` 不用 `explore` | 每次 agent 会话开始 |

## 变更风险（改它会破坏什么）

- **[版本漂移 → 双向假信号]** `ruff-pre-commit rev: v0.16.8` 必须等于 `backend/uv.lock` 锁定的 ruff 版本；`additional_dependencies: ["@biomejs/biome@2.5.14"]` 必须落在 `frontend/package.json` 的 `^2.5.14` 内。任一升级只改一侧，就会出现「本地 hook 判定通过但 CI `ruff check` 失败」或反之；后果是提交者开始绕过/关闭门禁。
  （来源: `.pre-commit-config.yaml` 内两处 "Keep in sync" 注释；`openspec/specs/ci-quality-gates/spec.md` · "钩子使用的工具与版本 SHALL 与 CI 保持一致，避免本地与 CI 结果不一致"）
- **[目录作用域被放宽]** 两个 hook 都靠 `files: ^backend/` / `files: ^frontend/` 限定范围。**删掉 `files` 会让 pre-commit 去检查仓库根文档、`agent_hub-main/`（第三方参考项目）与 `openspec/` 规格**，产生大量与代码无关的阻断与自动改写；`agent_hub-main/` 尤其危险——它是 MIT 引入的参考项目，不应被本仓库格式化规则改写。
- **[`--fix` 的副作用]** `ruff-check` 带 `args: [--fix]`：一次 commit 可能改了你的工作区文件却只提交部分改动；不要在 CI 中依赖 pre-commit（CI 直接跑 `ruff check .`，不带 `--fix`）。
- **[pre-commit 不是强制门禁]** 它只在开发者手工 `pip install pre-commit && pre-commit install` 后生效，且**不覆盖** typecheck、单测、覆盖率——这些只在 CI 与本组 README 命令矩阵里。把它当作完整门禁是错误的假设。
  （来源: `README.md ## 质量门禁` + `.github/workflows/ci.yml`）
- **[AGENTS.md 是活文档，但 codemap 区块是机器区块]** `<!-- codemap:start --> … <!-- codemap:end -->` 之间的内容由 codemap 工具链再生成；在区块外手写内容才归人维护。**在区块内手工定制会被下次生成覆盖**（历史上 `CLAUDE.md` 与 `AGENTS.md` 由同一条 codemap 区块同时维护）。
- **[文档-实现耦合]** 三层命令矩阵并非自由文本：规格要求 `AGENTS.md`、`README.md` 记录的命令与 pytest marker 策略一致，且"未传 `--run-live` 时 L2 在 collection 阶段被跳过、不实例化 `live_server`"。把 `pytest -m live` 不带 `--run-live` 写进文档会得到与描述不符的行为；把 L2 写成默认执行会摧毁 `python -m pytest -q` 的「快速全绿」性质。
  （来源: `openspec/specs/e2e-test-infra/spec.md` · "L2 用例选择策略"、"测试命令与 marker 策略一致"）
- **[缺口白名单唯一入口]** AGENTS.md 指明缺口白名单在 `backend/tests/data_registry.py` 的 `KNOWN_GAPS`（type B 微缺口，硬门禁）与 `STRUCTURAL_EXEMPTIONS`（type A 结构性缺口）。在别处新增豁免白名单会让 L1 校验形同虚设。

## 边界约束（能做什么 / 禁止做什么）

- ✅ **可以**：升级 ruff / Biome 时同批修改 `rev` + 对应 lock/package 版本 + CI（若 CI 固定了版本），并同步 README 的版本声明。
- ✅ **可以**：在 AGENTS.md codemap 区块**之外**补充仓库级约定（当前「三层测试」章节即位于区块之前）。
- ❌ **禁止**：新增一个独立根文档（`CONTRIBUTING.md` / `ROOT_GUIDE.md`）承载测试或门禁口径——会造成 agent 读到的两份上下文互相矛盾；根级 md 只有 `AGENTS.md`、`CLAUDE.md`、`README*.md` 三个入口。
- ❌ **禁止**：把测试/门禁的**实现细节**（marker 注册、fixture 逻辑、覆盖率阈值）写进本组文件。本组只声明命令与契约，实现权威源在 `backend/pyproject.toml`、`backend/tests/conftest.py`、`frontend/vite.config.ts`。
- ❌ **禁止**：在 AGENTS.md 中把 subagent 类型写成 `explore`（它不支持 MCP，调不到 codemap 工具）——必须 `general`。
  （来源: `AGENTS.md` Rules 末条）

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号/文件 | confidence |
|---------|---------|--------------|------------|
| `backend`（file-group） | ruff 版本与规则配置的权威源 | `backend/uv.lock`（ruff 0.16.8）、`backend/pyproject.toml [tool.ruff]` | extracted |
| `frontend`（file-group） | Biome 版本与脚本名权威源 | `frontend/package.json`（`@biomejs/biome ^2.5.14`、`lint`/`format:check`） | extracted |
| `.github/workflows` | pre-commit 声称镜像的对象；marker 矩阵注释同源 | `ci.yml`（backend / backend-l2 / frontend jobs） | extracted |
| `backend/tests` | 命令矩阵指向的真实用例与 fixture | `conftest.py:live_server`、`data_registry.py:KNOWN_GAPS`、`test_data_integrity.py` | extracted |
| `frontend/tests` | L3 用例位置 | `frontend/tests/e2e/*.spec.ts` | extracted |
| `.claude` / `.opencode`（commands+skills） | codemap 区块约定的工具由这些技能/命令提供 | `skills/code-index-builder/SKILL.md`、`commands/opsx-*.md` | inferred |

| 调用方模块 | 使用场景 | 关键载体 |
|-----------|---------|---------|
| 全部源码模块 | 提交时经 pre-commit 钩子被检查（backend/ 与 frontend/ 路径下的所有文件） | `.pre-commit-config.yaml` |
| 所有 AI 会话（父 agent 与 subagent） | 自动读取根 `AGENTS.md` 作为项目指令，据此选择工具与命令 | `AGENTS.md` |
| `agent_hub-main` 相关任务 | 依赖「pre-commit 的 `files` 排除使参考项目不被改写」这一保护 | `.pre-commit-config.yaml` |

## 典型调用链

```
开发者 git commit（backend/**.py 有改动）
  .pre-commit-config.yaml:ruff-check (--fix)   ← 本模块入口
    → .pre-commit-config.yaml:ruff-format
      → 提交成功；但真正的门禁仍在远端：
        → .github/workflows/ci.yml:backend job（ruff check/format + pytest -q + -m integrity + coverage gate） ← 跨模块：.github/workflows
```

```
AI 会话内「修一个后端测试失败」
  AGENTS.md:Test Suite 表（选定 L1/L2 命令）        ← 本模块入口
    → AGENTS.md:codemap 区块（要求用 search_code / get_symbol_detail，禁止回退 grep）
      → backend/tests/conftest.py:live_server（仅 --run-live 时实例化）  ← 跨模块：backend/tests
        → backend/tests/data_registry.py:KNOWN_GAPS / STRUCTURAL_EXEMPTIONS ← 跨模块：backend/tests
```

## 实现约束清单

> 修改本组任一条命令、版本或约定前逐条核对。

### 必须保持同步的常量/版本钉

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `rev`（ruff） | `v0.16.8` | `.pre-commit-config.yaml` | 必须等于 `backend/uv.lock` 的 ruff 版本；`[tool.ruff]` 在 pyproject | `openspec/specs/ci-quality-gates/spec.md`「提交前门禁（pre-commit）」 |
| `rev`（biome 插件） | `v2.5.9` | `.pre-commit-config.yaml` | 插件仓库版本，不等同于被测工具版本 | 同上 |
| `additional_dependencies` | `@biomejs/biome@2.5.14` | `.pre-commit-config.yaml` | 真正执行的 Biome 版本，须与 `frontend/package.json` 一致 | 同上；git: `chore(ci): add GitHub Actions + pre-commit gates…` |
| `files`（后端钩子） | `^backend/` | `.pre-commit-config.yaml` | 钩子作用域；不可删除或放宽 | 保护 `agent_hub-main/`、`openspec/` 不被自动改写 |
| `files`（前端钩子） | `^frontend/` | `.pre-commit-config.yaml` | 同上 | 同上 |
| `MD_SCHEDULE_INTERVAL_SECONDS` | `0`（仅测试环境） | `AGENTS.md` Notes | L2 隔离 uvicorn 关闭增量调度 | `openspec/specs/e2e-test-infra/spec.md` |
| `MD_TEST_SERVER_START_TIMEOUT` | 默认 `180s` | `AGENTS.md` Notes | 自适应就绪上限，须显著高于实测冷启动（规格要求 ≥120s） | 同上 |
| `live` / `online` / `integrity` marker | 三个命令开关 | `AGENTS.md` 表 | 缺省：`-q` 跳过 L2；`online` 缺省 skip 且永不因外网失败 | 同上 + `ci-quality-gates` |

### 必须存在的约定条目（缺失即视为治理退化）

| 条目 | 所在文件 | 说明 |
|------|---------|------|
| 三层测试命令表（L1/L2/L3 + 命令 + 覆盖范围） | `AGENTS.md` | 与 `README.md ## 测试` 保持同一口径 |
| `KNOWN_GAPS` / `STRUCTURAL_EXEMPTIONS` 指针 | `AGENTS.md` | 唯一缺口白名单入口，禁止另立白名单 |
| codemap 优先于 grep、批量查询、计数用 `query_cypher`、`general` 而非 `explore` | `AGENTS.md` 区块内 | 工具选择约束，由 codemap 工具链维护 |
| 与 CI 同源的工具版本注释（两处 "Keep in sync"） | `.pre-commit-config.yaml` | 版本漂移的可追溯线索，不可删注释 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 门禁前置程度 | pre-commit 只做 lint/format（CI 的子集） | pre-commit 完整镜像 CI（含测试、覆盖率） | 完整镜像会让每次 commit 变成一次 CI 运行，开发者会直接绕过；测试仍由 CI 与本地手动命令负责（来源: `openspec/specs/ci-quality-gates/spec.md`） |
| Agent 约定载体 | 根级 `AGENTS.md`（跨 CLI 中性名）+ 历史 `CLAUDE.md` | 各家 CLI 各写一份 | 同一份约束服务所有 agent；两份都携带同一 codemap 区块，由工具再生成（工作区现状：`CLAUDE.md` 已被删除但未提交，见下） |
| 版本钉策略 | 显式写死 `rev` + `additional_dependencies` | `latest`/浮动的版本区间 | 浮动版本会让本地与 CI 结果不可复现，正是该文件要消除的问题 |

## 现状注记（构建本次扫描时观察到）

- `CLAUDE.md` 在 `git ls-files` 中被跟踪，但工作区已删除（`git status` 显示 ` D CLAUDE.md`）。其历史内容为纯 codemap 区块，与 `AGENTS.md` 的区块重复——保留 `AGENTS.md` 单一入口即可，但**删除动作需正式提交**，否则新克隆的仓库仍会拿到 `CLAUDE.md`，与本文档描述不一致。
- `AGENTS.md` 当前处于已修改未提交状态（` M AGENTS.md`）。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/e2e-test-infra/spec.md`（仅提炼与本组相关的条款）

- CI 的 marker 矩阵：单元 `pytest -q`（`live`/`online` 自动不选中）、L1 `pytest -m integrity`、L2 独立 job `pytest -m live --run-live`、`online` 永不启用；后端依赖以 `uv sync --frozen` + 已提交 `backend/uv.lock` 安装。
- ruff 规则集须显式声明，既有告警只能以规则级 `ignore` 或带原因的单点 `# noqa` 处理，**不得无说明地关闭整条规则**。
- 仓库 SHALL 提供 `.pre-commit-config.yaml`（后端 ruff lint+format、前端 Biome），工具与版本 SHALL 与 CI 一致。
- `AGENTS.md`、`README.md` 记录的测试命令 SHALL 与 marker 实现一致，SHALL NOT 保留会隐式失败或与实现不符的 L2 命令。
