---
type: "Module"
id: "frontend/__files"
title: "前端工程契约"
description: "`frontend/` 根目录这 10 个散落文件不构成任何界面或行情逻辑，但它们共同规定「前端怎样被构建、被类型检查、被 lint、被起服务、被浏览器测试、被排除在版本库之外」——是所有 `frontend/src` 改动能否变成一条绿色 CI 检查、一次可复现安装、一台别人机器上同样能跑的终端的唯一裁决面。"
module_id: "frontend/__files"
architectural_role: "构建与质量门禁契约层（声明式，无业务运行时逻辑）"
world_model_hints:
  - "属于工程契约层：不参与 REST/WS 数据流、不渲染任何像素，但决定 `frontend/src` 是否被编译、被检查、被起在哪个端口、被谁 lint 到"
  - "上游是工程流程而不是业务调用：开发者敲 `npm run xxx`、GitHub Actions frontend job 按脚本名逐步调用、Playwright 的 webServer 反向调用 `npm run dev`"
  - "下游有四类消费者：`frontend/src`（编译与类型/lint 作用域）、`frontend/tests`（L3 运行基建与 vitest 收集口径）、`frontend/vendor`（`file:` 依赖 + alias + types 三条解析路径）、`.github/workflows`（脚本名与 lockfile 契约）"
  - "本层最容易出的事故不是『报错』而是『静默失效』：改了不被加载的配置文件（tailwind.config.js）、改了不被类型检查的目录（tests/e2e）、改了不同步的三处 `@klinecharts/pro` 路径之一"
upstream_modules:
  - module: "."            # 仓库根 .gitignore / .pre-commit-config.yaml / AGENTS.md 的三层测试与门禁口径
    confidence: extracted
  - module: ".github/workflows"  # frontend job 逐步调用本模块 package.json 的脚本名
    confidence: extracted
  - module: "frontend/tests"     # playwright.config.ts 的 webServer 会回身调用 npm run dev
    confidence: extracted
downstream_modules:
  - module: "frontend/src"
    confidence: extracted
  - module: "frontend/vendor"
    confidence: extracted
  - module: "frontend/tests"
    confidence: extracted
  - module: "frontend/scripts"
    confidence: extracted
  - module: "backend/src"        # dev proxy 与 Playwright webServer 指向它的 /health 与 REST 端口
    confidence: extracted
---

## Files

### 源代码路径

- `frontend/`（根级散落文件；`frontend/src`、`frontend/tests`、`frontend/vendor`、`frontend/scripts` 各有独立知识库模块，本模块只覆盖以下 10 个非源码文件）

### 本模块覆盖的散落文件

| 文件 | 性质 | 归属子文档 |
|------|------|-----------|
| `frontend/package.json` | 命令面真源（11 个 script）+ 依赖面（含 `file:vendor/klinecharts-pro`、自托管字体包） | `__files_build_runtime.md` |
| `frontend/package-lock.json` | 冻结的依赖解析结果（lockfileVersion 3，含 vendor 的 `link: true` 与第二套工具链） | `__files_build_runtime.md` |
| `frontend/vite.config.ts` | 双身份：dev server + `/api`·`/ws` 反代；vitest 收集/环境/覆盖率棘轮；`@klinecharts/pro` → vendor dist 的 alias | `__files_build_runtime.md` |
| `frontend/tsconfig.json` | 类型检查作用域与编译语义（`include: [src, vite.config.ts]`、strict、noEmit、paths 别名） | `__files_static_gates.md` |
| `frontend/biome.json` | lint + 格式化规则与实际扫描范围（`files.includes` 否定式排除，`useIgnoreFile: false`） | `__files_static_gates.md` |
| `frontend/components.json` | shadcn/ui 代码生成器的别名与 token 契约（生成物必须落在 tsconfig 能解析的位置） | `__files_static_gates.md` |
| `frontend/tailwind.config.js` | **Tailwind v3 时代遗留物**：v4（`@tailwindcss/vite` + `@import "tailwindcss"`）不加载它 → 事实上死配置，样式真源在 `src/index.css` | `__files_static_gates.md` |
| `frontend/index.html` | 唯一 HTML 壳：`#root` 挂载点 + `lang="zh"` + `<title>Trade Terminal</title>` 品牌口径 | `__files_shell_e2e.md` |
| `frontend/playwright.config.ts` | L3 运行基建：双 webServer 拉起 vite + 后端、端口 env 可覆盖、单 worker、超时/重试/证据粒度 | `__files_shell_e2e.md` |
| `frontend/.gitignore` | 目录级卫生边界：只忽略本地 `/dist/`，**故意放行** `vendor/klinecharts-pro/dist`；`.env`/日志/测试产物不入库 | `__files_shell_e2e.md` |

