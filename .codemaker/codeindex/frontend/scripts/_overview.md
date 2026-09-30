---
type: "Module"
id: frontend/scripts
title: "实时K线乱序诊断脚本"
description: "用真实浏览器 + 真实后端把「K 线出现重复/乱序 bar」这类只在实时时序交错下暴露的缺陷，变成可判定、可留证的端到端诊断结论。"
module_id: frontend/scripts
architectural_role: "端到端诊断工具层（Playwright bare script），不参与生产运行时、不进 CI 门禁"
world_model_hints:
  - "属于仓库最外层的『手工取证』层：由开发者在 `frontend/` 下用 `npm run diagnose:kline` 手工触发，无常驻进程、无调度、无 API"
  - "上游是规格 `e2e-playwright-diagnostics`（要求脚本必须产出可判定的通过/失败结论）与『图表 bar 乱序』这一现场反馈"
  - "下游只有『结论与证据』：frames.json + 截图 + stdout verdict，用于定位并钉死前端 `bitgetWs.deliver` 单调性防护与后端 `/ws` 轮询保序水位"
  - "它以纯观察者身份读生产代码（只读诊断句柄 `window.__kline_chart__` 与 `/ws` 帧），禁止在其中写数据或修补图表"
upstream_modules:
  - module: frontend（`frontend/package.json` 的 `diagnose:kline` 脚本入口）
    confidence: extracted
  - module: openspec/specs/e2e-playwright-diagnostics（脚本存在的规格依据）
    confidence: extracted
  - module: repo-root（AGENTS.md「Test Suite」三层体系之外的补充诊断手段，开发者手工执行）
    confidence: inferred
downstream_modules:
  - module: frontend/src（被观测方：`KLineChartProView` 的只读句柄、`bitgetWs` 实时投递、vendored klinecharts-pro 周期条 DOM）
    confidence: extracted
  - module: backend/src（被观测方：`/ws` candle 通道帧与 `/candles/recent` 前置探测）
    confidence: extracted
  - module: backend/tests, frontend/tests（诊断结论驱动的保序修复与 e2e 断言）
    confidence: inferred
---

## Files

### 源代码路径

- `frontend/scripts/`
- 同级散落代码文件（本模块唯一实体，与目录同级纳入本知识库）：`frontend/scripts/diagnose-kline-realtime.mjs`（约 270 行，ESM 裸脚本，无导出、无测试夹具，函数 `arg` / `check` / `preflight` / `runTimeframe`（内含 `sample`、`observe`）/ `main`（内含 `tailAt`））

### 关联契约文件（脚本运行依赖，改动需联动）

- `frontend/package.json` — `"diagnose:kline": "node scripts/diagnose-kline-realtime.mjs"`；`playwright` 为 devDependency，且**刻意不引入** `@playwright/test` 作为脚本运行器；`test:e2e` 是另一条独立命令
- `frontend/src/components/chart/KLineChartProView.tsx` — 在 `onReady` 链路上挂只读诊断句柄 `window.__kline_chart__`（脚本可读真实数据列的唯一前提）
- `frontend/src/api/bitgetWs.ts` — `BitgetWsClient.deliver` 的 `open_time` 单调性防护，是本脚本要验证的第一层保序
- `backend/src/market_data/webapi.py` — `/candles/recent`（前置探测）与 `/ws` candle 帧（`channel/category/symbol/timeframe/action/data.last_candle`），是本脚本的数据源
- `frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx` — `item period [selected]` 类名是脚本切周期的定位依据
- `frontend/vite.config.ts` — `/api` → `:8000`（去 `/api` 前缀）、`/ws` → `ws://:8000` 的代理，决定脚本只需访问 vite 端口
- `frontend/tests/e2e/kline-realtime.spec.ts` — 复用同一数据列句柄的 **Playwright 套件版**（名字高度相似，勿与本脚本混为一谈）

### 知识库文档

