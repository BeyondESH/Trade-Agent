---
type: "Fragment"
id: "frontend/tests/e2e-journeys"
title: "浏览器端旅程测试 / 四大业务域旅程断言"
description: "K 线首屏必须真的画出柱子，怎么证？订单/告警/回测/参数扫描在浏览器里点一遍会不会打到真实账户？"
parent: /frontend/tests/_overview.md
fragment: e2e-journeys
architectural_role: "L3 浏览器用户旅程断言集（行情正确性 / 交易与告警闭环 / 派生行情无空值 / QUANT LAB 长任务），行情终端数据可信红线的最后一道可执行门禁"
retrieval_hints:
  - "怎么证明 K 线首屏真的画出了柱子，而不是空图表？"
  - "下单、告警这些旅程会不会打到真实账户？"
  - "为什么 screener 断言里要 not.toContainText（NVIDIA Corp）？"
  - "告警自动触发那一条用例为什么不会因行情波动而 flaky？"
  - "QUANT LAB 的回测和参数扫描在 e2e 里怎么判定「跑完了」？"
  - "⚠️ 如果你找的是 /ws 订阅协议本身是否正确（快照帧/退订/非法参数），不在这里，在 backend/tests 的 test_live_ws.py"
  - "⚠️ 如果你找的是图表内部渲染、周期 pinned 或右栏宽度状态机的实现，不在这里，在 frontend/src"
  - "⚠️ 如果你找的是 parquet 级别的时间戳/OHLC 数据质量校验，不在这里，在 backend/tests 的 test_data_integrity.py"
  - "本文件对应需求中的「用户旅程 / 浏览器回归 / QUANT LAB 走查 / 图表实时性验收」"
  - "新增的用户旅程断言写进对应 spec 文件（图表时序 / 写状态闭环 / 只读面板 / QUANT LAB），不可新建独立测试文件"
entity_names:
  constants:
    - name: 15m步长
      value: "900_000 ms（相邻 bar 时间戳差的硬断言）"
      source: frontend/tests/e2e/kline-realtime.spec.ts
    - name: 首屏最少 bar 数
      value: "> 10"
      source: frontend/tests/e2e/kline-realtime.spec.ts
    - name: 实时帧最少条数
      value: ">= 2（poll ≤30s，观测约 6s 静默期）"
      source: frontend/tests/e2e/kline-realtime.spec.ts
    - name: QUANT_LAB_TIMEOUT
      value: "回测自动切换 60_000ms / 出图 30_000ms / 扫描热力图 30_000ms"
      source: frontend/tests/e2e/quant-lab.spec.ts
    - name: DEFAULT_SYMBOL
      value: "BTCUSDT（旅程隐式依赖：下单用默认市场、告警种子绑定该 symbol）"
      source: frontend/src/App.tsx（`DEFAULT_SYMBOL.id/ticker = "BTCUSDT"`；本模块在告警种子里以字面量硬编码）
    - name: 下单数量
      value: "0.01（小额以保证后端风控批准 paper 成交）"
      source: frontend/tests/e2e/user-journeys.spec.ts
    - name: 告警种子阈值
      value: "0.01 + condition=above + id=e2e-1（任意正价必触发，确定性）"
      source: frontend/tests/e2e/user-journeys.spec.ts
    - name: 右栏宽度契约
      value: "初始 280px；拖拽后 >280 且 ≤500；localStorage 值与 inline style 数值逐位相等"
      source: frontend/tests/e2e/panels.spec.ts
    - name: RETIRED_MOCK
      value: '禁止再现的模板示例串："NVIDIA Corp" / "Strong Buy" / "New Pine Script Update" /「新的 Pine 脚本更新」'
      source: frontend/tests/e2e/panels.spec.ts
    - name: QUANT_LAB_TABS
      value: "曲线分析 / 信号K线 / 参数扫描 / Walk-forward / 因子IC / 模型诊断 / 开单明细（spec 断言其中 6 个）"
      source: frontend/src/components/views/AgentView.tsx + 后端 dl_service
---

## 本子模块解决的业务问题

四层单元测试都能绿，但**没有一层能回答「用户在屏幕上看到的是不是真数据」**。这 4 个 spec 用真实浏览器 + 真实前后端把四个最容易被悄悄造假的业务面钉住：