### 知识库文档

- `.codemaker/codeindex/frontend/__files/_overview.md`（本文件）
- `.codemaker/codeindex/frontend/__files/__files_build_runtime.md`
- `.codemaker/codeindex/frontend/__files/__files_static_gates.md`
- `.codemaker/codeindex/frontend/__files/__files_shell_e2e.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。
- 本组文件中只有 `vite.config.ts` 与 `playwright.config.ts` 含可索引符号（两个 `export default defineConfig({...})` 与 `playwright.config.ts:BACKEND_PORT/FRONTEND_PORT/PYTHON` 等常量），其余为 JSON / HTML / 注释性 JS 配置，**无业务符号**。本模块因此只描述它们的**外部契约与一致性义务**，不重复 Codemap 已给的清单。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `__files_build_runtime.md` | 命令面/依赖面/联调通路/测试运行器：`npm run dev·build·test·test:coverage·lint·typecheck·test:e2e`、`/api` rewrite、`/ws` 代理、vitest 环境与 e2e 排除、覆盖率棘轮、vendor 三条解析路径 | `@klinecharts/pro`(file:vendor/klinecharts-pro)、`E2E_FRONTEND_PORT`(5173)、`E2E_BACKEND_PORT`(8000)、`thresholds.lines`(55)、`fileParallelism`(false) |
| `__files_static_gates.md` | 谁被类型检查、谁被 lint、shadcn 生成契约、Tailwind 双主题 token 的真源归属：`include` 作用域缺口、Biome 排除清单与 `useIgnoreFile:false`、`components.json` 别名必须被 tsconfig `paths` 覆盖、`tailwind.config.js` 死配置判定 | `strict`(true)、`noEmit`(true)、`@/*` → `./*`、`lineWidth`(100)、`quoteStyle`(double)、`style`(new-york)、`cssVariables`(true) |
| `__files_shell_e2e.md` | HTML 挂载壳与品牌口径、Playwright L3 运行基建（workers/retries/timeout/trace/video/双服务复用）、前端目录级 gitignore 与 vendor dist 例外 | `#root`、`lang`(zh)、`workers`(1)、`retries`(1)、`timeout`(60_000)、`expect.timeout`(15_000)、`.venv/Scripts/python.exe`、`/dist/` |

## 模块概述

**业务定位**：本模块解决的是**「一份前端改动能不能被可信地交付」**这个工程问题，而不是任何行情/交易业务问题。它用十份声明把四件事钉住：① **可复现**——`package.json` 声明依赖区间、`package-lock.json` 冻结解析结果，CI 用 `npm ci` 而不是 `npm install`，因此任何人在任何机器装出的图表引擎、字体文件、React 版本完全相同；② **可裁决**——`tsconfig.json` 划定「哪些代码受类型契约保护」、`biome.json` 划定「哪些代码受风格与危险模式门禁保护」，并明确排除 vendored 与生成目录，避免门禁把别人的预构建产物改成一团无法复审的 diff；③ **可联调**——`vite.config.ts` 的 dev 代理是前后端唯一的同源通路（`/api` 前缀 rewrite 后转给后端 `:8000`，`/ws` 带 `ws:true` 升级），这条契约让 `frontend/src` 里所有 `BASE = "/api"` 的请求不必知道后端端口；④ **可证明**——`playwright.config.ts` 让「用户真的在浏览器里看到一根真 K 线」这件事可以被一条命令复现（自动拉起前端 + 真实后端进程）。因为这一层是声明而不是实现，**改动它的后果不是"某个功能变了"，而是"所有人的构建、所有 CI 检查、所有 e2e 运行一起变"。**

**上游触发**：本模块没有运行时调用者，其变更由四类工程动作驱动——① 开发者新增依赖/脚本（同步义务立刻落在 `package.json` + `package-lock.json`）；② GitHub Actions 的 frontend job 按**脚本名字符串**逐步调用（`npm ci` → `npm run lint` → `npm run format:check` → `npm run typecheck` → `npm run test` → `npm run test:coverage`），任何脚本改名等于把 CI 的一行命令改成红色；③ `AGENTS.md` 把「L3 浏览器旅程 = `cd frontend && npm run test:e2e`」写成团队约定，Playwright 的 `webServer[0].command` 又回身调用 `npm run dev`——即本模块内部存在一条**自指链**；④ `openspec/` 规格（`frontend-scaffold`、`ci-quality-gates`、`e2e-test-infra`、`repo-hygiene`、`design-system`、`webfont-self-hosting`）在需求归档时把「必须能通过 typecheck 与生产构建」「必须提供 lint/format/format:check 三个脚本」「阈值不得高于实测基线」「构建产物不入库」等写成硬条款。（来源: openspec/specs/frontend-scaffold/spec.md、openspec/specs/ci-quality-gates/spec.md）

**下游影响**：改动沿五条链外溢——① **安装链**：改 `package.json` 区间却不重新生成 `package-lock.json`，CI 的 `npm ci` 会因锁与清单不一致直接拒绝安装；由于依赖里含 `file:vendor/klinecharts-pro`，锁文件中同时钉住了 vendor 自带的第二套工具链（vite4 / vue 时代残留的 TS / vitest 1.x），动 vendor 的 package.json 也必须重锁。② **构建与视觉链**：Tailwind v4 下 `tailwind.config.js` 不再被加载，往它里面加主题**静默无效**（颜色/字号/圆角的真源是 `src/index.css` 的 `@theme` + `:root --tv-*`），这是本模块最反直觉的一处；`vite.config.ts` 的 alias 一旦与 `package.json` 的 `file:` 依赖或 `tsconfig.json` 的 `paths` 三者不同步，会出现「类型检查通过但打包时报解析失败」或反之。③ **门禁链**：`tsconfig.json` 的 `include` 只有 `src` 与 `vite.config.ts`，`tests/e2e/**`、`scripts/*.mjs` 从不被 `tsc --noEmit` 看管——在这里"改坏了没有报错"不代表没问题；覆盖率阈值只要高于实测基线（棘轮基线 55.69%，阈值 55）CI 立刻变红，而 `coverage.include: ["src/**"]` 意味着**新增任何 src 源文件都会拉低分母**，必须连带补测试。④ **联调与 L3 链**：dev 代理与 Playwright 都读同一组 `E2E_*` 环境变量，两处端口口径必须同源，否则 e2e 会把断言打在一个连不到后端或连着陈旧后端的服务上（`reuseExistingServer: true` 会静默复用已在跑的服务）。⑤ **仓库卫生链**：`/dist/` 被忽略而 `vendor/**/dist` 被故意放行——这个"相反策略"若被误当疏漏统一掉，CI 在全新 clone 上就会失去预构建图表引擎。（来源: openspec/specs/ci-quality-gates/spec.md、openspec/specs/repo-hygiene/spec.md）

## 架构简析

本模块是**并联的声明文件集合**，没有内部调用；存在的是一组**单向一致性义务**（谁必须与谁同值）。

分层结构（单行）：命令与依赖面 `package.json` → 冻结解析 `package-lock.json` → 运行/构建器 `vite.config.ts`（dev 代理 + vitest + alias） → 静态门禁 `tsconfig.json` / `biome.json`（作用域与规则） → 代码生成契约 `components.json` / 遗留样式配置 `tailwind.config.js`（后者已不被加载） → 外壳 `index.html` → 回归基建 `playwright.config.ts` → 入库边界 `.gitignore`

- **核心文件**：`vite.config.ts` 是本组"最像代码"的文件（同一份配置同时是 dev server、代理、alias、vitest 运行器与覆盖率门禁的定义，任一段被删都会打到不同消费者）；`package.json` 是脚本名的**对外契约面**（CI 与 AGENTS.md 用它说话）；`playwright.config.ts` 把「本地必须同时起两个服务」这件事固化成一条命令；`biome.json` + `tsconfig.json` 决定门禁覆盖范围，两者共同决定"哪些文件永远不会为你报错"。
- **关键数据流（配置解析链，不是运行时数据）**：`index.html`（`<script src="/src/main.tsx">`）→ vite 用 `resolve.alias` 把 `@klinecharts/pro` 解析到 `vendor/klinecharts-pro/dist/klinecharts-pro.js` → `tsc` 用 `paths` 把它解析到 `vendor/klinecharts-pro/types.d.ts` → `npm` 用 `file:` 依赖把它 link 进 `node_modules` → **同包三条路径，必须同时成立**。另一条链：`E2E_BACKEND_PORT` 同时被 `vite.config.ts`（proxy target）与 `playwright.config.ts`（后端命令 + `/health` 探测 URL）读取。
- **无代码验证路径**：本组文件没有单测；它们的"测试"是四条命令——`npm run typecheck`（tsconfig 生效）、`npm run lint && npm run format:check`（biome 生效且排除仍成立）、`npm run build`（vite + tsc 联合生效）、`npm run test:coverage`（vitest 收集范围 + 阈值生效）。任何一条红即本模块被改坏。
- **扩展点**：新增可配置面只有两条正路——改 `vite.config.ts` 的对应段，或加 npm script；**不存在** `.env` 通道（`.gitignore` 屏蔽 `.env*`）也不存在 `tailwind.config.js` 通道（未被 v4 加载）。

## 上下游关系

> `extracted` = 有配置引用或脚本名字符串证据；`inferred` = Agent 推断，需人工复核。

| 方向 | 模块/对象 | 关系 | confidence | 证据 |
|------|-----------|------|------------|------|
| 上游 | `.github/workflows/ci.yml` | frontend job 以 `working-directory: frontend` 执行 `npm ci`、`npm run lint/format:check/typecheck/test/test:coverage`，并 `cache-dependency-path: frontend/package-lock.json` | extracted | ci.yml L73–104 |
| 上游 | `.`（仓库根 `AGENTS.md`） | 把 `cd frontend && npm run test:e2e`、`npm run test`、`npm run typecheck` 写成回归口径与三层测试定义 | extracted | AGENTS.md L1–14 |
| 上游 | `frontend/tests` | `playwright.config.ts` 的 `webServer[0]` 调用 `npm run dev`（本模块自指）；`testDir: ./tests/e2e` 指向 `frontend/tests` 模块 | extracted | playwright.config.ts |
| 上游 | `openspec/`（规格层） | `frontend-scaffold`（必须过 typecheck 与 `vite build`）、`ci-quality-gates`（Biome 脚本三件套、vendored 目录排除、覆盖率不高于基线）、`repo-hygiene`（产物不入库）、`design-system`（Tailwind 扫描覆盖 tsx、不得依赖 Vue SFC）、`webfont-self-hosting`（字体经 npm 自托管并随产物输出） | extracted | 见各子文档「附：OpenSpec 摘要」 |
| 下游 | `frontend/src` | 被 `tsconfig.include` 与 `vitest coverage.include` 覆盖的对象；其样式 token 真源在 `src/index.css`（而非 `tailwind.config.js`）；其组件测试依赖 `@vitest-environment jsdom` 注解生效 | extracted | vite.config.ts、tsconfig.json |
| 下游 | `frontend/vendor` | `package.json` 的 `file:` 依赖、`vite.config.ts` 的 alias、`tsconfig.json` 的 paths 三处共同指向 `vendor/klinecharts-pro`；`.gitignore` 的 `/dist/` 只忽略前端自身产物 | extracted | 上述四处原文 |
| 下游 | `frontend/tests` | L3 的并行度、超时、重试、证据（trace/screenshot/video）、端口与后端可执行文件路径全部由 `playwright.config.ts` 决定；`vitest` 的 `exclude: ["tests/e2e/**"]` 决定 Playwright spec 不会被单元测试跑走 | extracted | vite.config.ts、playwright.config.ts |
| 下游 | `frontend/scripts` | `diagnose:kline` 脚本入口、`e2e-results/` 证据目录的入库状态由 package.json script + `.gitignore` 决定 | extracted | package.json scripts、.gitignore L8 |
| 下游 | `backend/src` | dev proxy 与 Playwright 以后端 `/health` 判就绪（端口 8000），后端换端口/换启动命令会立刻打断 L3；本模块另固定 `python -m market_data.cli serve` 这一入口 | extracted | playwright.config.ts webServer[1] |
| 下游 | `README.md` / 根 `.gitignore`（`__root/__files`） | 与仓库根 `.gitignore` 分层叠加；README 的环境/命令表必须与本组 npm script 名一致 | inferred | 根 .gitignore L23 注释显式提及前端 vitest 产物 |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/frontend-scaffold/spec.md`、`ci-quality-gates/spec.md`、`repo-hygiene/spec.md`、`design-system/spec.md`、`webfont-self-hosting/spec.md`、`e2e-test-infra/spec.md`、`e2e-browser-journeys/spec.md`、`klinecharts-pro-integration/spec.md`（仅提炼与本工程契约相关的条款，非完整规范）

