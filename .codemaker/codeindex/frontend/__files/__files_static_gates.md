---
type: "Fragment"
id: frontend/__files/static_gates
title: "类型与风格门禁作用域"
description: "哪些文件永远不会为你报类型错误？Biome 到底扫哪些文件？样式 token 该写在哪份配置里才真的生效？shadcn 生成组件时别名会不会解析失败？"
parent: /frontend/__files/_overview.md
fragment: static_gates
architectural_role: "静态门禁与样式/代码生成契约（决定「哪些错会被拦住」）"
entity_names:
  constants:
    - name: "tsc 检查作用域"
      value: 'include: ["src", "vite.config.ts"]（tests/e2e、scripts/*.mjs 不在内）'
      source: frontend/tsconfig.json
    - name: "编译目标与模块"
      value: "target ES2022 / module ESNext / moduleResolution bundler / jsx react-jsx / noEmit true / strict true"
      source: frontend/tsconfig.json
    - name: "宽松项（刻意关闭）"
      value: "noUnusedLocals false、noUnusedParameters false、allowJs true、skipLibCheck true、isolatedModules true"
      source: frontend/tsconfig.json
    - name: "注入的全局类型"
      value: 'types: ["vite/client", "vitest/globals", "@testing-library/jest-dom"]'
      source: frontend/tsconfig.json
    - name: "路径别名"
      value: '"@/*" → "./*"（前端根，非 src）；"@klinecharts/pro" → "./vendor/klinecharts-pro/types.d.ts"'
      source: frontend/tsconfig.json
    - name: "Biome 扫描清单"
      value: 'includes: ["**", "!vendor", "!dist", "!coverage", "!playwright-report", "!test-results", "!package-lock.json"]'
      source: frontend/biome.json
    - name: "Biome 与 .gitignore 的关系"
      value: 'vcs.useIgnoreFile: false（两套排除清单互不继承）'
      source: frontend/biome.json
    - name: "格式化基线"
      value: "indentWidth 2 / lineWidth 100 / lineEnding lf / quoteStyle double / jsxQuoteStyle double / semicolons always / trailingCommas all / arrowParentheses always"
      source: frontend/biome.json
    - name: "Tailwind 指令解析开关"
      value: "css.parser.tailwindDirectives: true"
      source: frontend/biome.json
    - name: "a11y 既有例外"
      value: "useButtonType off、noAutofocus off；noStaticElementInteractions / noSvgWithoutTitle / useKeyWithClickEvents / useSemanticElements / noLabelWithoutControl 降为 warn"
      source: frontend/biome.json
    - name: "correctness / suspicious / style 降级项"
      value: "useExhaustiveDependencies warn、useHookAtTopLevel warn、noArrayIndexKey warn、noNonNullAssertion warn"
      source: frontend/biome.json
    - name: "assist"
      value: "enabled: false（不启用自动导入/排序类辅助）"
      source: frontend/biome.json
    - name: "shadcn 契约"
      value: 'style new-york / rsc false / tsx true / cssVariables true / tailwind.config "" / iconLibrary lucide；aliases: components "@/components"、ui "@/components/ui"、utils "@/lib/utils"、lib "@/lib"、hooks "@/hooks"'
      source: frontend/components.json
    - name: "tailwind.config.js 现状"
      value: 'Tailwind v4 未加载（无 @config 指令）；其引用的 --tv-panel2/--tv-hover/--tv-active/--tv-borderSoft/--tv-shadow 在 src 全部 CSS 中均无定义，对应工具类使用数为 0'
      source: frontend/tailwind.config.js（对照 frontend/src/index.css）