| 文件 | 覆盖场景 | 断言的具体用户结果 | 为什么不能下沉到 L1/L2 或 vitest |
|------|---------|-------------------|--------------------------------|
| `kline-realtime.spec.ts` | 首屏出图 / 周期切换 / 实时帧有序 | 数据列 >10 根且时间戳严格递增；切到 15m 后相邻 bar 差恰为 900000ms；`/ws` candle 帧 `last_candle.open_time` 单调不倒退 | 时序是否被画进图表、快照 5s 与成交驱动事件是否把图表时间轴搅乱，只有真浏览器 + 真 WS 能观测 |
| `user-journeys.spec.ts` | 多 tab 生命周期 / paper 下单 / 告警 CRUD / kill switch / reset funds / 告警真实价格触发 | 建 tab 后 ≥4 个 tab、关闭后 `tab-close-*` 消失；下单弹窗提交后自动关闭（说明校验+确认成交+回执都过）；告警写→面板可见（= 本地 store `raibro.alerts` + 面板回读链路成立）→删→清空；halt 后出现 `kill-switch-state` 红色胶囊（文案取 i18n 「交易已停止」，见 `src/lib/i18n.ts`），再点同一个 `kill-switch-toggle` 即恢复（断胶囊消失而不是断文案）；reset 后余额字符与初始值全等 | 跨 REST/WS/localStorage/弹窗状态机，且告警触发靠前端把共享实时 ticker map 喂给 `alertsStore.evalAlert` 做阈值比较（命中后本地置 `triggered` + 镜像回后端 + toast），阈值/实时价/镜像任一环断掉都不会被 L1/L2 发觉 |
| `panels.spec.ts` | 行情/新闻/筛选器/通知等只读派生面板 | 盘口有「订单簿/价差」表头；`funding` 与 `mark price` 行可见且**不为空串**（有值或"当前合约暂无数据"占位）；news 面板 innerText 非空；screener 出现「资金费率 / 标记价 / 24h 振幅」三列且**永不含模板 mock 串 (NVIDIA Corp / Strong Buy)**；右栏拖拽变宽 + 刷新后宽度与持久值完全一致；通知下拉里 Pine 示例条目不得复活 | jsdom 会 stub 掉 ResizeObserver/localStorage 持久化/真实 WS 供给，只能证明组件存在，证明不了「数据不是 mock」 |
| `quant-lab.spec.ts` | AI Agent → QUANT LAB 回测与参数扫描 | 6 个 TabList tab 存在；回测在 60s 内让「信号K线」变 `data-state="active"`（用自动切 tab 当后台任务完成信号）并出图；扫描后出现热力图且热力单元含「%」 | 回测/扫描是分钟级后台任务，其「完成」信号本身就是 UI 状态迁移，只有真实订阅 + 真实后端跑通才能验证 |

## 对外接口

本子模块无协议/RPC/事件接口（纯测试断言集）。它对外表达的是**产品红线的可执行版本**，改动前端展示逻辑前应对照下表确认哪些断言会因此失败：

| 被钉住的行为 | 断言点 | 失败意味着 |
|-------------|--------|-----------|
| 图表内存数据列时间序列升序无重复 | `chart timestamps are strictly ascending` → 逐对 `>` | 出现回退/重复 bar：图表时间轴错乱（历史上真实发生过） |
| 周期切换生效 | `step == 900_000` | 周期栏点击没换 timeframe，或 datafeed 回填仍是旧周期 |
| 实时不乱序 | 帧 `open_time >= 前一帧`（≥ 允许 REPLACE） | 快照/事件竞态使旧帧追加成新柱——用户看到「未来价格回跳」 |
| 无陈旧/示例数据 | `.not.toContainText(...)` 反断言链 | 任何一处 mock 数据回归即视为不可信，比「少一行数据」更严重 |
| 派生行情不留白 | `orderbook-funding`/`mark-price` visible + `not.toHaveText("")` | 显示空白 = 用户误判「有行情但值为空」，违反「有值或明确占位」口径 |
| 下单安全 | paper 弹窗自然关闭（不点任何真钱按钮） | 一旦旅程被迫引入 live 路径，即破坏「默认 paper-only」硬约束 |

## 典型调用链

