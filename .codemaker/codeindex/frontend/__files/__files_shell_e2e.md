---
type: "Fragment"
id: frontend/__files/shell_e2e
title: "外壳与浏览器回归基建"
description: "L3 一键跑起来时到底起了哪两个服务、端口和超时是谁定的？为什么在 Linux 上 npm run test:e2e 起不了后端？为什么本地 dist 不入库而 vendor 的 dist 入库？"
parent: /frontend/__files/_overview.md
fragment: shell_e2e
architectural_role: "交付外壳（唯一 HTML 入口）+ L3 回归基建 + 目录级入库边界"
entity_names:
  constants:
    - name: "React 挂载点"
      value: '#root（由 src/main.tsx 的 createRoot(document.getElementById("root")!) 接管）'
      source: frontend/index.html
    - name: "文档语言 / 标题"
      value: 'lang="zh" / <title>Trade Terminal</title>'
      source: frontend/index.html
    - name: "E2E_FRONTEND_PORT"
      value: "5173（vite dev 与 Playwright baseURL 共用）"
      source: frontend/playwright.config.ts
    - name: "E2E_BACKEND_PORT"
      value: "8000（后端命令参数、/health 探测、vite proxy target 共用）"
      source: frontend/playwright.config.ts
    - name: "后端可执行文件路径"
      value: "../backend/.venv/Scripts/python.exe（Windows 布局：Scripts/ 而非 bin/）"
      source: frontend/playwright.config.ts
    - name: "后端启动命令"
      value: '"<python>" -m market_data.cli serve --port <BACKEND_PORT>，就绪判定 URL = /health'
      source: frontend/playwright.config.ts
    - name: "用例/断言超时与重试"
      value: "timeout 60_000 / expect.timeout 15_000 / retries 1 / fullyParallel false / workers 1"
      source: frontend/playwright.config.ts
    - name: "webServer 超时与复用"
      value: "两个 webServer 各 timeout 60_000，reuseExistingServer: true（两者都会静默复用已在跑的服务）"
      source: frontend/playwright.config.ts
    - name: "证据粒度"
      value: "trace: on-first-retry / screenshot: only-on-failure / video: off / reporter: list；浏览器 chromium(Desktop Chrome) headless"
      source: frontend/playwright.config.ts
    - name: "testDir"
      value: "./tests/e2e"
      source: frontend/playwright.config.ts
    - name: '"/dist/"'
      value: "只忽略前端自身构建产物（锚定 frontend/dist）；vendor/klinecharts-pro/dist 因非锚定路径而**故意入库**"
      source: frontend/.gitignore
    - name: "被忽略的测试与日志产物"
      value: "e2e-results/（诊断脚本证据目录）、test-results/（Playwright trace/截图落地）、playwright-report/、*.log、*.local、.env 与 .env.*"
      source: frontend/.gitignore
retrieval_hints:
  - "L3 浏览器测试一条命令跑起来时，前端和后端分别是怎么被拉起来的？"
  - "端口 8000/5173 被占了怎么改？为什么改了一处另一处还是旧端口？"
  - "为什么 `npm run test:e2e` 在我的机器上报「找不到 python」，Windows 上却正常？"
  - "e2e 的 trace / 截图存在哪里？会不会被误提交进 git？"
  - "构建产物 dist 为什么不入库？那 vendor 里的 dist 为什么又入库了？"
  - "⚠️ 你要找的是 Playwright spec 里断言的具体旅程与选择器契约（data-testid、`window.__kline_chart__`、localStorage key），不在这里 → 在 `frontend/tests`（`frontend_tests_e2e_infra.md` / `frontend_tests_e2e_journeys.md`）；本文件只管这套套件怎样被起起来。"
  - "⚠️ 你要找的是后端 `live_server` fixture（pytest 侧拉起 uvicorn、`MD_TEST_SERVER_START_TIMEOUT`、`--run-live`），不在这里 → 在 `backend/tests`；那是 L2，本文件管 L3。"
  - "⚠️ 你要找的是 `--tv-*` 色表与字体栈的实现，不在这里 → 在 `frontend/src`；本文件只说明「HTML 壳没有主题引导脚本」这一入口事实。"
  - "⚠️ 你要找的是仓库根 `.gitignore`（知识库/agent 工具链/覆盖率目录），不在这里 → 在 `__root/__files`；本文件只管 `frontend/.gitignore` 这一层。"
  - "本组也叫「html 入口 / playwright 配置 / 前端忽略规则」，对应需求中的「打不开页面」「e2e 起不来」「产物误提交」「白屏」。"
  - "架构归属句：新增**用户可见的静态外壳资源**（favicon、manifest、主题引导脚本、字体 preload）只能加在 `frontend/index.html`，不得在 React 挂载后的组件里注入（挂载前需要生效的东西一旦挪进 JS 就会闪/晚到）。"