retrieval_hints:
  - "为什么 `tests/e2e` 里的类型错误不会被 `npm run typecheck` 拦住？"
  - "主题颜色 / 字号 / 圆角要新增一个，应该改哪个文件？"
  - "为什么在 tailwind.config.js 里加了颜色，界面上没有反应？"
  - "用 shadcn 生成一个新组件时，代码注释里为什么不给自动格式化和顺序调整？"
  - "单引号 / 分号 / 尾逗号的风格为什么不一致也能过 lint？"
  - "⚠️ 你要找的是**后端**静态门禁（ruff 规则集、fail_under、`# noqa` 例外、pytest marker），不在这里 → 在 `backend/__files`；本文件只管 TS/Biome。"
  - "⚠️ 你要找的是 `frontend/src` 里某个组件的实际样式实现（`--tv-*` 消费、`cn()` 用法），不在这里 → 在 `frontend/src` 的 `frontend_src_app_shell.md`；本文件只规定「改样式的正确归属文件」。"
  - "⚠️ 你要找的是 vendored 图表引擎里的 TS 源码与类型，不在这里 → 在 `frontend/vendor`；Biome 与 tsc 都刻意不检查 vendor（`!vendor` 排除 + `include` 不含 vendor）。"
  - "⚠️ 你要找的是仓库根那份只有 root/`$schema` 的 `biome.json`，不在这里 → 在 `__root/__files`（那份只声明配置解析边界，不含规则）。"
  - "本组也叫「lint 规则 / 格式化 / tsconfig / 路径别名 / 样式配置」，对应需求中的「代码风格不统一」「保存自动改格式」「改了颜色没生效」「找不到 @/lib/utils」。"
  - "架构归属句：新增**主题 token**（颜色/字号/圆角/间距）必须写在 `frontend/src/index.css`（`@theme` 或 `:root`/`[data-theme]` 的 `--tv-*` 层），**不得**写入 `tailwind.config.js`；新增**被生成器产出**的代码必须落在 tsconfig 能解析的位置且 import 用相对路径（与既有 `src/components/ui/*.tsx` 保持一致）。"
---

## 业务意图

这四份文件决定**"什么错会被拦住、什么改动会被自动改写、样式该写在哪里"**——它们不产生界面，但决定了界面代码能否被安全地维护。

1. **类型门禁的边界（`tsconfig.json`）**：`strict: true` + `noFallthroughCasesInSwitch: true` 让 `frontend/src` 的代码受真实契约保护（这层保护是 `frontend/src` 敢在运行时对后端帧做"缺字段就丢帧"容错的前提）；但 `include` 只有 `src` 与 `vite.config.ts`，意味着 **`tests/e2e/**`（4 个 Playwright spec）与 `scripts/*.mjs` 永远不参与类型检查**——在这里写错的选择器、字段名、导入，本地 `npm run typecheck` 不会红，只有真跑 e2e 时才暴露。这是本文件组最需要被记住的一条边界。
2. **风格与危险模式门禁（`biome.json`）**：同时是 lint 与格式化器（`biome check .` / `biome format`），覆盖范围用**否定式前缀排除** vendor/dist/coverage/报告目录/锁文件，保证「别人的预构建产物与我生成的报告」不会变成待修 diff。它对 React/Test 领域启用 `recommended` 规则集，同时把 a11y 与 hooks 依赖类规则**降级为 warn 而非 error**——这是既有代码的现实妥协（一次性清理不现实），也意味着**新增代码不应把 warn 当许可**。
3. **代码生成契约（`components.json`）**：声明 shadcn/ui 的 token 映射与别名，是「UI 基元统一走同一套 `--tv-*` 变量」这一设计系统约束的落地点（规格明确要求在此声明 primary/up/down/panel 映射）。**它的别名必须与 `tsconfig.json` 的 `paths` 同源**，否则生成出来的组件 import 解析不了。
4. **样式真源的反面教材（`tailwind.config.js`）**：本项目是 Tailwind **v4**（`@tailwindcss/vite` + `src/index.css` 里 `@import "tailwindcss"`），v4 只在文件里出现显式 `@config` 指令时才加载 JS 配置；本仓库没有该指令，配置里引用的 `--tv-panel2`/`--tv-hover`/`--tv-active`/`--tv-borderSoft`/`--tv-shadow` 五个变量在 `src` 全部 CSS 中**都没有定义**，对应工具类（`bg-panel2`/`rounded-btn`/`text-11`/`shadow-float`/`ease-smooth`）在源码中**使用次数为 0**——即它是一份**已失效的 v3 遗留配置**。样式真源在 `src/index.css`（`@theme { --font-sans: ... }` 与 `:root`/`[data-theme="light"]` 的 `--tv-*` 色表）。

## 对外接口

