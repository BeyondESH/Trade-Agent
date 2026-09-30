---
type: "Fragment"
id: "frontend/tests/e2e-infra"
title: "浏览器端旅程测试 / 运行基建与选择器契约"
description: "跑一条浏览器用户旅程要不要先起后端？端口被占用怎么办？为什么 e2e 不会被 npm run test 跑起来？"
parent: /frontend/tests/_overview.md
fragment: e2e-infra
architectural_role: "L3 运行基建与前后端定位契约层（配置/串行隔离/无 mock 约束），本身不含业务断言"
retrieval_hints:
  - "跑一条浏览器用户旅程前要不要先手动起后端和 vite？"
  - "为什么 npm run test / test:coverage 跑不到 e2e 用例？"
  - "前端默认端口 8000 被别的工具占用了，整套 e2e 怎么换端口跑？"
  - "新增一个交互按钮时，e2e 侧要求怎么加定位符？"
  - "⚠️ 如果你要找的是真实 uvicorn 进程的 REST/WS 协议测试（L2）或全量 parquet 数据门禁（L1），不在这里，在 backend/tests"
  - "⚠️ 如果你找的是逐 series 的 K 线乱序重型诊断报告（REPLACE/APPEND/STALE + 帧日志/截图），不在这里，在 frontend/scripts（diagnose-kline-realtime.mjs）"
  - "⚠️ 如果你找的是组件/hook 的 jsdom 单测，不在这里，在 frontend/src（*.test.tsx，由 vitest 跑）"
  - "本目录也叫「Playwright E2E 套件 / L3 / 浏览器旅程」，对应 AGENTS.md 的 L3 browser journeys"
  - "新增旅程必须写进 frontend/tests/e2e 下既有的 4 个 spec 之一，不可新建第 5 个文件；新选择器契约一律加在 frontend/src 组件上，本目录不定义契约"
entity_names:
  constants:
    - name: E2E_FRONTEND_PORT
      value: "5173（可 env 覆盖）"
      source: frontend/playwright.config.ts
    - name: E2E_BACKEND_PORT
      value: "8000（可 env 覆盖）"
      source: frontend/playwright.config.ts
    - name: MD_TEST_SERVER_START_TIMEOUT
      value: "180s 默认（L2 专用，改动测试启动耗时时同步核对）"
      source: backend/tests/conftest.py（AGENTS.md 记录）
    - name: PLAYWRIGHT_TIMEOUT
      value: "测试 60_000ms / expect 15_000ms（trace 仅首次重试、screenshot 仅失败）"
      source: frontend/playwright.config.ts
    - name: RETRY_POLICY
      value: "retries: 1 / workers: 1 / fullyParallel: false"
      source: frontend/playwright.config.ts
    - name: raibro.rightDockWidth
      value: 'localStorage key，值=拖拽后的面板像素宽度'
      source: frontend/src/components/sidebar/rightDockWidth.ts（`RIGHT_DOCK_WIDTH_KEY`）
    - name: raibro.alerts
      value: "localStorage key，值=告警数组（symbol/condition/threshold/enabled/triggered）"
      source: frontend/src/lib/alertsStore.ts（user-journeys.spec.ts 种入 id=e2e-1）
---

## 对外接口（测试契约）

本子模块对终端用户没有任何运行时贡献，但**对前端与后端构成一份隐式接口契约**——以下每一项被改动时，`npm run test:e2e` 会立刻红：

