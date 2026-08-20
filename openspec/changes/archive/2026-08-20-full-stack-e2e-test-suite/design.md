# Design: 全流程 E2E 测试体系

## 目标架构

三层金字塔，每层独立可跑，自底向上互为前置条件：

```
┌────────────────────────────────────────────────────────────┐
│ L3  Browser Journeys  (frontend/tests/e2e, @playwright/test)│
│     用户旅程: 切符号/周期 · paper下单 · 告警CRUD · 面板数据   │
│     运行: npx playwright test   （webServer 拉起 vite+后端） │
├────────────────────────────────────────────────────────────┤
│ L2  Live API / WS  (backend/tests/test_live_*.py, pytest)   │
│     fixture 拉起真实 uvicorn(MD_DATA_DIR=tmp+种子parquet)   │
│     httpx→HTTP 33端点 · websockets→/ws 全通道               │
│     运行: pytest -m "live"                                  │
├────────────────────────────────────────────────────────────┤
│ L1  Data Integrity  (backend/tests/test_data_integrity.py)  │
│     直读 parquet: 25 series 连续性/OHLC/边界/缺根白名单     │
│     运行: pytest -m "integrity"  (可离线, 默认全量)          │
└────────────────────────────────────────────────────────────┘
```

## 关键决策

### D1. Playwright 绑定：Node `@playwright/test`（而非 pytest-playwright）
- 理由：前端已有 `playwright@1.62.1` devDependency 与 chromium；`@playwright/test` 提供 fixtures、webServer 管理、trace/截图，与现有 vitest 生态同一语言，无需在 Python venv 引入浏览器绑定。
- pytest 侧不安装 playwright：L1/L2 全部用 httpx/websockets（均已存在）。
- 现有 `diagnose-kline-realtime.mjs` 的诊断能力（frame 采集、图表数据列对账）迁移为 `tests/e2e/kline-realtime.spec.ts`，保留 `window.__kline_chart__` 观测句柄作为只读断言接口。

### D2. 外部依赖：离线优先、在线可选
| 外部依赖 | 离线策略 | 在线策略（--live） |
|---|---|---|
| Bitget REST 历史 | 种子 parquet（fixture 预写入） | 真实 API |
| Bitget WS 实时 | 可注入的假 stream（若需）/ 或依赖 live_server 种子 + 无实时断言 | 真实行情 |
| BlockBeats | 本地缓存文件（已有 blockbeats_cache 机制） | 真实接口 |
| LLM provider | `RuleBasedProvider`（确定性，已存在） | 真实 provider |

- 实现：pytest 用 marker `live` 分组；`conftest.py` 检测网络可达性（`/health` + 一次外部探测），不可达时 `skipif` 实时用例。Playwright 侧用 `test.skip` 条件或在 webServer 启动时探测。
- 默认离线运行必须全绿，在线是可选增强，不构成 CI 门禁。

### D3. live_server fixture（真实 uvicorn 进程）
```
MD_DATA_DIR=<tmp>/data          # 隔离数据目录
MD_SCHEDULE_INTERVAL_SECONDS=0  # 关闭增量落盘定时器，避免测试干扰
+ seed: 用 ParquetStore 把 fixture 生成的 5 series × 若干行写入 tmp
→ subprocess.Popen([sys.executable, "-m", "uvicorn", "market_data.webapi:create_app", "--factory", ...])
→ 轮询 /health 就绪（timeout 15s）
→ yield base_url
→ 终止进程（SIGTERM + 等待 + SIGKILL fallback）
```
- 端口：固定 0（ephemeral）会拿到真实端口，但 vite proxy 固定 8000。L2 直接连真实端口；L3 的 webServer 统一用 8000。两者通过不同 fixture/配置并存。
- 种子数据写入：直接调用 `ParquetStore.save`（不走 ingest API），保证确定性；生成含 gap 与完整两段，供连续性断言复用。

