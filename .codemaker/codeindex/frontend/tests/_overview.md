---
type: "Module"
id: "frontend/tests"
title: "浏览器端旅程测试"
description: "在真实 Chromium 里走通交易终端的用户旅程（首屏出图、周期切换、paper 下单、告警 CRUD 与自动触发、kill switch、资金重置、QUANT LAB 回测与参数扫描），证明用户看到的每一屏都由真实数据渲染，而不是被 mock 出来的「绿色」。"
module_id: "frontend/tests"
architectural_role: "L3 测试层（Playwright 浏览器用户旅程，唯一能证明前端↔后端真实链路的手段，刻意不进 CI 门禁）"
world_model_hints:
  - "属于测试金字塔第 3 层（L3）：后端 L1 数据完整性、L2 真实进程 API/WS 是它的语义前置，它负责再往上验证『用户在屏幕上看到什么』"
  - "只读断言层：本模块不产出任何生产逻辑，只依赖 frontend/src 暴露的定位契约（data-testid / id / i18n 文案）与只读句柄 window.__kline_chart__"
  - "运行真实服务：playwright.config.ts 的 webServer 同时拉起 vite dev(127.0.0.1:5173) 与 `python -m market_data.cli serve`(127.0.0.1:8000)，reuseExistingServer=true"
  - "刻意不进 CI：浏览器二进制下载 + 服务冷启动太慢，只在本地按需运行（见 openspec/specs/ci-quality-gates 与 .github/workflows/ci.yml 顶部注释）"
upstream_modules:
  - module: "."            # AGENTS.md 三层测试金字塔约定 + 开发者的 `npm run test:e2e` 是本模块唯一触发方式
    confidence: extracted
  - module: "frontend"    # frontend/package.json 的 test:e2e 脚本与 playwright.config.ts（在 frontend 根，不在本目录）
    confidence: extracted
  - module: "backend/src" # spec 里断言的响应/WS 帧结构以 webapi 的 REST + /ws 契约为输入
    confidence: extracted
downstream_modules:
  - module: "frontend/src"   # 契约反向依赖：本模块断言 frontend/src 的 data-testid、id 与 localStorage key
    confidence: extracted
  - module: "frontend/vendor"
    confidence: extracted
  - module: "frontend/scripts"  # 与 diagnose-kline-realtime.mjs 共用 __kline_chart__ 句柄与有序性口径
    confidence: inferred
---

## Files

### 源代码路径

- `frontend/tests/e2e/`（唯一子目录；4 个 spec，共 465 行）
- 归属本模块的配置在**上一级**：`frontend/playwright.config.ts`（testDir/webServer/端口）、`frontend/package.json` 的 `test:e2e` 脚本、`frontend/vite.config.ts` 的 `test.exclude: ["tests/e2e/**"]`

### 知识库文档

- `.codemaker/codeindex/frontend/tests/_overview.md`（本文件）
- `.codemaker/codeindex/frontend/tests/frontend_tests_e2e_infra.md`（运行基建与选择器契约）
- `.codemaker/codeindex/frontend/tests/frontend_tests_e2e_journeys.md`（图表/面板/QUANT LAB 旅程）

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）；本知识库不列举符号清单

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `frontend_tests_e2e_infra.md` | 运行基建：单 worker 串行、双 webServer、端口可覆盖、离线降级、选择器契约、localStorage key、与 L1/L2 的分层边界 | `E2E_FRONTEND_PORT`、`E2E_BACKEND_PORT`、`MD_TEST_SERVER_START_TIMEOUT`、`raibro.rightDockWidth`、`raibro.alerts` |
| `frontend_tests_e2e_journeys.md` | 旅程断言：首屏出图与 15m 步长、WS candle 帧有序、行情无空值、QUANT LAB 60 秒超时、告警自动触发、kill switch 复位、reset funds | `__kline_chart__`、`STALE`、`trading-tab-positions`、`信号K线`、`e2e-1` |

## 模块概述

