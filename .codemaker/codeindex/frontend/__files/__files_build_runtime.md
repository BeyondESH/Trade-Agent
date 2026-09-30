---
type: "Fragment"
id: frontend/__files/build_runtime
title: "命令面·依赖面·联调通路"
description: "npm run test / test:coverage / dev 到底跑的是什么？前端靠哪条通路连后端？为什么改了 package.json 必须重新生成 package-lock.json？覆盖率阈值能不能调高？"
parent: /frontend/__files/_overview.md
fragment: build_runtime
architectural_role: "前端唯一的构建/运行/测试入口声明（脚本名即对外契约）"
entity_names:
  constants:
    - name: "@klinecharts/pro 依赖形态"
      value: "file:vendor/klinecharts-pro"
      source: frontend/package.json
    - name: "dev/build 端口默认值"
      value: "5173（可被 E2E_FRONTEND_PORT 覆盖）"
      source: frontend/vite.config.ts
    - name: "后端目标端口默认值"
      value: "8000（可被 E2E_BACKEND_PORT 覆盖）"
      source: frontend/vite.config.ts
    - name: "覆盖率棘轮阈值 lines / statements"
      value: "55 / 55（引入时实测基线 55.69%）"
      source: frontend/vite.config.ts
    - name: "覆盖率统计范围"
      value: 'include: ["src/**/*.{ts,tsx}"]；exclude: *.test.*, *.d.ts, src/test-setup.ts, src/vendor/**, src/main.tsx'
      source: frontend/vite.config.ts
    - name: "vitest 默认运行环境"
      value: '"node"（DOM 组件测试须逐文件加 // @vitest-environment jsdom）'
      source: frontend/vite.config.ts
    - name: "vitest 并行度"
      value: "fileParallelism: false（文件级串行）"
      source: frontend/vite.config.ts
    - name: "vitest 排除清单"
      value: '["tests/e2e/**", "**/node_modules/**", "**/dist/**", "**/cypress/**", "**/.{idea,git,cache,output,temp}/**"]'
      source: frontend/vite.config.ts
    - name: "setupFiles"
      value: "./src/test-setup.ts（仅注入 @testing-library/jest-dom 匹配器）"
      source: frontend/vite.config.ts
    - name: "coverage provider / reporter / 输出目录"
      value: "v8；text + html；./coverage"
      source: frontend/vite.config.ts
    - name: "lockfileVersion"
      value: "3（npm 7+ 格式，被 CI `npm ci` 与 npm 缓存 key 消费）"
      source: frontend/package-lock.json
    - name: "字体自托管依赖"
      value: "@fontsource-variable/google-sans-flex ^5.3.1 + @fontsource-variable/noto-sans-sc ^5.3.0（OFL-1.1，构建产物 dist/assets/*.woff2 即为证据）"
      source: frontend/package.json
    - name: "React / Vite / Vitest / Biome / TypeScript 主版本"
      value: "react 19 · vite 6 · vitest 3 · typescript 5.8 · @biomejs/biome 2.5.14 · tailwindcss 4.1 · playwright 1.62.1"
      source: frontend/package.json