---

## 业务意图

这三份文件共同支撑一件事：**"前端 + 真实后端 + 真实浏览器"这条链路可以随时被复现，且复现过程中产生的垃圾不会泄漏到版本库。**

1. **唯一 HTML 入口（`index.html`）**：只有 12 行——`lang="zh"`、UTF-8、viewport、`<div id="root">`、`<script type="module" src="/src/main.tsx">`。它刻意**不含任何外链资源**（无字体 CDN、无 favicon、无第三方脚本），因此 `webfont-self-hosting` 的离线可用约束与"运行时零外部请求"是从这一层保证的；标题 `Trade Terminal` 也不触碰到 `beyondether-branding` 禁止的 "TradingView/TV" 字样。它是**挂载前唯一可以做事的地方**——任何必须在 React 之前生效的东西（主题属性、字体 preload、manifest）只能加在这里。
2. **L3 可复现运行基建（`playwright.config.ts`）**：把"跑浏览器旅程要先起两个服务"这条隐性知识固化成配置——`webServer` 两项分别 `npm run dev`（前端，探活 URL = `http://127.0.0.1:5173`）与 `python -m market_data.cli serve --port 8000`（后端，探活 `GET /health`）。`workers: 1` + `fullyParallel: false` + `retries: 1` 是刻意的**串行 + 有限重试**取向：行情终端的状态挂在 localStorage 与真实 WS 推送上，并发会互踩端口与用户状态；而 `trace: on-first-retry` / `screenshot: only-on-failure` / `video: off` 定义"失败时留下什么证据"的取舍——要可回溯的时序（trace）与现场（截图），不要大体积视频。
3. **入库边界（`frontend/.gitignore`）**：与仓库根 `.gitignore` 分层叠加，只负责本目录级的事实。**其中最反直觉的一条被原文注释钉住**：`/dist/` 是锚定路径，只忽略前端自身产物，而 `vendor/klinecharts-pro/dist` 因不匹配 `/dist/` **故意被提交**——CI 在 `npm ci` 之后不重建 vendor，直接消费这份预构建产物（见 `frontend/vendor` 模块）。同时 `.env` / `.env.*` / `*.log` / `e2e-results/` / `test-results/` / `playwright-report/` 三类（本地凭据、日志、测试证据）一律不入库。

## 对外接口

| 接口 | 方向 | 关键字段/取值 | 业务说明 | 消费方 |
|------|------|-----------|---------|--------|
| `npm run test:e2e` | 工程流程 → Playwright | 读 `playwright.config.ts` | L3 唯一入口（AGENTS.md 定义的第 3 层） | 开发者本地；**不进 CI** |
| `webServer[0]` | 本文件 → 本文件组 | `npm run dev` + `url: 127.0.0.1:${E2E_FRONTEND_PORT ?? 5173}` + `reuseExistingServer: true` | 起被测前端；若端口已被占则静默复用旧服务 | `vite.config.ts` server |
| `webServer[1]` | 本文件 → `backend/src` | `"{PYTHON}" -m market_data.cli serve --port {BACKEND_PORT}` + `url: /health` + `cwd: ../backend` | 起真实后端；就绪判据是 `/health`，即后端健康检查形状变了这里就起不来 | backend CLI、webapi `/health` |
| `use.baseURL` | 本文件 → spec | `http://127.0.0.1:${FRONTEND_PORT}` | spec 内所有相对导航以此为基 | `frontend/tests/e2e/*.spec.ts` |
| HTML 挂载契约 | index.html → src | `#root` + `/src/main.tsx` | id 改名会让 `createRoot(...!)` 抛 null；这是全应用唯一的"改错即白屏"点 | `src/main.tsx` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键载体/符号 | confidence |
|---------|---------|--------------|------------|
| `backend/src` | webServer 以后端 CLI 模块名 + `/health` 就绪探活 + 端口参数为契约；REST/WS 形状由 spec 侧断言 | `market_data.cli serve`、`/health`（`kill_switch`/`live_enabled` 亦被 trading-ui 规格要求） | extracted |
| `frontend/tests` | `testDir: ./tests/e2e` 指向其 4 个 spec；spec 里断言的选择器/句柄（`#tradingview-desktop-root`、`window.__kline_chart__`）必须与本配置同活 | `tests/e2e/{user-journeys,panels,quant-lab,kline-realtime}.spec.ts` | extracted |
| `frontend/src` | dev 服务提供页面，`index.html` 挂载 src/main.tsx；`reuseExistingServer` 复用的一定是 src 的旧产物 | `#root`、`src/main.tsx` | extracted |
| `frontend/scripts` | 诊断脚本的默认端口（5173）与证据目录（`e2e-results/`）与本文件同族：`--port` 默认值须能对上 dev 端口，`OUT_DIR` 须保持被忽略 | `scripts/diagnose-kline-realtime.mjs` | extracted |
| `frontend/vendor` | 其预构建 `dist/klinecharts-pro.js` 必须入库（本 `.gitignore` 的 `/dist/` 锚定写法正是为此） | `vendor/klinecharts-pro/dist/*` | extracted |
| `__root/__files` | 根 `.gitignore` 与本文件叠加（例如 `coverage/` 只在根清单里，本目录未重复） | 根 `.gitignore` L23–29 | extracted |
| `.pre-commit-config.yaml` / 根 `.gitignore` | "产物不入库"约束的两处执行点 | `repo-hygiene` 规格 | extracted |