### D4. 数据完整性断言集（L1）—— 缺口三层分类
对每个 series（枚举 `data/parquet/*/*/*`），数值断言全部硬性：
1. `open_time` 严格递增、无重复（`diff<=0` 即失败）。
2. OHLC 合法：`high >= max(open,close)`，`low <= min(open,close)`，`volume >= 0`，均为有限值。
3. 相邻 bar 间隔 = timeframe step（`open_time[i+1]-open_time[i] == step_ms`），允许首尾截断。

间隔缺口按类型分层处理（2026-08-20 全量侦察实证）：

| 类型 | 定义 | 判定 | 实证（25 series 共 46 gap） |
|---|---|---|---|
| A 结构性缺失 | 连续缺失 ≥ 固定步数（如 ≥5 步），属历史未拉取 | **豁免登记**到 `STRUCTURAL_EXEMPTIONS[series]`，不算缺陷 | 1h 缺 2019→2023、2023→2026；1m 缺 05-31→06-26 等 |
| B 微缺口 | 缺失 1~2 步（单点/双点缺根） | **硬性断言**：白名单之外的 B 类即失败 | 1m 的 13:25→13:27 等 ~20 处；1h 的 08-06 单点 |
| C 数据停滞 | latest 距 now > 2*step | 在线子集断言（离线 skip） | 全部 series（后端关闭所致） |

- 白名单 `KNOWN_GAPS[series]` 只登记 B 类微缺口；A 类走 `STRUCTURAL_EXEMPTIONS`（按区间登记，允许整段空白）。
- 白名单随数据修复逐步清空；A 类豁免**永不自动清空**（属数据工程范围，不在测试体系内回填）。
- 数值断言（1/2）与 B 类硬门禁构成"目标门禁"：任何新增缺根/乱序/非法 OHLC 立即失败。
- 输出：失败时打印缺失间隔明细（起止时间 + 步数）便于定位。

### D5. WS 通道测试（L2）
- 直接复用 `websockets` 客户端连接 `ws://127.0.0.1:{port}/ws`。
- 测试矩阵：
  | 通道 | 订阅 op | 断言 |
  |---|---|---|
  | candle | `{op:"subscribe", args:[{channel:"candle", symbol, timeframe, category}]}` | 首帧快照含 `last_candle`；后续 event 帧含 `last_candle` 且 open_time 单调 |
  | ticker | `ticker` | 收到 `{type:"ticker", data:{symbol}}` |
  | book | `books` | 快照含 asks/bids 数组 |
  | trade | `trade` | 收到成交帧 |
  | mark/funding | `mark-price`/`funding-rate` | 收到镜像帧 |
- 动态订阅/退订：subscribe 新 symbol → 收到其帧；unsubscribe → 不再收到该 symbol 帧。
- 由于种子 stream 可能无真实推送，WS 用例默认依赖 live_server + 允许注入的假 stream。**D6 决定如何注入。**

### D6. 假 stream 注入（如需）
- 现有 `create_app` 已支持 `stream=` 与 `market=` 注入（`webapi.py` 的 create_app 签名）。L2 WS 用例直接 `create_app(settings, stream=FakeStream(), market=FakeMarket())` 走 TestClient 已覆盖；真实进程场景则用真实 stream（连不上 Bitget 时 WS 无推送）。
- 结论：**真实进程 WS 用例聚焦"连接建立、订阅协议、快照/错误语义"**，实时推送正确性由现有 TestClient 层（可注入假 stream）保证。真实推送冒烟放 `--live` 在线子集。这样 L2 离线也能稳定跑通协议层。

### D7. 浏览器 E2E 稳定性
- 统一 `data-testid`：为关键交互元素（symbol 搜索、周期按钮、下单按钮、告警表单、tab 关闭）补稳定定位器，避免依赖视觉文本（i18n 影响）。
- 配置 `playwright.config.ts`：`testDir: tests/e2e`，`webServer` 数组（vite dev + uvicorn），`reuseExistingServer`，chromium only，trace `on-first-retry`，screenshot `only-on-failure`。
- 用户旅程清单（L3）：
  1. 启动 → 默认 chart tab 渲染 K 线 → `window.__kline_chart__.getDataList()` 非空。
  2. 切换 symbol（搜索框输入 BTCUSDT→ETHUSDT）→ chart 标题与数据列变化。
  3. 切换 timeframe（1h→15m）→ 数据列周期变化。
  4. 新建 tab（Markets/Screener/Dashboard）→ 视图切换。
  5. 打开 OrderModal 下 paper 单 → 确认 → portfolio 出现仓位。
  6. CreateAlertModal 创建告警 → AlertsPanel 列表出现 → 删除。
  7. 右侧面板 OrderBook/TradesTape/News 显示数据。