retrieval_hints:
  - "前端怎么起本地服务？`/api` 前为什么不用写后端端口？"
  - "跑单元测试和跑覆盖率分别是哪条命令，它们差在哪？"
  - "为什么新写的组件测试要加一行 `// @vitest-environment jsdom`？"
  - "覆盖率不达标 / 覆盖率阈值可以随便调高吗？"
  - "⚠️ 你要找的是**后端**的依赖与门禁（pyproject.toml / uv.lock / fail_under=80 / ruff / pytest marker），不在这里 → 在 `backend/__files`；本文件只管 npm/vite/biome 这一侧。"
  - "⚠️ 你要找的是 L3 浏览器旅程的并行度、超时、端口与后端拉起方式，不在这里 → 在 `frontend/__files` 的 `__files_shell_e2e.md`（playwright.config.ts）；本文件只管 vitest（L 前端单元层）与 dev/构建。"
  - "⚠️ 你要找的是 frontend/src 里 BASE=/api 的请求实现与 WS 帧协议，不在这里 → 在 `frontend/src` 的 `frontend_src_data_access.md`；本文件只解释这条通路为什么成立（vite proxy 段）。"
  - "⚠️ 你要找的是 vendor 图表引擎的 API 与本地改造点，不在这里 → 在 `frontend/vendor`；本文件只覆盖它作为 `file:` 依赖被引入的三条解析路径。"
  - "本组也叫「npm scripts / 构建配置 / vite 配置 / 依赖锁定」，对应需求中的「跑不起来」「CI 红了」「装不出来同样的版本」「本地联调 404/跨域」。"
  - "架构归属句：新增任何面向用户/CI 的命令入口，**只能作为 `frontend/package.json` 的 scripts 条目存在**（脚本名一旦被 CI 或 AGENTS.md 引用即成契约，改名要先改消费方），不得要求同事直接敲 `npx vitest`/`npx vite` 之类的裸命令。"
---

## 业务意图

这三份文件回答同一个问题的三面：**这个前端以什么名字被调用、装出什么版本、通过哪条路连到后端。**

1. **命令的唯一命名权（`package.json`）**：11 个 script 是前端对外的**接口面**。CI 的 frontend job 逐条按名字调用（`lint` / `format:check` / `typecheck` / `test` / `test:coverage`），`AGENTS.md` 把 `npm run test` / `npm run typecheck` / `npm run test:e2e` 写成回归口径，`playwright.config.ts` 又用 `npm run dev` 去起被测服务，`diagnose:kline` 把离线排障脚本也收进同一命名空间。也就是说——**脚本名不是便捷别名，而是被三个消费方硬编码的字符串契约**。`build` 被写成 `tsc --noEmit && vite build`，把"类型必须过"塞进构建前置，正是 `frontend-scaffold` 规格里"类型检查通过 / 生产构建成功"两条 Scenario 的落地方式。
2. **可复现安装（`package-lock.json`）**：lockfileVersion 3 把 `^` 区间解析成确定版本 + `integrity`，CI 用 `npm ci`（只认锁、绝不解析）。因为它同时把 `link: vendor/klinecharts-pro` 和 vendor 自带的第二套工具链（其 node_modules 下的 vite/typescript/vitest 旧版本）钉住，所以**这份锁是"前端 + vendored 引擎"两者的共同真相**，不是 npm 自动生成的垃圾文件。
3. **同源联调与测试运行器（`vite.config.ts`）**：一个文件承担四份工作——① dev server 固定绑 `127.0.0.1`（不是 0.0.0.0，避免本机服务被局域网访问）；② `/api` → `http://127.0.0.1:8000` 并 rewrite 掉 `/api` 前缀、`/ws` → `ws://127.0.0.1:8000` 且 `ws: true`，让浏览器同源访问后端 REST 与 WebSocket（于是 `frontend/src` 里可以永远写 `BASE="/api"`，不出现端口与跨域）；③ vitest 的收集范围、运行环境、串行度与排除清单；④ v8 覆盖率统计范围与**棘轮阈值**。

## 对外接口