- 系统 SHALL 提供 Vite + React + TypeScript 前端工程，dev 代理到本地 API，并 SHALL 可通过 `tsc --noEmit` 类型检查与 `vite build` 生产构建（两项均为验收 Scenario，不是建议）。（来源: openspec/specs/frontend-scaffold/spec.md）
- 前端 job SHALL 使用 README 声明的 Node 版本（≥20，取 LTS；CI 实际固定 `node-version: "20"`），并 SHALL 配置 Biome 作为 lint + format 门禁，覆盖 `frontend/src`、`frontend/tests`，**SHALL 排除** `frontend/vendor/**`、`dist/**`、`node_modules/**`；`package.json` SHALL 提供 `lint`、`format`、`format:check` 三个脚本。（来源: openspec/specs/ci-quality-gates/spec.md）
- 前端 SHALL 生成覆盖率报告（`@vitest/coverage-v8`）并配置初始阈值；初始阈值 **MUST NOT** 高于变更实施时实测的基线，且 SHALL 记录"只升不降"的棘轮策略。（来源: openspec/specs/ci-quality-gates/spec.md）
- 提交前门禁（根 `.pre-commit-config.yaml`）使用的 Biome 工具与版本 SHALL 与 CI 一致——因此 Biome 的版本口径由 `frontend/package.json` 的 `@biomejs/biome` 与 lockfile 共同钉住。（来源: openspec/specs/ci-quality-gates/spec.md）
- 仓库 MUST NOT 跟踪生成型产物（含覆盖率、报告类目录），`.gitignore` SHALL 覆盖本地与 CI 产生的目录/文件。（来源: openspec/specs/repo-hygiene/spec.md）
- Tailwind 的扫描配置 SHALL 覆盖 `./src/**/*.{ts,tsx}`，MUST NOT 依赖 `.vue` 文件；`frontend/src` 中 MUST NOT 存在 `.vue` 单文件组件，构建配置 MUST NOT 依赖 Vue SFC 扫描。（本项目为 React + Vite + Tailwind **v4**，实际由 `@tailwindcss/vite` 自动探测源文件完成该约束 → 见 `__files_static_gates.md` 对 `tailwind.config.js` 的死配置判定。）（来源: openspec/specs/design-system/spec.md）
- shadcn/ui 组件 SHALL 以 CSS 变量继承 `--tv-*` 色表，并在 `components.json` 中声明 token 映射（primary=--tv-accent、up/down=涨跌色、panel/background=面板/背景），新增组件 MUST NOT 硬编码颜色值。（来源: openspec/specs/design-system/spec.md）
- 全部正文 Web 字体 SHALL 经 npm 依赖自托管、随构建产物输出、版本由 lockfile 锁定，MUST NOT 在运行时请求任何第三方字体 CDN。（来源: openspec/specs/webfont-self-hosting/spec.md）
- 前端 SHALL 提供基于 `@playwright/test` 的浏览器套件（`frontend/tests/e2e/`），通过 `playwright.config.ts` 的 webServer 自动拉起 vite dev 与后端，`npm run test:e2e` 一键运行并产出 trace/截图报告。（来源: openspec/specs/e2e-browser-journeys/spec.md）
- `@klinecharts/pro` 以 **clone 至项目 vendor 本地**的形态引入（非 npm 私服版本），因此其被依赖的方式必须是本地文件依赖 + 已提交的预构建产物。（来源: openspec/specs/klinecharts-pro-integration/spec.md）