| 接口（配置键） | 方向 | 关键取值 | 业务说明 | 权威消费方 |
|------|------|---------|---------|---------|
| `tsc --noEmit`（`npm run typecheck` / `build` 前置） | 门禁 → src | `include: [src, vite.config.ts]` | 类型契约的**实际覆盖面**；越界目录零保护 | CI、`frontend-scaffold` 规格 |
| `paths["@/*"]` | tsc → 文件解析 | `./*`（前端根） | 与 `components.json` 的 `@/…` 别名**不同源**（详见变更风险 §3） | `components.json` 生成物 |
| `paths["@klinecharts/pro"]` | tsc → 类型 | `./vendor/klinecharts-pro/types.d.ts` | 类型侧解析路径之一（另两条在 `__files_build_runtime.md`） | `frontend/src`、`frontend/vendor` |
| `biome check .`（`npm run lint`） | 门禁 → frontend/ | `files.includes` 否定式排除 | 实际扫描面 = 全部前端文件 − vendor/dist/coverage/报告/锁 | CI、根 pre-commit |
| `biome format`（`format` / `format:check`） | 门禁 → 同上 | `lineWidth 100` / 双引号 / 分号 always / 尾逗号 all | 规格要求三个脚本存在；CI 用 `format:check` 只校验不改写 | CI、`ci-quality-gates` 规格 |
| `css.parser.tailwindDirectives` | Biome → `src/index.css` | `true` | **必需**：否则 Biome 无法解析 `@import "tailwindcss"` / `@theme`，lint 直接失败 | `frontend/src` |
| `components.json aliases` | 生成器 → 文件落点 | `utils: "@/lib/utils"` 等 | 生成物的 import 前缀；必须被 `tsconfig.paths` 覆盖才能编译 | `npx shadcn add`、`frontend/src/components/ui` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键载体 | confidence |
|---------|---------|---------|------------|
| `frontend/src` | `include`/`coverage.include` 的对象；`src/index.css` 是样式 token 真源；`src/test-setup.ts` 与 `@testing-library/jest-dom` 类型由 `types[]` 注入 | `tsconfig.json` types、`biome.json` tailwindDirectives | extracted |
| `frontend/vendor` | `biome` 必须排除 vendor（规格硬要求）；tsc 通过 `paths` 引用其手写 `types.d.ts`；vendor 自带 tsconfig 与本文件无关 | `biome.json` includes、`tsconfig.json` paths | extracted |
| `frontend/tests` | Biome 扫到 `tests/e2e/**`（lint 覆盖），但 tsc **不检查**（typecheck 覆盖）——两层覆盖范围不一致 | `biome.json` includes vs `tsconfig.json` include | extracted |
| `__root/__files`（根 `biome.json`） | 根文件 `root: true` 是本文件 `root: false` 的解析终点；根文件刻意不含规则 | 两份 biome.json | extracted |
| `.github/workflows` | `npm run lint` / `format:check` / `typecheck` 三个 step 的成败直接由本文件组决定 | `ci.yml` L91–98 | extracted |
| `openspec/specs/design-system` | 规定双主题 token 必须走 CSS 变量、组件不得硬编码颜色、Tailwind 扫描必须覆盖 tsx 且不得依赖 Vue SFC | `frontend/src/index.css`、本文件组 | extracted |

| 调用方 | 使用场景 | 关键载体 |
|-----------|---------|---------|
| CI 与 pre-commit | 提交前/PR 时按同一套规则拦截 | `biome.json`（工具与版本来自 `frontend/package.json`） |
| 所有 `frontend/src` 改动 | 类型契约与风格基线 | `tsconfig.json`、`biome.json` |
| shadcn/ui 组件生成流程 | 生成物落点与 import 前缀 | `components.json` + `tsconfig.json paths`（**必须同源**） |
| 新增样式 token 的开发者 | 唯一正确落点 | `frontend/src/index.css`（`@theme` / `--tv-*`） |

## 典型调用链

### 类型门禁（含一个"检查不到"的分支）
```
CI: npm run typecheck → tsc --noEmit                              ← 本模块入口（package.json script）
  → tsconfig.include = ["src", "vite.config.ts"]                  ← 作用域在此决定
    → src/**  被检查 ✅
    → tests/e2e/*.spec.ts、scripts/*.mjs 不在 include → 永不检查 ❌   ← 跨模块：frontend/tests / frontend/scripts
  → paths["@klinecharts/pro"] → vendor/klinecharts-pro/types.d.ts  ← 跨模块：frontend/vendor
```

### 样式 token 的正确落点（对照失效路径）
```
新需求「加一个主题色 / 改字号」
  → 正解：frontend/src/index.css 的 :root / [data-theme="light"] 定义 --tv-xxx，@theme 定义 --font-* / token
    → 组件引用 var(--tv-xxx) → 双主题自动生效              ← 跨模块：frontend/src（frontend_src_app_shell.md）
  → 失效路径：写进 frontend/tailwind.config.js theme.extend
    → Tailwind v4 无 @config 指令 → 该文件不参与构建 → 静默无效，构建产物里不会出现对应工具类
```