### 实时 K 线不乱序（L3 侧）
```
page.on("websocket") 注册 → page.goto("/")            ← 必须在导航前挂 listener
  → frontend/src 建立 /ws candle 订阅 → backend/src webapi 推送帧
    → 每帧取 data.last_candle.open_time 入内存帧序
      → waitForChartData(window.__kline_chart__.getDataList()) → 帧序两两比较不倒退
（与 frontend/scripts/diagnose-kline-realtime.mjs 的 REPLACE/APPEND/STALE 三态判定同口径）
```

### 告警在真实行情里自动触发
```
page.addInitScript 种 raibro.alerts(threshold=0.01, above, id=e2e-1)   ← 本模块契约：key/字段须与 src 一致
  → 应用启动后按 symbol 比对实时价 → 命中 → alert-triggered-e2e-1 高亮 + 触发时间戳
    → 点 alert-reset 清 triggered → 点 alert-delete 清残留（避免污染后续运行）
```

### 回测完成 = 自动切 tab
```
getByRole("tab","信号K线") 可见 → 点 Run Backtest
  → backend POST /api/backtest（真实量化引擎，默认参数含真实符号）
    → 前端完成回调自动 setActiveTab("signals")           ← 跨模块：frontend/src/AgentView
      → toHaveAttribute("data-state","active", timeout 60_000)
        → 断 canvas 出现（证明信号叠加渲染，不只是文字「无数据」）
```

## 实现约束清单（新增/修改旅程断言时核对）

- **新旅程必须放进 4 个既有业务域之一**（图表时序 → kline-realtime；写状态闭环 → user-journeys；只读派生面板 → panels；QUANT LAB → quant-lab），**不要新建第 5 个 spec**，否则要回头补 `_overview` 与配置。
- **只读断言不允许出现裸 `wait(1500)`**：图表类走 `waitForChartData`，行情类走 `waitFor({state:"visible"})`，时序类走 `expect.poll`。固定 sleep 只在等渲染稳定时用，不能作为断言前提。
- **QUANT LAB 等重任务用超时表达预期**，不用 sleep：历史 bug 就是固定等待先于结果导致假失败。
- **禁止为让用例变绿而加 mock / `test.skip`**：L3 的价值恰在于「不打桩」。若离线取不到真实值，改断言为「真实值 **或** 明确占位文案」，而不是塞假数据（来源: `openspec/specs/e2e-live-api` 的 skipif/降级惯例 + design.md D2 离线优先）。
- **写状态用例必须自带复位**：新建的告警/订单/preset/tab 要么前置清空、要么收尾删除；kill switch 用例**必须**在结束前再点一次 `kill-switch-toggle` 把 run control 恢复（spec 注释：ALWAYS before finishing，serial suite 后续下单用例依赖它）。
- **`DEFAULT_SYMBOL`(BTCUSDT) 以字面量硬编码**在告警种子里——改前端默认 symbol 时要同步这里，否则告警永远等不到触发。
- **文案断言的例外要显式说明原因**：panels 用「订单簿/价差/资金费率/暂无行情数据」正则、QUANT LAB 用 tab role 名「信号K线」等，因为它们无 testid；新增此类断言属高风险，优先回 `frontend/src` 补定位符。
- **`getDataList()` 断言依赖内存列**，切换 symbol 后旧列可能仍在——需要「新周期/新 symbol 的 bar 结构」而非「长度变了」。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键契约 | confidence |
|---------|---------|---------|------------|
| `frontend/src` | 所有 testid/id/文案/localStorage key/自动切 tab 行为 | `KLineChartProView`、`OrderModal`、`CreateAlertModal`/`AlertsView`、`TradingView`(kill switch/reset)、`RightDock`(resize)、`ScreenerTab`/`NewsView`/`Notifications`、`AgentView` QUANT LAB 六视图 | extracted |
| `backend/src` | 下单两阶段确认+风控、告警落盘、`/ws` candle 帧、回测与参数扫描任务 | `webapi` `/order``/order/confirm``/alerts``/portfolio``/control``/backtest`、dl_service 预设 | extracted |
| `frontend/vendor` | 周期栏 DOM 与 canvas 渲染来自 vendored klinecharts-pro | `.item.period`、`.klinecharts-container` | extracted |
| `frontend/scripts` | 同一实时有序判定的重型诊断版（多 series + 180s + STALE 高亮） | `diagnose-kline-realtime.mjs` | inferred |