**业务定位**：本模块解决的是「前端 + 后端 + 真实浏览器合起来是否还成立」这个问题——单元测试可以靠 mock 全绿，只有这里要求一根真实 K 线出现在 canvas 上、一笔真实 paper 单被后端受理、一条真实行情价格把告警点亮，因此它是行情终端「禁止示例/陈旧数据」这条产品红线唯一的可执行守护者。

**业务上游**：没有运行时上游。触发方式是开发者本地执行 `cd frontend && npm run test:e2e`（AGENTS.md 定义的 L3 层），Playwright 的 webServer 自己去拉起 vite dev 与 `market_data.cli serve`；CI 不触发本模块（浏览器二进制与冷启动成本，`.github/workflows/ci.yml` 已写明「intentionally NOT part of CI」）。

**业务下游**：本模块被改坏不会破坏线上行为，但会**失去回归能力**——42 个 `data-testid` 契约与 `window.__kline_chart__` 只读句柄一旦不被断言钉住，前端替换 mock 数据、图表不再出图、下单/告警链路断裂都可能长期无人察觉；反之，`frontend/src` 改 locale 文案、id 命名、localStorage key 或周期栏 DOM 结构时，必然先在这里红一片，这是本模块存在的意义。

## 架构简析

分层结构（单行）：`playwright.config.ts webServer(vite :5173 + uvicorn :8000)` → `tests/e2e/*.spec.ts 旅程脚本` → `frontend/src DOM 契约(data-testid/id/文案) + window.__kline_chart__` → `backend/src webapi REST/WS`

- **入口层**：4 个 spec 文件即 4 个业务域，彼此无共享 fixture（未使用 `fixtures.ts`/globalSetup），每个 test 自己 `page.goto("/")`。
- **断言层三种口径**：① 只读句柄读图表内存数据列（`waitForChartData` 轮询 + 时间戳严格递增）；② DOM 定位（id / data-testid / `#global-nav-rail button[title="AI Agent"]`）；③ 协议层旁路（`page.on("websocket")` 直连 `/ws` 日志）。
- **稳定性策略**：`workers: 1` + 每 spec `test.describe.configure({ mode: "serial" })` + `retries: 1`；有外部状态的用例自行前置清理（告警全删）或无条件复位（kill switch 必须 resume、reset funds 校验余额回到原值）。
- **降级边界**：只读旅程（panels/quant-lab）接受"真实值或明确占位/空态"，交易类用例（下单/告警/回测/扫描）不接受空态——因为后者依赖后端已落盘数据可离线工作。

## 内置文档与 OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-browser-journeys/spec.md`、`openspec/specs/e2e-playwright-diagnostics/spec.md`、`openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/{proposal,design}.md`、`openspec/changes/archive/2026-09-20-fix-live-test-order-flake/`（非完整转录，仅提炼与本模块相关的约束）

- **本模块在规范中的身份**：三层测试金字塔的 L3「浏览器用户旅程」；L1（`pytest -m integrity`）与 L2（`pytest -m live --run-live`）在 `backend/tests`，三者互不替代，L3 只负责「真实浏览器 + 真实前后端」这一格。
- **能力归属**：本目录实现的规范能力为 `e2e-browser-journeys`（旅程清单：首屏出图 / symbol 与 timeframe 切换 / 多 tab / paper 下单 / 告警 CRUD / 右侧面板可见性 / 稳定性与隔离）；`e2e-playwright-diagnostics` 描述的重型逐 series 诊断落在 `frontend/scripts`，两者共享 `__kline_chart__` 只读句柄与「帧时间戳不早于图表尾部」的判定口径。
- **明确豁免**：`online` 标记（真实外网）永不用作门禁；Playwright E2E 有意不入 CI，只本地跑（`.github/workflows/ci.yml` 顶部注释）。
- **设计不变量（源自 design.md D1/D2/D7）**：Node `@playwright/test` 而非 pytest-playwright；离线优先、在线可选；关键交互元素以 `data-testid` 定位，不依赖视觉文本。