### lint 与格式化
```
npm run lint → biome check .
  → files.includes 命中则检查；vendor/dist/coverage/playwright-report/test-results/package-lock.json 被排除
  → css 文件经 css.parser.tailwindDirectives=true 解析（src/index.css 否则报解析错）  ← 跨模块：frontend/src
npm run format:check → biome format .（只报告不改写；CI 用它，developer 用 format --write 修）
```

## 实现约束清单

> 动这四份文件前逐条核对。

### 必须保持的取值

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `include` | `["src", "vite.config.ts"]` | tsconfig.json | 决定类型门禁覆盖面；**扩大它会把 e2e/spec 的类型问题提前暴露（好事，但要连带修完）**，缩小它会失去 src 保护 | `frontend-scaffold` 规格（typecheck 必须过） |
| `strict` | `true` | tsconfig.json | 关闭即放弃对后端帧形状的静态约束 | 现状契约 |
| `noEmit` | `true` | tsconfig.json | 类型检查不产生产物；构建产物只由 vite 产出 | `build = tsc --noEmit && vite build` |
| `css.parser.tailwindDirectives` | `true` | biome.json | 缺它 → `src/index.css` 解析失败 → `npm run lint` 红 | 硬约束 |
| `files.includes` | 保留 `!vendor` `!dist` `!coverage` `!playwright-report` `!test-results` `!package-lock.json` | biome.json | 规格明确要求排除 vendored 与生成目录；用前缀匹配，**不是 glob**（`!vendor` 才有效，`!vendor/**` 无意义） | `openspec/specs/ci-quality-gates/spec.md` |
| `vcs.useIgnoreFile` | `false` | biome.json | 明确「Biome 忽略清单独立于 `.gitignore`」→ 新增生成目录必须两处都判断 | 现状设计决策 |
| `formatter.indentWidth` / `lineWidth` | `2` / `100` | biome.json | 与后端 ruff `line-length = 100` 对齐（双端同一行宽口径） | 现状设计决策（inferred：两侧同值） |
| `root` | `false` | biome.json | 配置解析链向上到根 `biome.json`（`root: true`）终止 | `__root/__files` |
| `aliases.utils` | `"@/lib/utils"` | components.json | **当前与 tsconfig `paths` 不同源**（见下） | 规格要求在此声明 token 映射 |
| `tailwind.css` / `cssVariables` | `src/index.css` / `true` | components.json | 指向样式真源；`cssVariables: true` 是双主题不硬编码色的机制前提 | `openspec/specs/design-system/spec.md` |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 样式 token 的归属文件 | `frontend/src/index.css`（v4 CSS-first：`@theme` + `:root`/`[data-theme]` 定义 `--tv-*`） | `tailwind.config.js` 的 `theme.extend` | v4 只用 `@config` 显式加载 JS 配置；把 token 放 CSS 变量层才能同时被 `var()`（图表主题、滚动条、Canvas）与工具类消费 |
| `tailwind.config.js` 的处置 | **保留但视为失效**（本次不删，仅在本知识库标注） | 立即删除 / 给它补 `@config` 让其复活 | 删除属独立治理动作（要同时确认无消费者）；补 `@config` 会让 v3 残留 token 与 CSS 真源形成双真相，更危险。**结论：不要往它里面加东西** |
| a11y 与 hooks 规则等级 | 关键项 `off`（useButtonType/noAutofocus）、其余 `warn` | 全部 error（一次性修完） | 存量密度高，error 会立刻卡住所有提交；规格允许"规则级例外 + 留说明"的处理方式 |
| 别名策略 | 既有组件 import 用**相对路径**（如 `src/components/ui/button.tsx` → `../../lib/utils`）；tsconfig `@/*` 保留指向前端根 | 把 `@/*` 改成 `./src/*` 并在 vite 加 `@` alias，让 shadcn CLI 生成物开箱可用 | 当前 `vite.config.ts` **没有** `@` alias（只有 `@klinecharts/pro`），改别名属跨文件组动作（tsconfig + vite + components.json 三处同步），未做即应避免依赖它 |
| 格式化与 lint 合体 | 用 Biome 一个工具承担两者（`biome check` 含格式化检查） | ESLint + Prettier 双工具 | 与后端 ruff（lint+format 一体）口径一致，且 pre-commit 钩子工具版本必须与 CI 一致，单一工具更易保持 |

## 变更风险（改它会破坏什么）