| 调用方 | 使用场景 | 关键载体 |
|-----------|---------|---------|
| 开发者本地 / 回归流程 | 提交前跑 L3 或排障时按需跑诊断脚本 | `npm run test:e2e`、`npm run diagnose:kline` |
| `vite.config.ts` | 读取同一组 `E2E_*` env（proxy target / strictPort） | `E2E_FRONTEND_PORT`、`E2E_BACKEND_PORT` |
| CI（**反面**） | frontend job **不**调用 `test:e2e`（浏览器二进制 + 双服务冷启动成本，且规格明确诊断/e2e 类不做常驻门禁） | `.github/workflows/ci.yml` |

## 典型调用链

### 一条 `npm run test:e2e` 起什么
```
npm run test:e2e
  → playwright.config.ts                                     ← 本模块入口
    → webServer[1]: ../backend/.venv/Scripts/python.exe -m market_data.cli serve --port 8000
      → 轮询 http://127.0.0.1:8000/health（最长 60s，reuseExistingServer 命中则跳过）  ← 跨模块：backend/src
    → webServer[0]: npm run dev → vite 127.0.0.1:5173
      → 页面导航 baseURL/ → index.html → /src/main.tsx → createRoot(#root)          ← 本模块 + 跨模块：frontend/src
        → 页面内 /api 与 /ws 由 vite proxy 转发给 :8000                              ← 跨模块：__files_build_runtime.md
    → workers=1 串行跑 tests/e2e/*.spec.ts                                          ← 跨模块：frontend/tests
      → 失败 → retries=1 → trace 落地 test-results/（被 .gitignore 屏蔽）
```

### 主题（属性绑定缺口的实际后果）
```
用户点设置里的主题开关
  → App.tsx 本地 state（theme: "dark" | "light"）+ 逐层 props 下发 + proRef.setTheme()   ← 跨模块：frontend/src
  → 文档级 [data-theme="light"] 色表层（src/index.css L25/L65）依赖某个元素带该属性
    → 本次扫描在 index.html 与 src 中均未发现写入 documentElement 的 data-theme 的代码
      → 面板级 light 色表是否生效取决于各组件的 props 分支，而非统一属性        ⚠️ 见「现状注记」
```

## 实现约束清单

> 动这三份文件前逐条核对。

### 必须保持存在的配置项