| 接口（脚本/配置键） | 方向 | 关键字段/取值 | 业务说明 | 权威消费方 |
|------|------|---------|---------|---------|
| `npm run dev` | 工程流程 → vite | `server.host: "127.0.0.1"`, `port`, `strictPort` 仅在 `E2E_FRONTEND_PORT` 存在时为真 | 起被测/开发前端；L3 用它作为 webServer 命令 | `playwright.config.ts`、开发者 |
| `npm run build` | 工程流程 → tsc + vite | `tsc --noEmit && vite build` | 类型检查是构建的**前置门禁**，不是可选步骤 | `frontend-scaffold` 规格 |
| `npm run typecheck` | 工程流程 → tsc | 同 `tsconfig.json` 作用域 | CI 单独一步，见 `__files_static_gates.md` | `.github/workflows/ci.yml` |
| `npm run test` | 工程流程 → vitest | `vitest run`（非 watch） | 前端单元层；默认串行、默认 node 环境 | CI、AGENTS.md |
| `npm run test:coverage` | 工程流程 → vitest | `--coverage` + `thresholds.lines/statements: 55` | 覆盖率门禁；低于阈值以非零码失败 | CI（独立 step） |
| `npm run lint` / `format` / `format:check` | 工程流程 → Biome | `biome check .` / `biome format --write .` / `biome format .` | 规格明确要求这三个名字存在 | CI、根 pre-commit |
| `npm run test:e2e` | 工程流程 → Playwright | 见 `__files_shell_e2e.md` | L3 一键入口 | AGENTS.md、`e2e-browser-journeys` 规格 |
| `server.proxy["/api"]` | 前端 → `backend/src` | `target: http://127.0.0.1:${E2E_BACKEND_PORT ?? 8000}`, `changeOrigin`, `rewrite: 去掉 ^/api` | 后端路由本身没有 `/api` 前缀 → **rewrite 是两侧的唯一粘合点**，删它即全量 404 | `frontend/src/api/client.ts` |
| `server.proxy["/ws"]` | 前端 → `backend/src` | `ws: true`（WebSocket 升级代理） | 图表实时通道与 ticker/books 频道经此到达 `/ws` | `frontend/src/api/bitgetWs.ts` |
| `resolve.alias["@klinecharts/pro"]` | 构建期 | → `./vendor/klinecharts-pro/dist/klinecharts-pro.js` | 绕开 Windows 上 `file:` 包解析不稳的问题（源码注释原文如此） | `frontend/vendor` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键载体 | confidence |
|---------|---------|---------|------------|
| `frontend/vendor` | `file:vendor/klinecharts-pro` + vite alias + tsconfig paths 三处解析同一本地包；锁文件里以 `link: true` 记录 | `package.json`、`vite.config.ts`、`package-lock.json` | extracted |
| `backend/src` | dev 代理的 target 端口与 `/health` 就绪探测口径；`/api` rewrite 必须与后端路由前缀（无前缀）匹配 | `vite.config.ts` server.proxy、`market_data.cli serve` | extracted |
| `frontend/tests` | vitest 与 Playwright 共享 `frontend/` 根目录下的 spec，靠 `test.exclude` 划界；`E2E_*` 两个 env 由两个配置文件共同读取 | `vite.config.ts` test.exclude、`playwright.config.ts` | extracted |
| `frontend/scripts` | `diagnose:kline` 脚本入口在本文件组定义；其 `--port 5173` 默认值必须与本文件组的 dev 端口一致 | `package.json` scripts | extracted |
| `frontend/src` | `src/test-setup.ts` 作为 `setupFiles` 被强制预载；`coverage.include: src/**` 把 src 全量纳入分母 | `vite.config.ts` test.* | extracted |
| `.github/workflows` | 消费脚本名与 `cache-dependency-path: frontend/package-lock.json`（锁文件一旦不提交，CI 的 npm 缓存也会失效） | `ci.yml` L82–104 | extracted |

| 调用方 | 使用场景 | 关键载体 |
|-----------|---------|---------|
| CI frontend job | 依次执行 lint / format:check / typecheck / test / test:coverage | `package.json` scripts |
| `playwright.config.ts` | webServer 以 `npm run dev` 起被测前端（同一文件组内自指） | `webServer[0].command` |
| `frontend/src` 全部测试 | 组件测试须依赖 jsdom 环境注解；纯逻辑测试依赖默认 node 环境 | `vite.config.ts` test.environment |
| 排障/诊断流程 | `npm run diagnose:kline` 需要 dev server 与后端在跑，端口口径来自本文件组 | `package.json` scripts + `frontend/scripts` 模块 |

## 典型调用链