- `.codemaker/codeindex/frontend/scripts/_overview.md`（本文件）
- `.codemaker/codeindex/frontend/scripts/scripts_kline_realtime_diagnose.md`
- `.codemaker/codeindex/frontend/scripts/scripts_diagnose_contract.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。注意：Codemap 对 `.mjs` 裸脚本收录有限，本模块符号请以源码为准，勿因 `find_symbol` 无结果而认为代码不存在

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `scripts_kline_realtime_diagnose.md` | 诊断执行链（前置探测 → 周期切换 → 帧采集 + 1s 采样 → 对账三分类 → 序列升序校验 → verdict 与退出码）、命令行参数、证据与输出目录 | `WINDOW_SECONDS=30`、`REPLACE/APPEND/STALE`、`OK_ORDERED/NO_REALTIME_DATA/STALE_OUT_OF_ORDER/SERIES_NOT_ASCENDING`、退出码 `0/1/2` |
| `scripts_diagnose_contract.md` | 脚本与被诊断方的耦合契约：只读图表句柄、`/ws` candle 帧字段、周期条 DOM 类名、规格三层保序责任划分、「不是 CI 门禁」的边界、句柄/选择器漂移风险 | `window.__kline_chart__`、`.klinecharts-pro-period-bar span.item.period`、`channel==="candle" && data.last_candle`、`series key = symbol/timeframe` |

## 模块概述

**业务定位**：本模块解决的是「K 线图上出现重复或乱序的 bar，但所有单元测试都是绿的」这一业务问题。实时链路对同一 series 有两条并行来源（事件驱动 ~1s 节流推送、~5s 周期快照轮询），而 `klinecharts.updateData` 的语义是「`timestamp` 等于尾部即替换、大于即追加」——只要有一帧 `open_time` 比当前尾部更旧却更晚抵达，它就会作为新桶被插进去，时间序列被破坏。逐层 mock 的 vitest 永远以人工顺序喂帧，看不见真实 socket 的交错时序，因此缺陷只在浏览器端暴露。本脚本把这条链路变成**可判定**的诊断：采集每一帧实时 candle，与当时图表数据列尾部对账成 REPLACE / APPEND / STALE 三类，再独立校验整列严格升序无重复，最后给出每个周期是「没收到实时数据」还是「收到了但乱序」的明确结论。
（来源: `openspec/changes/archive/2026-08-20-diagnose-kline-realtime-order/proposal.md`「Why」、`design.md` Context 与 Decision 1/2）

**业务上游**：没有代码调用方，触发者是开发者本人——在 uvicorn（`127.0.0.1:8000`）与 vite dev（`:5173`）都已运行的前提下执行 `cd frontend && npm run diagnose:kline`。触发时机有两类：①现场报告图表 bar 乱序/重复，需要判定根因；②改动了 `bitgetWs.deliver`、后端 `/ws` 保序水位或 vendored klinecharts-pro 的 `updateData` 语义后，做实时推进的回归确认与现场取证（归档任务 7.1/7.3 即如此使用）。规格明确要求脚本**可作为常驻 CI 门禁之外的本地按需运行手段**，前置服务缺失时必须以明确错误终止，而不是静默通过。
（来源: `openspec/specs/e2e-playwright-diagnostics/spec.md`「端到端实时 K 线诊断脚本」Scenario 1/2、`openspec/changes/archive/2026-08-20-diagnose-kline-realtime-order/tasks.md` 1.3/4.1/7.1/7.3）

**业务下游影响**：脚本自身不写任何数据、不影响生产渲染，它的「下游」是**结论驱动的修复范围与验收口径**：判定结果与帧日志/截图共同回答『该修后端水位还是前端防护』，因此它的分类一旦失真（例如把 `open_time` 单位改成秒、或对账参照取错快照），会把一个真实的乱序缺陷误报为「有序」，让 `kline-realtime-order-guard` 的两层纵深防御失去唯一能覆盖真实时序的验证手段。同时它与 Playwright 套件 `frontend/tests/e2e/kline-realtime.spec.ts` 共用只读句柄契约：句柄被摘掉或改名，两处同时失效。
（来源: `openspec/specs/kline-realtime-order-guard/spec.md`、`design.md` Decision 3/6、`frontend/tests/e2e/kline-realtime.spec.ts` 文件头注释）

## 架构简析

模块只有一个裸脚本，内部按「一次 main 循环」组织，没有分层抽象；从职责看是一条单向观测—对账—判读流水线：

**分层结构（单行）**：CLI 参数层:`diagnose-kline-realtime.mjs:arg` → 前置探测层:`preflight`（GET `/api/candles/recent`）→ 观测采集层:`page.on("websocket")` 帧采集 + `runTimeframe:observe`（读 `window.__kline_chart__.getDataList()`）→ 对账判读层:`main:tailAt` + 三分类 + 升序/去重校验 → 报告输出层（stdout verdict + `frames.json` + 截图 + 退出码）

- **核心函数**：`preflight`（唯一硬前置校验，失败即 `[FATAL]` 退出 1）、`runTimeframe`（周期对齐 + 以 ~1s 节奏持续采样数据列快照）、`observe/sample`（把图表列取成 `timestamp` 数组快照）、`main`（WS 帧订阅注册、逐周期串行诊断、对账与判读、证据落盘）。
- **关键数据流**：`frames[]`（每帧 `t/category/symbol/timeframe/action/open_time/close`）与 `snapshots[]`（每 ~1s 一次 `{t, timeframe, tailTimestamp, length, timestamps}`）并联累积 → 以「帧到达时刻 ≤ 最近一个快照」为参照做 REPLACE/APPEND/STALE 分类 → 末周期 `timestamps` 做严格升序与重复计数 → 输出按 `symbol/timeframe` 聚合的计数与 verdict。
- **状态机/生命周期**：无持久状态；一次进程 = 一次诊断，浏览器 `chromium.launch()` → 单页 goto → 串行遍历 `TIMEFRAMES` → `browser.close()` → 按结论 `process.exit`。
- **扩展点**：无插件机制。规格上本模块的扩展方式是**给既有脚本加参数/判据**（如新增周期列表、拉长窗口），而不是把它接进 `@playwright/test` 套件——套件版另有归属（见子文档的边界约束）。

## 读写边界

- **只读**：`/ws` 帧、图表数据列、`/candles/recent`。脚本对生产系统零写入、零副作用。
- **唯一写出物**：`frontend/e2e-results/frames.json` 与 `e2e-results/chart-<末周期>.png`（默认落在 `--out`，仓库内已被 `frontend/.gitignore` 忽略，属证据而非制品，禁止提交）。

## 上下游关系

> `extracted` = 有 import/脚本入口/规格明文可验证；`inferred` = Agent 推断待复核

**上游（谁触发本模块）**

| 上游 | 方式 | 依据 | confidence |
|------|------|------|------------|
| 开发者手工执行 | `cd frontend && npm run diagnose:kline [--timeframes 1m,5m,1h] [--window 30] [--port 5173] [--out ./e2e-results]` | `frontend/package.json` scripts | extracted |
| 缺陷报告 / 保序修复的验收 | 修前取基线、修后确认「STALE=0 且列严格升序」（归档 tasks 7.1/7.3） | `openspec/changes/archive/2026-08-20-diagnose-kline-realtime-order/tasks.md` | extracted |
| CI（`.github/workflows/ci.yml`） | **不运行本脚本**（Playwright E2E 明确排除在 CI 外，需真实行情） | `ci.yml` 第 10 行注释 | extracted |

**下游（本模块影响/牵连谁）**

| 下游 | 影响 | confidence |
|------|------|------------|
| `frontend/src/api/bitgetWs.ts` | 脚本给出的 STALE 计数是「投递前 `open_time` 单调性防护」是否需要改动的唯一端到端证据 | extracted |
| `frontend/src/components/chart/KLineChartProView.tsx` | 诊断依赖其 `window.__kline_chart__` 只读句柄，句柄契约不可撤（否则本脚本与 `tests/e2e/kline-realtime.spec.ts` 同时失效） | extracted |
| `backend/src/market_data/webapi.py` | 「该帧是回退快照还是正常替换」的判读直接决定后端 `/ws` 保序水位是否维持 | extracted |
| `frontend/e2e-results/`（gitignored） | 每次运行覆盖 `frames.json` 与末周期截图，作为事后复核证据 | extracted |
| 数据/渲染本身 | **无**：脚本不写 store、不改订阅、不动图表 | extracted |

## 变更风险速览（详见子文档）

- 动了 `updateData`/追加语义（例如改 `candleToKLine` 的 `timestamp` 单位或映射），但没同步脚本的三分类基准 → 会把真实乱序判成 REPLACE，把「已修复」的假结论写进 design/tasks。
- 把只读诊断句柄改名或摘掉（`window.__kline_chart__`）→ 脚本在 30s 就绪等待后抛超时、以异常退出 2，`frontend/tests/e2e` 的实时保序断言同时变红；规格要求该句柄存在且**不改变生产渲染**。
- 把 vendored `klinecharts-pro` 周期条的类名（`item period` / `selected`）重构掉 → 脚本静默放弃切周期（只 `console.warn` 并继续），随后按显示中的**旧周期**判读，产生「按请求周期全绿但实际没测该周期」的假通过。
- 把脚本接进 CI 或 `test:e2e` 前置流程 → 违背规格「不作为常驻 CI 门禁」与 `ci.yml` 的显式排除（依赖真实外网行情，结果非确定）。
- 天真地以退出码 0 解读为「实时链路健康」 → 零帧场景是 exit 1（`NO_REALTIME_DATA`），而多周期运行时升序断言只覆盖**最后一个**周期的数据列，前序周期只受 STALE 判定保护。