| 项 | 值 | 所在文件 | 说明 | 约束由来 |
|----|----|---------|------|---------|
| `#root` + `/src/main.tsx` | 见左 | index.html | 挂载契约；改名必须与 `src/main.tsx` 同一变更内完成 | 现状硬约束（改错即全站白屏） |
| `lang="zh"` | zh | index.html | 中文为默认语境；品牌与文案口径以中文界面为主 | `openspec/specs/ui-i18n-zh`、`beyondether-branding`（中文界面显示品牌原名） |
| 无外链资源 | 无 CDN/字体/analytics 请求 | index.html | 离线与内网可用的前提 | `openspec/specs/webfont-self-hosting/spec.md` |
| `testDir` | `./tests/e2e` | playwright.config.ts | 与 `vite.config.ts` 的 `test.exclude: ["tests/e2e/**"]` 是**一对**：一处改另一处必改，否则 vitest 会去跑 Playwright spec | 前端两套测试共用目录树的唯一划界手段 |
| `workers: 1` + `fullyParallel: false` | 串行 | playwright.config.ts | 端口/localStorage/真实 WS 节奏的确定性代价；并发会互踩 | 现状设计决策（inferred，无提交说明佐证） |
| `retries: 1` + `trace: on-first-retry` | 一次重试即留 trace | playwright.config.ts | 网络行情类用例偶发失败的取证方式；不保留视频以控产物体积 | 现状设计决策 |
| 双 `webServer` + `timeout: 60_000` | 见左 | playwright.config.ts | 后端 CLI 入口与 `/health` 就绪判据即 L3 契约；`60s` 上限须显著高于实测冷启动（后端 `/health` 依赖加载 parquet 序列与注册调度） | `e2e-test-infra` 规格（后端 L2 fixture 同理要求"上限 MUST 显著高于实测冷启动，且可 env 覆盖"） |
| `E2E_BACKEND_PORT` / `E2E_FRONTEND_PORT` | 默认 8000 / 5173 | playwright.config.ts（与 vite.config.ts 同源） | 端口冲突的正规逃生口；两侧必须同 env 传值 | `vite.config.ts` 注释「Ports are env-overridable…」 |
| `/dist/`（锚定） | 见左 | .gitignore | 只忽略前端自身产物，放行 vendor 预构建产物 | `repo-hygiene`（产物不入库）+ `frontend/vendor` 的相反策略 |
| `.env` / `.env.*` / `*.log` | 忽略 | .gitignore | 凭据与日志禁止入库（后端凭据亦只从环境变量读取） | `openspec/specs/system-architecture`（凭据 MUST 仅从环境变量读取）、`repo-hygiene` |
| `e2e-results/` `test-results/` `playwright-report/` | 忽略 | .gitignore | L3/诊断产物的三种落点，全部属生成物 | `repo-hygiene` 规格 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| L3 怎么拿到后端 | 由 Playwright `webServer` 直接以 `python -m market_data.cli serve --port` 拉起真实进程（cwd 指 `../backend`） | 连开发者已经在跑的后端；或 docker-compose | "真实进程 + 真实端口"才能证明链路；`reuseExistingServer: true` 又允许已在跑时复用，两种诉求并存 | 
| 后端可执行文件的定位 | 写死 `../backend/.venv/Scripts/python.exe` | 用 `uv run` / PATH 上的 python / env 变量指定 | 与 `backend/uv.lock` 的虚拟环境布局对齐；但**该写法是 Windows 专有布局**（POSIX 为 `.venv/bin/python3`）→ 见变更风险 §1 |
| 浏览器矩阵 | 只 chromium（Desktop Chrome, headless） | 加 firefox/webkit | 产品定位是桌面终端；CI 不跑本层，多引擎成本换不到回归价值 |
| 证据类型 | trace(首次重试) + 失败截图，关掉 video | 全量 video | trace 可复原时序与请求（诊断乱序/实时问题的主力），video 体积大且信息被 trace 覆盖 |
| vendor 预构建产物的入库 | 提交 `vendor/klinecharts-pro/dist`，`.gitignore` 用锚定 `/dist/` 精准绕过 | 全局忽略 `dist/` 并在 CI 内重建 vendor | CI 不做 vendor 重建（工具链是 vite4/TS 老版本，与主工程不同），提交产物换取"全新 clone 即可构建" |
| HTML 壳的最小化 | 只做挂载点 + 引 main.tsx，其余（含主题属性）留给 JS | 在内联脚本里预处理属性/字体 | 保持 CSP 与构建简单；代价见「现状注记」关于主题绑定 |

## 变更风险（改它会破坏什么）