1. **[在 `biome.json` 的 `includes` 里删掉某个排除项]** 例如去掉 `!vendor`：`npm run lint` 会把 `vendor/klinecharts-pro/src`（85 个 ts/tsx）与 `vendor/tradingview-pro/src`（47 个 ts/tsx）纳入检查并产出成百上千条告警，CI 立即失败；若反过来为了绿而放宽规则，则同时削弱 `frontend/src` 的门禁。规格对此有明文：**SHALL NOT 扫描或报告 vendored 目录中的文件**。
2. **[改 `tsconfig.json` 的 `paths` 或删 `types[]` 某项]** ① 动 `@klinecharts/pro` 映射：类型侧与 vite alias/`file:` 依赖三路失同步，典型症状是"类型找不到但构建能过"（或反之）；② 删 `vitest/globals`：`vite.config.ts` 的 `test.globals: true` 下所有测试文件里的 `describe/it/expect` 会变成未定义类型，**全量测试文件报类型错**；③ 删 `@testing-library/jest-dom`：`toBeInTheDocument()` 等匹配器失去类型。
3. **[直接使用 shadcn CLI 生成组件而不处理 import 前缀]** `components.json` 声明 `utils: "@/lib/utils"`、`components: "@/components"`，而 `tsconfig.paths["@/*"] = "./*"` 指向前端根——`frontend/lib/utils` **不存在**（真实位置是 `src/lib/utils`），且 `vite.config.ts` 根本没有 `@` 别名。因此 CLI 生成的 `import { cn } from "@/lib/utils"` 会**同时**造成 `tsc` 报模块找不到与 vite 构建解析失败。既有 `src/components/ui/*.tsx` 全部用相对路径（`../../lib/utils`）不是风格偏好，而是当前别名体系的**唯一可行写法**。要么手改生成物为相对路径，要么在同一变更内完成 tsconfig + vite + components.json 三处同源改造。
4. **[往 `tailwind.config.js` 增改 token]** 静默无效（无 `@config`）：开发者会以为颜色已加，实际界面不变，然后被迫在组件里写硬编码色值——直接违反 design-system 规格「组件 MUST NOT 硬编码颜色」，并让双主题失同步（light 主题下出现读不清的文字/边框）。同理，**这套 token 一旦被某个更晚的提交"复活"（例如有人补了 `@config`）**，`theme.extend` 里 `colors.border: var(--tv-borderSoft)`（变量不存在）等条目会产出失效工具类，回退成"看着有类名、实际无样式"。
5. **[把 warn 降级项当许可]** `useExhaustiveDependencies`（hooks 依赖数组）、`useHookAtTopLevel` 降为 warn 是**存量妥协**：`useExhaustiveDependencies` 的告警正是 `frontend/src` 里"实时数据 effect 依赖漏项 → 图表订阅不刷新/重复订阅"这类 bug 的静态前哨。新代码在此类规则上告警应视为必须修复，而不是"CI 没红就行"。
6. **[删 `css.parser.tailwindDirectives`]** `src/index.css` 含 `@import "tailwindcss"` 与 `@theme`，Biome 默认 CSS 解析器不认这些 at-rule → `npm run lint` 直接失败（不是静默，但很容易被误判为"Biome 坏了"）。
7. **[改 `formatter` 参数而不全量重格式化]** `lineWidth`/`quoteStyle` 改动后，未被改写的文件与已改写的文件混在一份 PR 里，评审无法分辨"真实逻辑变更 vs 风格噪声"；`format:check` 在 CI 是硬门禁，因此这类变更必须**单独一个提交 + 全量 `npm run format`**。

## 边界约束（能做什么 / 禁止做什么）