| 契约 | 方向 | 关键字段 | 业务说明 | 消费方 |
|------|------|---------|---------|--------|
| 一键运行 | dev→test | `npm run test:e2e` = `playwright test` | 自动拉起两个服务、跑全部 spec、产出 trace(首次重试)/截图(仅失败) | `openspec/specs/e2e-browser-journeys`「一键运行」 |
| webServer 前置 | test→服务 | vite `npm run dev` + `python -m market_data.cli serve --port 8000` | 以 `http://127.0.0.1:5173` 与 `:8000/health` 为就绪判据，`reuseExistingServer: true` 允许复用已在跑的服务 | 全部 spec |
| 只读观测句柄 | 生产→test | `window.__kline_chart__.getDataList()` | 断言真实渲染数据列的唯一入口；句柄存在**不得改变渲染结果与交互行为** | `kline-realtime.spec.ts` |
| 定位器契约 | 生产→test | `data-testid`（源码现有 42 个）/ id（`#right-tab-*`、`#bottom-tab-*`、`#screener-tab`、`#global-nav-rail`、`#tradingview-right-dock`、`data-tab-id`） | 关键交互元素必须可靠定位，**不依赖视觉文本**（i18n「通知」是现存例外，见约束清单） | 全部 spec |
| 分层互斥 | 构建→test | `vite.config.ts` 的 `test.exclude: ["tests/e2e/**"]` | e2e spec 不是 vitest 用例；也不进 `--coverage` 统计口径 | vitest / CI |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `frontend`（包根，非 `frontend/src`） | spec 文件在本模块，但 testDir/超时/端口/webServer 全在上级配置里，改运行行为要改配置文件而不是 spec | `playwright.config.ts:webServer` | extracted |
| `frontend/src` | 全部断言对象：`data-testid` 所在组件（OrderModal/AlertsPanel/RightDock/bottom dock/AgentView/QUANT LAB） | `KLineChartProView.tsx:__kline_chart__` | extracted |
| `backend/src` | 旅程依赖真实 REST/WS：`/health`、`/order`+`/order/confirm`、`/alerts` CRUD、`/portfolio`+`/control`、`/backtest`、参数扫描 | `webapi` 路由 | extracted |
| `frontend/vendor` | 周期栏 DOM（`.item.period`）来自 vendored klinecharts-pro，无 data-testid，只能用类名 | `.item.period` | extracted |
| `frontend/scripts` | 实时乱序判定口径（REPLACE/APPEND/STALE、帧≥当前尾部）与此处 WS 有序断言必须一致 | `diagnose-kline-realtime.mjs` | inferred |
| `.`（AGENTS.md 测试金字塔） | 三层命令矩阵（L1 `-m integrity` / L2 `-m live --run-live` / L3 `npm run test:e2e`）与 freshness skip 行为定义在仓库根约定 | — | extracted |

反向依赖（谁依赖本模块的稳定性）：

| 调用方 | 场景 | 说明 |
|--------|------|------|
| `frontend/src` 的日常改动 | 任何改 locale 文案、id 命名、localStorage key、周期栏结构的 UI 提交 | 必须先在这里跑通，否则「UI 无回归」的判断失去依据 |
| `backend/src` 的 webapi 变更 | 405/404/200-空 等状态语义漂移、WS 帧字段改名 | 下单/告警/回测旅程会先红，比 L1/L2 更接近用户可见后果 |
| `openspec` 变更流程 | 动这些契约的 change 必须同步更新 `openspec/specs/e2e-browser-journeys` | 规范与断言不能分叉 |

## 典型调用链

### 跑一条浏览器旅程（例如 paper 下单）
```
npm run test:e2e
  → playwright 起 webServer → frontend/scripts(vite dev :5173) + backend/src(market_data.cli serve :8000, 等 /health)
    → tests/e2e/user-journeys.spec.ts
      → page.goto("/") → frontend/src 应用真实渲染 → 图表连 backend /ws
      → click [data-testid="nav-open-order"]        ← 跨模块：frontend/src/OrderModal
      → fill amount → click [data-testid="order-submit"]
        → 两阶段确认流程 → POST backend /order → /order/confirm      ← 跨模块：backend/src（paper-only）
      → expect(order-submit).toBeHidden()          ← 断言的是弹窗生命周期 + 后端风险审批都成立
```

### 服务端口被占用时（企业工具常占 :8000）
```
E2E_BACKEND_PORT=18000 E2E_FRONTEND_PORT=5174 npm run test:e2e
  → playwright.config.ts 读 env → BACKEND_URL/baseURL/webServer 命令 --port 三处同步生效
```

## 实现约束清单

> 实现「新增/修改 e2e 用例」或「改动前端可定位元素」相关需求时，动笔前逐条核对。

### 必须遵守的定位与运行约束

| 约束 | 具体做法 | 说明 | 约束由来 |
|------|---------|------|---------|
| 新交互元素必须给 `data-testid` | 在 `frontend/src` 组件上加 `data-testid`，spec 里以它定位 | **禁止**用视觉文本定位新元素（zh-CN 默认，文案一改旅程即失效） | `openspec/specs/e2e-browser-journeys`「稳定定位器」 |
| 遗留类名定位只能收口不能扩散 | `.item.period`（vendored klinecharts-pro）、`#global-nav-rail button[title="AI Agent"]`、`getByTitle("通知")` 是已知例外 | 不得为新组件仿照这些写法；确需扩展应先在 src 侧补 testid | `openspec/changes/.../design.md` D7 + V2「缺失稳定定位器」实测清单 |
| 只读句柄不得为测试扩写 | `__kline_chart__` 只暴露 `getDataList()` 级别的只读访问 | 禁止为了让断言好写而给句柄加 setter/回放控制——它同时被 `diagnose-kline-realtime.mjs` 使用并常驻生产页 | `openspec/specs/e2e-playwright-diagnostics`「不改变生产行为」 |
| WS 监听必须在 `goto` 之前注册 | 用 `page.on("websocket")` 观测 `/ws` 时先挂 listener 再导航 | Playwright 只上报注册后建立的连接，挂晚了永远收不到 candle 帧 | `kline-realtime.spec.ts` 注释（实测约束） |
| 交易状态必须自动复位 | kill-switch 用例「点击→显示停用→**必须再点恢复**」；reset funds 用例校验余额回到原值；告警用例先清空残留 | L3 是单 worker 串行 + 全局后端状态，一条用例把 run control 留在 halted 会让后续下单用例假失败 | AGENTS.md 测试分层约定 + 本 spec 内串行注释 |
| 不新增 e2e 到默认测试命令 | `npm run test` / `npm run test:coverage` 不得跑 `tests/e2e/**` | 覆盖阈值是「只升不降」的 ratchet（基线 55.69%→门槛 55），把慢套件塞进单测门禁会同时破坏 CI 与覆盖率口径 | `frontend/vite.config.ts` ratchet 注释 + `.github/workflows/ci.yml` 顶部注释 |