1. **[换到 Linux/WSL/macOS 跑 L3]** `PYTHON` 常量写死 `.venv/Scripts/python.exe`（Windows 才有的目录与后缀）。在非 Windows 平台上该文件不存在 → `webServer[1]` 起进程即失败，Playwright 报的是「等待 `/health` 超时 / 命令退出」，很容易被误判为后端坏了。由于 L3 **刻意不进 CI**，这条断裂会长期不被察觉。**改动它时必须同变更内引入跨分支（按 `process.platform` 选 `Scripts/python.exe` 或 `bin/python3`）或改用 env 覆盖**，否则等于悄悄声明"只有 Windows 能跑 L3"。
2. **[把后端命令 / 端口 / 就绪判据三处任一处与后端改掉]** 一旦 CLI 模块名（`market_data.cli serve`）、端口参数或 `/health` 的形状变化，webServer 探测 60s 超时，spec 全片红；症状是"前端页面能手动打开，e2e 却说连不上"——排查方向应在本文件，不在 spec。
3. **[把 `reuseExistingServer: true` 保留而手动起过老代码的后端/前端]** 已有服务会被静默复用：跑的是**上一份代码**，断言却按当前代码写。表现为"改了没生效""时好时坏"。**e2e 前先确认 8000/5173 上没有陈旧进程**（这是本文件组最主要的"假绿/假红"来源）。
4. **[把 `workers` 调大或开 `fullyParallel`]** 端口与 `localStorage`（`raibro.alerts`、`raibro.pinnedTimeframes`、`raibro.rightDockWidth` 等）在同一浏览器 profile 下共享，并发会互写用户状态并与真实 WS 推送节奏赛跑，结果是一批偶发、不可复现的失败。
5. **[只改一处端口 env]** 只给 `playwright.config.ts` 设 `E2E_BACKEND_PORT` 而没给 vite dev 进程设（或反之），代理 target 与后端实际端口分叉 → 所有 `/api` 与 `/ws` 请求 502/挂不上（**两个配置文件各读同一个 env，但分属两个进程**，`npm run test:e2e` 之外手动起 dev 时需成对设置）。
6. **[删 `frontend/.gitignore` 里的 `/dist/` 或者把它写成 `dist/`]** 前者会让本地构建产物在 `git status` 中刷屏、被顺手提交（违反 `repo-hygiene`）；后者（**去掉前导斜杠**）会连 `vendor/klinecharts-pro/dist` 一起忽略——而那份预构建产物是 CI 在 `npm ci` 后直接消费的，被忽略即"新 clone 里没有 vendored 引擎"，前端构建从"能跑"变成"依赖 vendor 重建工具链"。
7. **[在 `index.html` 加外链资源]** 一个 `<link href="https://fonts...">` 或 CDN 图标就会违反自托管规格，并且在内网/断网环境让字体回落系统字形（中文界面观感突变）；`index.html` 同时是 CSP 与首屏依赖的清单边界，任何第三方脚本都必须单独评审。
8. **[给 `index.html` 加 `data-theme`/主题引导脚本时不同步 `src` 的状态真源]** 文档级主题属性属新增的**共享状态通道**：`src/index.css` 的 `[data-theme="light"]` 面板色表、`src/klinecharts-pro-theme.css` 的 `.klinecharts-pro[data-theme=...]` 与 vendor 的 `setTheme` 都按不同层取值；只补 HTML 不改 App 侧，会出现"页面外壳变亮、图表仍深"（或反之）的双主题失同步——正是 design-system 规格禁止的结果。

## 边界约束（能做什么 / 禁止做什么）

- ✅ **可以**：调 `timeout`/`expect.timeout`（须以实测最慢旅程为准，不得凭感觉压低）：新增证据类型或改变 reporter；追加 `frontend/.gitignore` 中"测试产物/日志"分组项（就近加一行注释说明这是什么产物）。
- ✅ **必须**：`e2e` 相关参数改动后至少在本地完整跑一次 `npm run test:e2e`（这是本文件组唯一的验证手段：它没有单测）。
- ✅ **必须**：spec 目录、`testDir`、vitest 排除三者保持同一套边界；新增非浏览器 spec 命名（`*.spec.ts`）若放在 `src/`，会同时被 vitest 收走（见 `__files_build_runtime.md`）。
- ❌ **禁止**：把 `npm run test:e2e` 塞进 CI（规格把浏览器层定位为本地按需运行；浏览器二进制下载与双服务冷启动不是可接受的常驻成本，且行情类断言天然非幂等）。
- ❌ **禁止**：删 `#root` 或改 `/src/main.tsx` 路径；改 `id` 必须与 `src/main.tsx` 同一变更内。
- ❌ **禁止**：为了"稳定"给 spec 加网络重试/降频等待而绕开真实 WS 时序；这类问题属 `frontend/tests` 的定位契约与后端推送节奏，配置层不该掩盖。
- ❌ **禁止**：把 vendor 的 `dist` 纳入忽略、把本地 `dist` 提交、或把 `.env` 用作前端配置通道（前端运行期配置走代理与后端 REST，不存在前端 `.env` 契约）。

## 现状注记（本次扫描观察到）