### 覆盖率门禁（最容易被无意改坏的一条）
```
CI: npm run test:coverage
  → package.json scripts.test:coverage = "vitest run --coverage"   ← 本模块入口
    → vite.config.ts test.coverage.provider=v8 / include=src/**     ← 统计范围在此决定
      → 每个 src 源文件都进分母；*.test.*、src/main.tsx、src/test-setup.ts、src/vendor/** 被排除
    → vitest thresholds {lines:55, statements:55}                   ← 棘轮闸门在此断言
      → 低于阈值 → 非零退出 → frontend job 红                        ← 跨模块：.github/workflows
```

### 浏览器旅程的联调通路
```
npm run test:e2e
  → playwright.config.ts webServer[1] 起后端 :8000（/health 判就绪）   ← 跨模块：backend/src
  → playwright.config.ts webServer[0] = npm run dev → vite :5173       ← 本模块（package.json + vite.config.ts）
    → 页面请求 /api/candles/recent
      → vite proxy rewrite 剥掉 /api → http://127.0.0.1:8000/candles/recent   ← 本模块（server.proxy）
    → 页面 new WebSocket("/ws/candle")
      → vite proxy(ws:true) → ws://127.0.0.1:8000/ws                        ← 本模块 + 跨模块：frontend/src
```

### vendor 依赖的三条解析路径（必须同时成立）
```
npm ci → node_modules/@klinecharts/pro -> link: vendor/klinecharts-pro        ← package.json + package-lock.json
vite build → import "@klinecharts/pro" → ./vendor/klinecharts-pro/dist/*.js   ← vite.config.ts resolve.alias
tsc --noEmit → import "@klinecharts/pro" → ./vendor/klinecharts-pro/types.d.ts ← 跨模块：tsconfig.json paths
```

## 术语对照（需求语言 → 本文件组）

- 需求写「本地跑不起来 / 页面能开但数据全空」→ 先看 `vite.config.ts` 的 `server.proxy`（`/api` rewrite 是否还在、target 端口是否等于后端实际端口），再看 `E2E_BACKEND_PORT` 是不是只在一处设了。
- 需求写「CI 前端红了」→ 红色落在哪一步决定归属：lint/format:check → `biome.json` 与 `package.json` 脚本名；typecheck → `tsconfig.json` 作用域；test → vitest 收集与环境；test:coverage → 棘轮阈值。
- 需求写「升级依赖」→ 「`package.json` + `package-lock.json` 同一变更」是硬规则；涉及 vendored 图表引擎时，动的是 `file:` 那条依赖与 alias，而不是去 npm 装新版。
- 需求写「跑覆盖率/补测试」→ 分母由 `coverage.include` 决定，所以「补测试」在本层等于「让新文件不拉低阈值」；「阈值上调」必须是实测后的同变更动作。
- 民间叫法：「vite 配置」在本仓库同时是**测试运行器配置**（vitest 读同一文件），因此有人说「改 vitest 配置」时改的仍是 `vite.config.ts`，不存在独立的 `vitest.config.ts`。

## 实现约束清单

> 动这三份文件前逐条核对。