- 每 spec 独立 `test.describe.configure({ mode: 'serial' })` 避免共享状态竞态；数据变更用例（订单/告警）用独立 storage state 或清理钩子。

## 风险与缓解
| 风险 | 缓解 |
|---|---|
| 真实 uvicorn 进程不稳定（端口冲突/启动慢） | ephemeral 端口 + 15s 就绪轮询 + 进程清理钩子 |
| Playwright 浏览器在 CI/无头环境缺依赖 | 仅 chromium + `npx playwright install chromium`；文档记录 |
| WS 无真实推送导致 L2 空转 | D6 拆分协议层（离线稳定）+ 实时冒烟（在线可选） |
| 全量数据断言误报（历史残留缺根） | KNOWN_GAPS 白名单机制，缺陷登记而非整体失败 |
| 外部网络抖动影响 --live 子集 | 探测 + skipif，在线不算门禁 |

## 实测验证（2026-08-20 侦察）

### V1. L2 真实进程 API 探针（隔离 uvicorn + 种子 parquet）
- 拉起/就绪/清理全流程成立：`MD_DATA_DIR=<tmp>` + `MD_SCHEDULE_INTERVAL_SECONDS=0` + `MD_LOG_LEVEL=WARNING`，ephemeral 端口，`/health` 轮询就绪，SIGTERM 清理。
- **关键发现（测试预期需按实际行为写）**：
  - 非法 timeframe / 非法 category → **200 + 空数据**，而非 400（`/candles` 对未知 series 宽容）。错误路径断言须据此设计。
  - `/candles/recent` 无 stream buffer 时自动走 REST seed（真实网络），SOLUSDT 等未驻留 series 也能返回数据——离线场景需 mock 此路径。
  - `DELETE /alerts/{id}` 对不存在 id → **405**，路由层先于业务校验返回（测试需区分 404/405 语义）。
  - `/tickers` `/instruments` 依赖真实上游；离线时需 stub。
  - `/order` token 流在真实进程可用（paper），`/portfolio` roundtrip 成立。
  - `/blockbeats/*` 离线走本地缓存（已 warm 或 seed），返回结构稳定。

### V2. L3 浏览器选择器现状
- 已有 `data-testid`：`chart-context-menu`、`menu-add-price-line`、`menu-set-alert`、`price-line-settings-modal`、`indicator-card`。
- **缺失稳定定位器**（需补 `data-testid`）：
  - symbol 搜索框（klinecharts-pro 内嵌搜索，需确认暴露方式或包裹层）
  - 周期栏（klinecharts-pro 内嵌 period bar，诊断脚本用 class `.item.period.selected` 定位——脆弱）
  - OrderModal：`Place {side} Order` 提交按钮（文本含 i18n/动态价格）、BUY/SELL 切换、价格/杠杆输入
  - CreateAlertModal：条件/目标价/频率控件、保存按钮
  - tab 关闭按钮（DesktopTitleBar）、AlertsPanel 列表项与删除按钮
  - RightDock 面板容器（OrderBook/TradesTape/News）
- 结论：L3 需要为 6-8 个关键组件补 `data-testid`（产品代码小幅改动），klinecharts-pro 内嵌 UI 用类名/包裹层回退策略。

## 验证路径
1. `cd backend && pytest -m "integrity"` —— L1 全量数据绿。
2. `cd backend && pytest -m "live"` —— L2 真实进程绿（离线）。
3. `cd frontend && npx playwright test` —— L3 浏览器旅程绿。
4. `pytest -m "integrity or live"` + `vitest run` + `tsc --noEmit` 全量回归无破坏。
5. 已知缺根经数据修复后，白名单条目逐条移除。