### 状态隔离与超时策略

| 项 | 当前策略 | 适用 |
|----|---------|------|
| 用例间隔离 | 无 globalSetup/storageState，用「前置清空」+「后置复位」代替 | 有后端持久状态的用例（alerts/portfolio/kill switch/preset） |
| localStorage 造数据 | `page.addInitScript` 种 `raibro.alerts`（可指定阈值使其自然触发），测完删除条目 | 需要确定性而不依赖上游行情的实时断言 |
| 等待方式 | `waitForChartData` 轮询句柄（≤30s）+ 行情类断言 `waitFor(...15s)`；`page.goto` 后仍残留 `waitForTimeout(800~2500)` 稳定渲染 | **禁止在真实断言里**用固定 sleep 代替超时（QUANT LAB 明确禁止） |
| 降级口径 | 只读面板断言「有数据 **或** 明确占位/空态」，且 `.not.toHaveText("")` 排除空白；交易/回测类断言不接受空态 | 离线只读可用真实数据或空态，写入类必须走通 paper 链路 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| Playwright 绑定语言 | Node `@playwright/test`（spec 落 `frontend/tests/e2e`） | pytest-playwright（L1/L2 同在 Python） | L3 面向浏览器/前端契约，留在同一语言与同一包管理器；pytest 侧不装 playwright，浏览器套件不污染 Python venv（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D1） |
| 图表数据校验方式 | 只读 `window.__kline_chart__` + `page.on("websocket")` 旁路观测 /ws | 截图 OCR / 内部 fixture mock 渲染 | 「断真实渲染」是本层存在的理由，mock 即退化为 L2/单测 |
| 并行度 | `workers: 1` + spec 内 serial | 并行提速 | 依赖真实后端与浏览器 profile（字体/滚动条按 key 生效），并行会互相污染账户与告警状态 |
| 是否入 CI | **不入**，仅本地按需 | 加 chromium job | 浏览器二进制每次下载 + 双服务冷启动，成本远高于收益；回归门禁由 L1/L2 + vitest + `tsc --noEmit` + biome lint 承担（来源: `.github/workflows/ci.yml` 注释、`openspec/specs/ci-quality-gates`） |

## 变更风险

- 改 `playwright.config.ts` 的 webServer/env 端口（例如把 8000 写死去掉）→ 在端口被占的机器上整套旅程无法运行，团队会直接跳过 L3，「真实链路」回归能力归零。
- 改前端 `id`/`data-testid`/`localStorage` key（含 `raibro.*` 前缀与品牌改名类变更）→ 旅程成批假失败；处理顺序必须是「src 定义契约 + spec 消费」一次 PR 内完成，不允许只改一边。
- 把 `vitest` 的 `exclude: ["tests/e2e/**"]` 去掉 → `npm run test` 会去收集 Playwright spec 并失败；同时 `tsc` 的 `include: ["src", "vite.config.ts"]` 决定了 e2e 的 4 个 spec **不在 typecheck 范围内**，改动它们必须靠 `npm run lint`（biome 覆盖 `frontend/**`）+ 真跑一次兜底。
- 若把告警触发用例改成依赖真实行情（去掉 threshold 0.01 这种确定性种子）或给 QUANT LAB 用固定 sleep → CI/离线机器上会变成稳定红点，最终结果是这条 guard 被 `test.skip` 掉，风险由「偶发」升级为「永久静默」。

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-browser-journeys/spec.md`（「测试稳定性与隔离」「一键运行」「稳定定位器」三条要求）、`openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md`（D1 Playwright 绑定选型、D2 离线优先、D7 稳定性与 webServer 配置、V2 实测缺失定位器清单）、`openspec/specs/e2e-live-api/spec.md` 与 `openspec/specs/e2e-test-infra/spec.md`（分层边界：L2 的 `live_server`/`--run-live` 与 `MD_TEST_SERVER_START_TIMEOUT` 属于 `backend/tests`，本模块不实现，仅在分层互斥处引用）。