### 必须保持存在的脚本与键

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `dev` / `build` / `preview` | vite / `tsc --noEmit && vite build` / vite preview | package.json | build 必须串 tsc，否则类型回归可进产物 | `openspec/specs/frontend-scaffold/spec.md` 两条 Scenario |
| `lint` / `format` / `format:check` | `biome check .` / `biome format --write .` / `biome format .` | package.json | **三个名字规格点名要求存在**；CI 逐步调用 | `openspec/specs/ci-quality-gates/spec.md` |
| `typecheck` / `test` / `test:coverage` / `test:e2e` | tsc --noEmit / vitest run / +--coverage / playwright test | package.json | 与 AGENTS.md 三层金字塔口径一一对应 | AGENTS.md、ci-quality-gates |
| `diagnose:kline` | `node scripts/diagnose-kline-realtime.mjs` | package.json | 排障脚本入口，替代"裸诊断脚本"的临时方案 | `openspec/specs/e2e-playwright-diagnostics/spec.md`、`e2e-browser-journeys` 规格 |
| `server.host` | `"127.0.0.1"` | vite.config.ts | 只绑回环，不把本机 dev 服务暴露到局域网 | 现状约束（改动需先确认无外部访问需求） |
| `server.port` + `strictPort` | `E2E_FRONTEND_PORT ?? 5173`；strictPort 仅在该 env 存在时生效 | vite.config.ts | **一键两效**：跑 e2e 时端口被显式指定则不允许漂移；日常 dev 允许自动换端口 | 端口冲突可覆盖（与 playwright 同源） |
| `proxy["/api"].rewrite` | `p.replace(/^\/api/, "")` | vite.config.ts | 后端路由**不带** `/api` 前缀，此 rewrite 不可删 | `frontend/src/api/client.ts` 的 `BASE="/api"` |
| `proxy["/ws"].ws` | `true` | vite.config.ts | 缺它 WebSocket 不升级，实时链路静默不通（REST 却正常，最易误判为后端问题） | 同上 |
| `test.environment` | `"node"` | vite.config.ts | 全局默认；DOM 类测试逐文件 `// @vitest-environment jsdom`（当前 57 个测试文件中 41 个带注解，16 个 `src/api`/`src/lib`/`src/vendor` 纯逻辑测试故意不带） | 现状设计决策 |
| `test.globals` | `true` | vite.config.ts | 允许测试文件不 import `describe/it`；关掉会让既有测试大面积报错 | 现状契约 |
| `test.fileParallelism` | `false` | vite.config.ts | 文件级串行：定时器/共享 store/全局 `window` 状态并发互踩时的确定性代价 | 现状设计决策（`inferred`：无提交说明佐证） |
| `test.exclude` | 含 `"tests/e2e/**"` | vite.config.ts | vitest 默认 include 覆盖 `**/*.spec.{ts,tsx}` —— **不排它 Playwright 的 4 个 `.spec.ts` 会被 vitest 收走并全量失败** | 硬约束（下方变更风险 §1） |
| `test.setupFiles` | `./src/test-setup.ts` | vite.config.ts | jest-dom 匹配器注入点；删掉即所有 `toBeInTheDocument()` 类断言不可用 | 现状契约 |
| `coverage.thresholds` | `lines: 55` / `statements: 55` | vite.config.ts | 引入时实测 55.69% → **向下取整**；阈值得自实测，禁止猜测值 | `openspec/specs/ci-quality-gates/spec.md` |
| 锁文件 | 已提交且与 package.json 同步 | package-lock.json | CI 用 `npm ci` + npm 缓存 key 指向它 | ci-quality-gates（前端与后端 `uv.lock --frozen` 同构） |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 图表引擎引入方式 | 本地 `file:vendor/klinecharts-pro` + **显式 vite alias 直指 dist 产物** | 只用 `@klinecharts/pro` npm 版本 / 只依赖 `file:` 的包解析 | vendor 是可改 fork（改造面必须本地可审），而 `file:` 的包解析在 Windows 上不稳（配置注释原文），故运行时以 alias 兜住、类型侧再指 `types.d.ts` |
| 后端如何被前端访问 | dev proxy + `/api` 前缀 rewrite，前端代码内无端口/绝对 URL | 前端直接 `http://127.0.0.1:8000` + CORS | 保持同源，避免为本地开发开 CORS；也让 `frontend/src` 的 BASE 常量在任意部署形态下无需改代码 |
| 单元测试与浏览器测试同仓同目录树 | 共享 `frontend/`，靠 vitest `test.exclude` + Playwright `testDir` 双向划界 | 分置两个 workspace 目录树 | 复用同一份 install 与 dev server；代价是本文件组必须维持两条排除清单，漏一处就互相误跑 |
| 覆盖率阈值策略 | 实测基线向下取整（55）+ 注释记录基线与用例数，**只升不降** | 设一个"体面"的目标值（如 80） | 规格硬性要求阈值 MUST NOT 高于实测基线，否则门禁引入即红，团队只能靠关门禁绕过 |
| DOM 环境的启用粒度 | 全局 node + 逐文件 jsdom 注解 | 全局 jsdom | 纯逻辑测试占多数，jsdom 启动开销明显；代价是"新组件测试忘加注解"会以 `document is not defined` 的形式暴露（可判断，但属于本文件组的隐性税） |