- ✅ **可以**：给既有告警加规则级 `ignore` 或单点 `biome-ignore`（**必须附原因**，规格要求不得直接关闭整条规则而不留说明）；扩宽 `include`（前提是同一变更内修完 e2e/scripts 的类型问题）。
- ✅ **必须**：新增样式 token 写进 `frontend/src/index.css`；新增生成目录时**同时**判断 `.gitignore`（是否入库）与 `biome.json includes`（是否被扫描）两套清单。
- ✅ **必须**：改动 `components.json` 的 aliases 时，同变更内核对 `tsconfig.json` 的 `paths`（当前二者**不一致**，属已知待收敛项）。
- ❌ **禁止**：在 `tailwind.config.js` 里新增/修改颜色、字号、圆角、阴影、字体（v4 不加载；正确落点是 `src/index.css`）。
- ❌ **禁止**：对 `frontend/src` 的组件新增硬编码色值或 emoji/ASCII 字符作为功能图标（design-system 规格硬要求；图标统一 `lucide-react` 线性 SVG、取 token 着色）。
- ❌ **禁止**：把 `vendor/**`、`dist/**`、`coverage/`、`playwright-report/`、`test-results/` 从 Biome 排除清单移除；也禁止为了通过 lint 而修改 vendor 里的上游源码来迎合规则。
- ❌ **禁止**：依赖当前不存在的 `@/…` 别名写新代码（既有的 `@klinecharts/pro` 是唯一例外，且由 vite alias + tsconfig paths 双路支撑）。
- ❌ **禁止**：把 `tsconfig.json` 的 `include` 缩小到某个子目录来"让 typecheck 快一点"——`src` 全量纳入是类型契约覆盖面的下限。

## 现状注记（本次扫描观察到）

- `tsconfig.json` 与 `components.json` 的别名**不同源**：前者 `@/* → ./*`，后者 `@/lib/utils → 期望 src/lib/utils`；`frontend/src` 中 `from "@/…"` 的实际使用数为 **0**，既有 UI 基元一律相对路径。这是一处**待收敛的一致性缺口**（要么统一到 `src/`，要么在文档层面明确"生成后手工改 import"），不是当前可用的别名通道。
- `tailwind.config.js` 引用的 5 个 `--tv-*` 变量（`--tv-panel2`/`--tv-hover`/`--tv-active`/`--tv-borderSoft`/`--tv-shadow`）在 `frontend/src` 全部 CSS 中**无定义**，其专属工具类使用数为 **0**；`design-system` 规格提到的"Tailwind 扫描覆盖 `./src/**/*.{ts,tsx}`"在 v4 下由 `@tailwindcss/vite` 的自动源探测满足，与该 JS 配置无关。
- `tsconfig.json` 的 `experimentalDecorators: true` 与 `useDefineForClassFields: false` 组合是给 `klinecharts` 相关实现 / legacy 类字段语义留的兼容口，**不要当成可随手清理的冗余**——清理前先确认没有依赖装饰器或类字段 define 语义的代码。
- `noUnusedLocals` / `noUnusedParameters` 为 `false`：未使用变量不会被 tsc 拦下（Biome 侧重启用的后果不同）。若想收紧，属独立质量变更，需评估存量告警量。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/ci-quality-gates/spec.md`、`design-system/spec.md`、`frontend-scaffold/spec.md`（仅提炼静态门禁与样式契约）

- 前端 SHALL 配置 Biome 作为 lint + format 门禁，覆盖 `frontend/src`、`frontend/tests`，**SHALL 排除** `frontend/vendor/**`、`dist/**`、`node_modules/**`；`package.json` SHALL 提供 `lint`/`format`/`format:check`。（来源: ci-quality-gates）
- 无法一次性清理的既有告警 SHALL 通过规则级 `ignore` 或单点忽略（附原因）处理，SHALL NOT 直接关闭整个规则而不留说明；CI SHALL 以非零退出码阻断未修复错误。（来源: ci-quality-gates）
- 系统 SHALL 以 CSS 变量定义色表并支持 dark/light 双主题，**只换颜色不换布局尺寸**；组件中 MUST NOT 出现独立硬编码色值。（来源: design-system）
- 引入的 shadcn/ui（及 Radix 原语）组件 SHALL 以 CSS 变量继承现有 `--tv-*` 色表，并在 **`components.json` 中声明 token 映射**（primary=--tv-accent、up/down=涨跌色、panel/background=面板/背景）；图标 SHALL 为 lucide 线性 SVG。（来源: design-system）
- Tailwind 的 content 配置 SHALL 覆盖 `./src/**/*.{ts,tsx}`，MUST NOT 依赖 `.vue`；`frontend/src` 中 MUST NOT 存在 `.vue` 单文件组件，构建配置 MUST NOT 依赖 Vue SFC 扫描。（v4 下的等价实现 = 自动源探测 + 无 `@config`；因此 `tailwind.config.js` 不承担该约束。）（来源: design-system）
- 生产构建 MUST NOT 产生字体路径无法解析的警告；字体由每个 `@font-face` 的 `unicode-range` 逐字符分流，中西文字体栈的**单一真源是 CSS 变量**。（来源: webfont-self-hosting；对应 `src/index.css` 的 `@theme --font-sans`）
