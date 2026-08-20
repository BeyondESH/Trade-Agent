## Why

当前测试体系存在"分层孤岛"：后端 243 个 pytest 全部走 `TestClient`（进程内、mock 依赖），前端 239 个 vitest 全按组件/hook mock，二者都验证**单元逻辑**而非**系统行为**。唯一的端到端手段是 `frontend/scripts/diagnose-kline-realtime.mjs`——一个面向单一 K 线时序问题的裸脚本，不是可扩展的测试体系。

因此以下真实路径从未被测试覆盖：
- **数据层**：25 个 series / 31k 行 parquet 的连续性、OHLC 一致性、边界对齐，从未整体校验（历史已暴露过 24 小时 gap 与单点缺根）。
- **接口层**：33 个 REST 端点 + `/ws` 全部通道，只在 TestClient 内测过，从未对**真实 uvicorn 进程**验证过网络语义（HTTP 状态、错误路径、真实序列化）。
- **功能层**：用户旅程（开 tab、切周期、下订单、设告警、切换 symbol）从未在真实浏览器中端到端走通。
- **模块层**：CLI（pull/serve/backtest/agent/order）、Excel 导出、缓存失效等，缺进程级回归。

本次引入**三层全流程测试体系**：数据完整性（pytest 直读 parquet）→ 真实进程 API/WS（pytest fixture 拉起 uvicorn）→ 浏览器用户旅程（Playwright），覆盖全部接口、全部系列、全部核心功能。外部依赖（Bitget REST/WS、BlockBeats、LLM）离线优先、在线可选。

## What Changes

- **L1 数据完整性（pytest）**：新增 `backend/tests/test_data_integrity.py`，枚举全部 25 个 series，逐系列断言：时间戳严格递增、无重复、OHLC 数值合法（high≥open/close、low≤open/close、volume≥0）、已知缺根白名单。以"全量数据"为回归基线，缺根从"已知"转为"必须为 0"。
- **L2 真实进程 API/WS（pytest）**：新增 `backend/tests/test_live_api.py` 与 `backend/tests/test_live_ws.py`。conftest 提供 `live_server` fixture：用 `MD_DATA_DIR=<tmp>` 环境变量拉起真实 uvicorn（临时目录 + 种子 parquet），httpx 直连 HTTP，websockets 直连 WS。覆盖 33 端点成功/错误路径 + WS 全通道（candle/ticker/book/trade/mark/funding）与动态订阅/退订。
- **L3 浏览器用户旅程（Playwright）**：将 `frontend/scripts/diagnose-kline-realtime.mjs` 升级为 `@playwright/test` 套件（`frontend/tests/e2e/*.spec.ts`），复用既有 `window.__kline_chart__` 观测句柄；`playwright.config.ts` 的 webServer 自动拉起 vite dev + 后端。覆盖用户旅程：切 symbol/周期、下 paper 订单、创建/删除告警、右侧面板数据可见。
- **离线优先，在线可选**：外部上游（Bitget 公开行情、BlockBeats）默认以本地缓存/种子数据/monkeypatch 提供；提供 `--live` 标记的测试组在真实网络可用时跑真实数据，网络不可达则自动 skip。CI/离线环境永不因外部依赖失败。
- **测试基建**：`backend/tests/conftest.py` 增加 `tmp_settings`、`seed_store`、`live_server` fixtures；`frontend/package.json` 增加 `test:e2e` 脚本；`playwright.config.ts` 指定端口与 webServer。

## Capabilities

### New Capabilities
- `e2e-data-integrity`: 全量 parquet 数据质量门禁——枚举全部 series，校验时间戳单调、无重复、OHLC 合法、边界对齐、缺根归零。
- `e2e-live-api`: 真实 uvicorn 进程上的全端点 HTTP 测试——成功路径与错误路径，含参数校验、series 路由、交易/告警/配置的 CRUD。
- `e2e-live-ws`: 真实 `/ws` 通道全量验证——candle/ticker/book/trade/mark/funding 订阅与推送、动态订阅/退订、快照语义。
- `e2e-browser-journeys`: Playwright 浏览器全流程用户旅程——符号/周期切换、下单、告警 CRUD、面板数据可见性，端到端真实渲染。

### Modified Capabilities
- 无（本 change 不改动既有产品行为；`e2e-playwright-diagnostics` 的裸脚本被 `@playwright/test` 套件取代，其能力由 `e2e-browser-journeys` 承接并扩展）。

## Impact

- **新增测试文件**：`backend/tests/test_data_integrity.py`、`test_live_api.py`、`test_live_ws.py`；`frontend/tests/e2e/*.spec.ts`；`backend/tests/conftest.py` 扩展 fixtures；`frontend/playwright.config.ts`。
- **新增依赖**：`@playwright/test`（frontend devDependency）；pytest 侧无需新增（httpx/websockets/pandas 均已存在）。
- **产品代码改动**：预期极少。L3 可能需要为关键交互元素补少量稳定选择器（`data-testid`）；若种子数据无法满足 `/ws` 实时推送，可能需要允许 fixture 注入假 stream 的测试开关——此决策留待 design.md 论证，不在本 change 强行改动生产路径。
- **运行前置**：L1 需要 `backend/data/parquet` 存在（默认就有）；L2/L3 需要 `frontend/node_modules` 与 Playwright chromium；L3 浏览器套件需要后端可访问 Bitget（或离线 mock）。
- **不影响**：现有 243 后端 + 239 前端测试的断言与运行方式；REST 历史/回填/指标链路；交易为 paper-only。