## 变更风险（改它会破坏什么）

1. **[删/改 `test.exclude` 中的 `"tests/e2e/**"`]** vitest 默认 include 模式包含 `*.spec.ts`，`frontend/tests/e2e/` 下的 4 个 Playwright spec 会被 `npm run test` 收走 → 单测步骤因找不到 `@playwright/test` 的 browser fixture / 起不了 webServer 而整片红；由于 CI 就跑这一步，等于把整个前端 job 变成噪声源。**永远保留该排除项**（新增 `*.spec.*` 命名时同源处理）。
2. **[改 `package.json` 依赖区间而不重锁]** `npm ci` 的校验在锁与清单不一致时**拒绝安装**（不是回落解析），CI 第一步就失败；同时 npm 缓存 key 失效，每个 job 重装。改依赖必须 `npm install` 重生成锁并一并提交，包括动 `vendor/klinecharts-pro/package.json` 的情形（它经 `link:` 参与同一份锁）。
3. **[把覆盖率阈值往上调以"提质量"]** 阈值高于实测基线 → `npm run test:coverage` 立即非零退出，且规格要求"基于实测基线向下取整"，猜测值不合规。合规做法是先补测试实测新值，再**同一变更内**抬高阈值；反向（调低）违反棘轮。
4. **[新增 `src/**` 源文件而不补测试]** `coverage.include = src/**`，任何新文件都进分母 → 平均覆盖率被稀释，累积到阈值以下时门禁突然变红，且红的是"看起来无关的那次改动"。同理：把文件命名成非 `*.test.*`（例如 `.spec.ts`）落进 `src/`，既进分母又可能被 vitest 收走。
5. **[动 alias / `file:` 依赖 / tsconfig `paths` 中的任意一处]** 三条路径失去同源性 → 三类截然不同的症状：运行时 `Failed to resolve import "@klinecharts/pro"`、`tsc` 找不到类型声明但构建却成功、或**打包用了 npm registry 上的原版 `@klinecharts/pro`**（若某次 hoist 恰好把包补齐），于是 `frontend/vendor` 的本地改造（symbol/period 竞态修复、秒级时间跨度、周期栏 pin 机制）静默丢失——图表会退回"快速切换丢最后选择""秒级时间轴不显秒"的历史 bug。这类丢失不会报错，只表现为"偶尔显示旧数据"。
6. **[让字体走 CDN]** 为省事把 Google Fonts 链接写进 `index.html`（见 `__files_shell_e2e.md`）会同时违反 `webfont-self-hosting` 规格，并在内网/离线环境导致中文回落；自托管由 `@fontsource-variable/*` 两个 npm 依赖 + `src/index.css` 的两条 `@import` 保证，`dist/assets/*.woff2` 是可验证证据。
7. **[把端口 env 只改一处]** `vite.config.ts` 与 `playwright.config.ts` 各自读 `E2E_FRONTEND_PORT`/`E2E_BACKEND_PORT`；若只在 playwright 侧加了默认值（或只在 vite 侧），前端与代理 target 会分叉，症状是"页面能开但所有 /api 请求 502/超时"，而单看两边配置都像对的。

## 边界约束（能做什么 / 禁止做什么）