## 边界（能做 / 禁止做）

- ✅ 可以断言：真实渲染的数据列、真实网络帧、真实后端落盘回读、UI 状态机迁移、宽度/余额字符串一致性。
- ✅ 可以为了确定性**注入本地状态**（addInitScript 种 localStorage），但注入的字段结构必须与生产解析器一致。
- ❌ 禁止触发真实资金路径：任何需要点击才能完成的动作都必须在 paper 范围内；不得为了「走通确认」放宽安全闸。本模块是「必须完成两阶段确认」这条安全闸在 UI 层的唯一回归。
- ❌ 禁止在本模块新增 mock/fixture 服务器：离线兜住真实链路的责任在后端 L1/L2。
- ❌ 禁止把「空面板」当通过：所有列表型断言要么有内容、要么有明确占位文案；`text.length > 0` 不能替代占位文案断言。
- ❌ **不要把「告警面板看到条目」当成「后端持久化成功」**：前端以 `localStorage` 的 `raibro.alerts` 为权威，`mirrorAlertUpdate` 写后端是 best-effort（`api.updateAlert(...).catch(() => {})` 静默失败），所以后端 `/alerts` 挂了这趟旅程依旧绿。验证后端告警落盘必须靠 L2（`backend/tests/test_live_api.py` 的 `/alerts` CRUD）。
- ❌ 禁止绕过 `getDataList()` 断长度来证明「切换成功」的时序假设（见约束清单）。

## 变更风险

- 前端把告警本地存储 key 改名 → `alert-item-e2e-1` 永不出现，用例表现为「稳定红灯」而非明确 error，容易被误判为行情问题。
- `runControl` 状态钩子（`kill-switch-toggle` / `kill-switch-state`）或 `TradingPanel.tsx` 的 tab id（当前为 `positions`）改名 → 运行控制旅程失效，**「halt 后必须能在同一个开关上恢复」这条安全契约从此无人看守**。当前断言不看 i18n 文案（中文为「交易已停止」），因此改名风险只在 data-testid/id 上。
- QUANT LAB「完成后自动切 tab」若被取消（改为只刷新曲线）→ 回测用例只能靠 `data-state` 消失判失败，无法验证「完成」语义。
- 后端把非法 timeframe / 未知 symbol 从「200 + 空」改成 400 → 前端图表首屏/回填路径可能整体不出图，本模块会以「数据列 ≤10 根」的形式炸出来——这类语义变更务必先看这里再改 L2 断言。

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-browser-journeys/spec.md`（旅程清单与降级口径已按实际实现校准）、`openspec/specs/e2e-playwright-diagnostics/spec.md`（只读句柄与有序判定）、`openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/{proposal,design}.md`（L3 定位与 D7 稳定性策略）。

## 设计决策（本层选型，避免下次自动实现选错）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 是否断言后端告警落盘 | 只断言本地 store（`raibro.alerts`）+ 面板回读 | 旅程内再校验后端 `/alerts` | 前端以本地 store 为权威、写后端是静默 best-effort（`mirrorAlertUpdate` → `api.updateAlert().catch(()=>{})`）。在 L3 硬断后端会把「本地可用、后端不可用」判成失败，而这属于 L2 的职责范围 |
| 告警触发如何做到确定性 | 种 threshold=0.01 / condition=above（任意正价必命中） | 设一个接近市价的阈值等行情穿越 | 行情驱动断言不得依赖波动，否则环境安静时静默变 flaky（口径来自 `kline-realtime.spec.ts` 关于固定采样窗口的注释与 design.md D2「离线优先」） |
| 图表正确性怎么断 | 只读 `window.__kline_chart__` 的数据列 + `/ws` 帧序 | 截图比对 / mock 渲染结果 | mock 会把 L3 退化成单测；截图对行情非确定性数据不可比 |
| 回测/扫描「完成」判定 | 用 UI 状态迁移（自动切到「信号K线」台）当完成信号，超时 60s | 轮询后端 job 状态或固定 sleep | 固定等待曾造成假失败；UI 迁移本就是用户可见的完成语义 |