- **文档级主题属性缺写入点（供人工复核，标记 `inferred`）**：`src/index.css` 有两处 `[data-theme="light"]`（L25、L65）覆盖面板/文字/滚动条色表，`src/klinecharts-pro-theme.css` 另有 `.klinecharts-pro[data-theme="light"]`；后者由 vendor 的 `KLineChartPro.setTheme()` 驱动（`App.tsx` 在主题开关回调里调用），而本次在 `frontend/index.html` 与 `frontend/src/**`（含 `.tsx/.ts`）中**未找到**任何给文档根节点写 `data-theme` 的代码。因此"面板级 light 色表是否曾被激活"取决于 `frontend/src` 各组件的 props 分支（该模块文档亦明确警示"在面板里再加一处裸 hex 三元分支"的问题）。若确认属实，这就是 design-system 规格「双主题切换后全部面板随 `--tv-*` token 变色」的落地缺口，正解是补一个统一绑定（`index.html` 内联引导 + `App.tsx` effect 同步），而不是继续在组件里各写一份三元分支，也不是回到 `tailwind.config.js`（该文件不生效，见 `__files_static_gates.md`）。
- `playwright.config.ts` 的 `reporter: [["list"]]` 未指定 `outputDir`，默认落到 `frontend/test-results/`（已在 `.gitignore`）；`playwright-report/` 条目当前是给 HTML reporter 预留的，若启用需在同一变更内确认它仍被忽略。
- `e2e-results/` 不是 Playwright 产生的，而是 `frontend/scripts/diagnose-kline-realtime.mjs` 的 `--out` 默认目录——忽略它属于"跨模块卫生"，删该条目会让诊断证据被提交。
- 根 `.gitignore`（L23–29）已覆盖 `coverage/`，故 `frontend/.gitignore` **不需要**重复该条目；不要把两套清单当成互相同步的副本。
- 后端就绪判据用 `/health`，同时也是 `trading-ui` 规格里 kill-switch 状态的取数端点（一个端点两用途：进程就绪 + 业务状态），改 `/health` 形状会同时打断 L3 与交易面板。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-browser-journeys/spec.md`、`e2e-playwright-diagnostics/spec.md`、`e2e-test-infra/spec.md`（L2 对照）、`repo-hygiene/spec.md`、`system-architecture/spec.md`、`trading-ui/spec.md`（仅提炼与本组相关的条款）

- 前端 SHALL 提供基于 `@playwright/test` 的浏览器套件（`frontend/tests/e2e/`），通过 `playwright.config.ts` 的 webServer 自动拉起 vite dev 与后端；`npm run test:e2e` SHALL 自动启动前置服务、运行全部 spec 并产出 trace/截图报告。（来源: e2e-browser-journeys）
- E2E/诊断 SHALL 复用 `window.__kline_chart__` 只读句柄读取真实渲染数据，MUST NOT 以 mock 渲染替代；该句柄的存在 MUST NOT 改变生产渲染行为。（来源: e2e-browser-journeys / e2e-playwright-diagnostics）
- 诊断与浏览器套件 SHALL 可本地按需运行，**不作为常驻 CI 门禁**；前置服务缺失时 SHALL 以明确错误终止，MUST NOT 静默通过。（来源: e2e-playwright-diagnostics）
- （L2 对照，同一就绪思想）就绪等待 SHALL 自适应且上限 MUST 显著高于实测冷启动时长，并 SHALL 可通过环境变量覆盖（后端为 `MD_TEST_SERVER_START_TIMEOUT`，默认 180s）——本文件的 60s `webServer.timeout` 与之不同源，调整时须以实测冷启动为凭。（来源: e2e-test-infra）
- 仓库 MUST NOT 跟踪生成型产物；`.gitignore` SHALL 覆盖本地与 CI 产生的目录/文件。（来源: repo-hygiene）
- 系统 SHALL 默认运行于纸面交易，实盘 MUST 由用户显式开启；凭据 MUST 仅从环境变量读取（→ 前端目录不得出现 `.env`）。（来源: system-architecture）
- 交易面板 kill-switch 状态 SHALL 取自 `GET /health`（`kill_switch`/`live_enabled`）——与 L3 webServer 的 `/health` 就绪判据同一端点。（来源: trading-ui）
- shadcn 组件与双主题 SHALL 只换颜色不换布局尺寸，涨跌色两主题保持不变；组件 MUST NOT 硬编码颜色（→ 主题落地缺口见「现状注记」）。（来源: design-system）