- ✅ **可以**：新增 npm script（面向 CI 或团队的入口）、在 `test.coverage.exclude` 中**放宽排除**以外的调整、追加 vitest 排除项（只允许更严格地隔离外部套件）。
- ✅ **必须**：任何依赖变动都在同一变更内提交更新后的 `package-lock.json`；任何 `Settings`-类的运行期参数不放这里（前端无 `.env` 通道，`.gitignore` 屏蔽 `.env*`）。
- ✅ **必须**：改动 dev 代理形状（前缀/rewrite/target 端口）时，同步核对 `frontend/src/api/client.ts` 的 `BASE`、`frontend/tests/e2e/*.spec.ts` 中写死的 URL、以及 `frontend/scripts/diagnose-kline-realtime.mjs` 的 `--port/--base` 默认值。
- ❌ **禁止**：把 `npm ci` 换成 `npm install`（CI 中），或删提交 lockfile —— 等于放弃可复现。
- ❌ **禁止**：在 `vite.config.ts` 里写绝对后端地址（绕过 env）、或给 `/api` 代理补上后端没有的前缀（正解永远是 rewrite 掉）。
- ❌ **禁止**：为了"让 vitest 快起来"打开 `fileParallelism: true`，或为了少写注解把 `test.environment` 全局改成 `jsdom` —— 前者会引入用例间状态互踩（表现为偶发失败，比慢更难查），后者会让 `src/api`/`src/lib` 那 16 个纯逻辑测试在真实 DOM/定时器语义下行为改变。若确要改，必须先跑通全量并记录理由。
- ❌ **禁止**：在 `package.json` 引入未自托管的运行时网络依赖（字体 CDN、远程图片、第三方 analytics）——违反离线可用与品牌/合规口径。

## 现状注记（本次扫描观察到）

- `package.json` **无 `engines` 字段**：CI 固定 Node 20（LTS），但本地没有任何机制阻止用不匹配的 Node 装出不同的锁解析或 vendor 工具链报错。规格只约束 CI（`ci-quality-gates`：前端 job 用 README 声明的 Node 版本），因此这是**可改进项而非违规项**；若要收敛，正确做法是加 `engines.node` 并同时更新 README 声明，保持与 CI 同源。
- `coverage.exclude` 中的 `src/vendor/**` 确实存在对应目录（`src/vendor/klinechartsProRace.test.ts`，对 vendored 产物文本做守卫断言），**不是死条目**，不要当冗余删掉。
- `vite.config.ts` 的覆盖率注释记录了引入时点（基线 55.69%、383 个用例）——该用例数是**历史锚点**，不代表当前规模（当前 `src` 下测试文件 57 个）；调整阈值时须以当次 `npm run test:coverage` 实测值为准，而不是拿注释里的旧数字推导。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/frontend-scaffold/spec.md`、`ci-quality-gates/spec.md`、`webfont-self-hosting/spec.md`、`e2e-playwright-diagnostics/spec.md`（仅提炼接口与约束）

- 前端工程 SHALL 为 Vite + React + TypeScript，dev 代理到本地 API，SHALL 通过 `tsc --noEmit` 且 `vite build` SHALL 产出无错误的静态构建产物。
- `package.json` SHALL 提供 `lint`、`format`、`format:check`；CI SHALL 以非零退出码阻断未修复的 lint 错误；Biome SHALL 排除 `frontend/vendor/**`、`dist/**`、`node_modules/**`。
- 前端 SHALL 用 `@vitest/coverage-v8` 生成覆盖率并配置初始阈值；初始阈值 MUST NOT 高于实施时实测基线，并 SHALL 记录"只升不降"的棘轮策略。
- 全部正文 Web 字体 SHALL 经 npm 依赖自托管、版本由 lockfile 锁定、MUST NOT 运行时请求第三方字体 CDN；断网环境下西文与中文均 SHALL 以自托管字体渲染。
- 实时 K 线诊断 SHALL 以 Playwright headless Chromium 在真实浏览器 + 真实后端 `/ws` 上运行，本地按需执行，**不作为常驻 CI 门禁**（这也是前端 job 不含 e2e 步骤的规格依据）。
