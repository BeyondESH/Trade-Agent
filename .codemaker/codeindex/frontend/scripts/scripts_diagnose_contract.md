---
type: "Fragment"
id: frontend/scripts/diagnose_contract
title: "实时K线乱序诊断脚本 / 与被诊断方的观测契约"
description: "诊断脚本能读到真实渲染数据，依赖哪些生产侧契约？改这些契约会不会同时打断取证？"
parent: /frontend/scripts/_overview.md
fragment: diagnose_contract
entity_names:
  constants:
    - name: window.__kline_chart__
      source: frontend/src/components/chart/KLineChartProView.tsx
      value: "只读诊断句柄，值为 `pro.getChart()` 的 Chart 实例（挂载完成时赋值，供 `getDataList()` 读取真实数据列）；赋值处无对称的清理置 null，重复挂载会覆盖为最新实例"
    - name: 就绪判据
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "`!!window.__kline_chart__`（goto 后）→ `c.getDataList().length > 0`（runTimeframe 内），后者隐含「已挂载 + 历史已渲染」两件事"
    - name: 周期条选择器（读）
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '`.klinecharts-pro-period-bar span.item.period.selected` → `textContent.trim()` 即当前显示周期，与 vendored period-bar 的 `class={`item period ${p.text === props.period.text ? "selected" : ""}`}` 同源'
    - name: 周期条选择器（点）
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "`.klinecharts-pro-period-bar span.item.period` + `filter({ hasText: RegExp('^' + timeframe + '$') })`；匹配 `expand`/pin 项时以正则锚点规避，切换失败**只 warn 不失败**"
    - name: WS 帧过滤条件
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '`obj.channel === "candle" && obj.data && obj.data.last_candle`；非 JSON 帧静默 return（不抛），故后端换协议编码会使脚本静默采到 0 帧而不是报错'
    - name: "/ws 帧 series 标识（契约面）"
      source: backend/src/market_data/webapi.py（受 openspec/specs/ws-series-routing 约束）
      value: "`category` + `symbol` + `timeframe` + `action`（`snapshot` 先于 `update`）；脚本对这四元组全部落日志，`action` 仅记录不参与判定"
    - name: "/candles/recent 探针 URL 形态"
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '`{BASE}/api/candles/recent?symbol=&timeframe=&category=` —— `/api` 前缀由 vite 代理 rewrite 掉，真实端点无 `/api`（`backend webapi.candles_recent`，`category` 默认即 `USDT-FUTURES`、`limit` 默认 200）'
    - name: 端口来源（与后端保持一致）
      source: frontend/vite.config.ts
      value: "代理目标 `http://127.0.0.1:${E2E_BACKEND_PORT ?? 8000}` / `ws://…`；诊断脚本不提供改后端端口的参数，改 `E2E_BACKEND_PORT` 时必须同步改 vite 启动环境"
    - name: "命令入口 diagnose:kline"
      source: frontend/package.json
      value: '`node scripts/diagnose-kline-realtime.mjs`；与 `test:e2e`（`playwright test`，testDir `./tests/e2e`）互不包含'
    - name: 证据目录忽略规则
      source: frontend/.gitignore
      value: "`e2e-results/`、`test-results/` 已忽略；诊断产物属临时证据，禁止纳入版本库"
retrieval_hints:
  - "要让端到端脚本读到图表真实数据，生产组件必须暴露什么？能删掉吗？"
  - "为什么 vendored klinecharts-pro 的类名/图表句柄变了，会连带打断实时保序取证？"
  - "实时 candle 帧的 series 标识与 `action` 字段是谁规定的，前端投递前的单调性防护又归谁管？"
  - "⚠️ 如果你要找的是**诊断结论怎么算（REPLACE/APPEND/STALE、退出码、证据内容）**，不在这里——看同目录 `scripts_kline_realtime_diagnose.md`；本文只记脚本与生产代码之间的耦合契约。"
  - "⚠️ 如果你要找的是**后端 `/ws` 保序水位的实现**（`candle_sent_open_time`：单个连接作用域内、按 `(category,symbol,timeframe)` 分键的水位字典）、周期快照剥离 `last_candle`），不在这里——在 `backend/src/market_data/webapi.py`，规则见 `openspec/specs/realtime-candle-push` 与 `kline-realtime-order-guard`。"
  - "⚠️ 如果你要找的是**前端订阅路由与投递前丢弃 stale 帧的实现**，不在这里——在 `frontend/src/api/bitgetWs.ts:BitgetWsClient.deliver`，本模块只观测它。"
  - "架构归属：任何新的端到端可观测句柄（性能探针、渲染计数等）都应挂在与 `__kline_chart__` 相同的 `onReady` 链路上并保持只读，禁止为此新增组件 props 或改变渲染路径。"
  - "本模块也叫『诊断脚本观测契约 / e2e 可观测句柄』，对应 tasks 中的「图表数据列可观测」条目"
architectural_role: "跨层观测契约层 · 只读句柄 + DOM 选择器 + 帧字段三者的隐式接口，改动必须双向同步"
---

## 业务意图（解决什么问题）

诊断脚本本身不含业务规则；它的全部价值挂在**它对生产系统的三处观测权**上：图表实例的只读句柄、vendored 周期条的 DOM 类名、`/ws` candle 帧的字段结构。这三处都不是显式接口（没有 IDL、没有类型约束、也没有单测钉住），一旦生产侧重构就会让取证「静默失效」——脚本要么超时崩掉（句柄丢失），要么按错误的周期判读（选择器漂移），要么采到 0 帧却报「未收到实时数据」（帧字段/编码变化）。本小节把这些隐式契约显式化，目的正是：**改生产 UI/协议的人能提前知道自己会打断谁**，以及新增诊断维度该走哪条既有扩展点。
（来源: `openspec/changes/archive/2026-08-20-diagnose-kline-realtime-order/design.md` Decision 3 与风险项「`window` 上暴露图表句柄的安全/污染顾虑」）

## 对外接口（隐式契约清单）

| 契约 | 方向 | 关键字段/选择器 | 业务说明 | 锚点符号 |
|------|------|----------------|---------|---------|
| 图表只读句柄 | 生产组件 → 诊断方 | `window.__kline_chart__`、`getDataList(): {timestamp,open,high,low,close,volume}[]` | 让「真实渲染数据」可断言，从而脱离 mock；规格要求它是**只读用途**且「不改变渲染结果与交互行为」 | `frontend/src/components/chart/KLineChartProView.tsx`（`onReady` 链路内赋值处） |
| 周期条可定位性 | 诊断方 → vendored 组件 DOM | `.klinecharts-pro-period-bar span.item.period[.selected]` | 诊断脚本唯一能读到「当前显示周期」的途径——pro chart 的 period 状态**不暴露在 klinecharts Chart 实例上**，只能走 DOM | `frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx` |
| `/ws` candle 帧结构 | 后端 → 诊断方 | `channel/category/symbol/timeframe/action/data.last_candle{open_time,close}` | 帧日志四元组 + `open_time` 是 REPLACE/APPEND/STALE 对账的输入；`open_time` 必须是与图表 `timestamp` 同源的**桶开盘 UTC 毫秒** | `backend/src/market_data/webapi.py`（candle 通道）；规则见 `openspec/specs/ws-series-routing` |
| 前置健康探针 | 诊断方 → 后端（经 vite） | `GET /api/candles/recent?symbol&timeframe&category` → `{candles: []}` | 一次性确认「vite + uvicorn + 该 series 有历史」；缺失即明确报错退出，禁止静默通过 | `backend/src/market_data/webapi.py:candles_recent` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `frontend/src`（图表组件） | 读真实数据列，是唯一「渲染侧」判据来源 | `window.__kline_chart__` / `getDataList` | extracted |
| `frontend/src`（WS 客户端） | 被观测对象：投递前单调性防护决定了「列仍合法但帧到过」这类结论的解释方式 | `BitgetWsClient.deliver` | extracted |
| `frontend/vendor`（klinecharts-pro） | 周期切换与 `updateData` 语义（等于尾部→替换、大于尾部→追加）是判据的成因模型 | `period-bar` 类名、`chart.updateData` | extracted |
| `backend/src`（webapi） | 帧生产与 `/candles/recent` 探针；后端水位保序与脚本判读互为因果 | `candles_recent`、`/ws` candle 通道 | extracted |
| `openspec/specs`（契约文档） | 三分类语义、句柄只读性、结论可区分性、证据留存，均由规格钉住 | `e2e-playwright-diagnostics`、`kline-realtime-order-guard`、`realtime-candle-push`、`ws-series-routing` | extracted |

反向依赖（谁依赖本模块的契约）：

| 调用方 | 场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/tests/e2e/kline-realtime.spec.ts` | 套件版断言复用**同一个** `__kline_chart__` 句柄读取列并校验升序/帧不回退 | `window.__kline_chart__` |
| `frontend/src/components/chart/KLineChartProView.test.tsx` | 单测显式断言「图表就绪后句柄可取得数据列」，即句柄是被测试钉住的契约 | `__kline_chart__` 用例 |
| 保序修复的验收流程（归档 tasks 2.1/2.2/7.1） | 「补充单测断言句柄可取得数据列」「重跑诊断确认 STALE=0」 | 同上 |

## 典型调用链（契约破坏的传播路径）

```
生产侧重命名图表句柄（KLineChartProView 的 onReady 赋值处）        ← 跨模块：frontend/src
  → window.__kline_chart__ 永不存在
    → diagnose-kline-realtime.mjs:main 的 waitForFunction 超时（30s）→ 未捕获异常 → process.exit(2)
    → 同一失败同时命中 frontend/tests/e2e/kline-realtime.spec.ts + KLineChartProView.test.tsx   ← 三处联动
vendored period-bar 的 `item period selected` 类名重构              ← 跨模块：frontend/vendor
  → 脚本读不到 selected → 直接跳过点击分支（selected 为 null 时不告警）
    → 按「显示中的旧周期」采集与对账 → 报告的是错周期的结论（静默假通过）
后端把 open_time 单位改成秒 / 帧改成非 JSON 文本                    ← 跨模块：backend/src
  → 全部帧被过滤掉（JSON.parse 异常被 return 吞）→ verdict = NO_REALTIME_DATA，误指向「实时链路没数据」
```

## 实现约束清单

### 必须遵守的边界（可做什么 / 禁止什么）

| 约束 | 说明 | 由来 |
|------|------|------|
| ✅ 只读观测 | 允许：读数据列、读 DOM、被动收 WS 帧、切周期（点击既有按钮）| 规格「该可观测句柄 SHALL 为只读用途，不得改变生产渲染行为」（`openspec/specs/e2e-playwright-diagnostics/spec.md`「图表数据列可观测」） |
| ❌ 禁止注入/改写图表 | 不得 `chart.applyNewData` / 直接 `updateData` / 改 `getDataList` 返回值来「制造干净基线」 | 那样诊断就变成自我实现：真实渲染列是唯一被验对象（—） |
| ❌ 禁止为诊断新增组件 props 或渲染分支 | 扩展观测只能走既有 `onReady` 链路挂只读全局句柄 | design Decision 3 明确弃用「加测试专用 props——会污染生产组件签名」 |
| ❌ 禁止进 CI / 常驻门禁 | 也不得把 `diagnose:kline` 挂进 `npm run test`、`typecheck` 或 CI 步骤 | 规格「脚本 SHALL 可在本地按需运行，不作为常驻 CI 门禁」+ `.github/workflows/ci.yml` 明示 Playwright E2E 不进 CI（需真实行情与外网，结果非确定） |
| ❌ 禁止升级/ fork vendored klinecharts-pro 以「配合诊断」 | 其 `updateData` 语义是既定约束，判据要适应它 | design Non-Goals（—） |
| ⚠️ 句柄的生产可见性 | 若出于顾虑要在生产构建里剔除句柄，必须同时提供诊断可达的替代读法，否则端到端保序断言（脚本 + 套件）全废 | design 风险项「如需可在生产构建下省略，或接受其等价于既有 devtools 可达性」 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 数据列怎么读 | 复用 `onReady` 挂全局只读句柄 | 解析 canvas 像素反推 OHLC；给组件加测试 props | 零侵入（实例本就在回调里可得），且像素法拿不到 `timestamp`（来源: `design.md` Decision 3） |
| 当前周期怎么知道 | 读周期条 DOM 的 `selected` 类名 | 从 Chart 实例读 period | pro chart 的 period 状态**不暴露在 klinecharts Chart 实例上**，DOM 是唯一途径，因此对 vendored 类名形成硬耦合（—） |
| 切换失败怎么办 | `console.warn` 后继续（不失败） | 直接判定失败退出 | 优先保证「至少产出一份真实链路取证」；代价是可能按旧周期判读，读结论时必须核对 stdout 有无该 warn |
| 保序责任的分层 | 后端不下发回退帧（正确性）+ 前端投递前丢弃（鲁棒性，纵深防御） | 只修一端 / 给帧加 `source` 字段让客户端自选 | 重连、代理缓冲都可能重排；把顺序责任外推给每个客户端是更差的契约（来源: `design.md` Decision 4/5） |
| 谁钉确定性规则 | vitest 确定性单测（stale 丢弃 / 水位前移 / 更旧快照被剥离） | 只靠端到端脚本 | 规则钉住后端到端脚本退化为「回归确认 + 现场取证」，不必长期维护（来源: `design.md` Decision 6、风险「Playwright 结果非确定性」） |

## 变更风险

- **三处联动失效**：动 `__kline_chart__` 会同时打断本脚本、`frontend/tests/e2e/kline-realtime.spec.ts`、`KLineChartProView.test.tsx` 的句柄用例——但**不会**打断任何业务渲染，因此极易被当作「无副作用的改名」，是最典型的静默破坏。
- **DOM 选择器漂移即假通过**：周期条类名（`item period` / `selected` / `klinecharts-pro-period-bar`）改动，脚本既不报错也不告警（`selected` 为 null 时直接跳过点击），却按旧周期完成对账，结论被当成目标周期——改动 vendored 工具条结构时必须同步核对这两个选择器。
- **帧字段/编码改动会被误读成「行情静默」**：脚本只认 `channel==="candle"` + `data.last_candle`，JSON 解析失败静默 `return`。后端调整帧形状（如把 `last_candle` 挪层、改成二进制/压缩帧）表现是 `NO_REALTIME_DATA`，容易把排查引向「Bitget 没推数据」而非协议漂移。
- **`/api` 前缀是代理产物**：探针 URL（含 `/api`）与 `candles_recent`（不含）不同形；改 vite 代理 rewrite 规则、或改 `E2E_BACKEND_PORT` 而不同步启动环境，会让脚本以 `[FATAL] Backend/vite not serving /candles/recent` 退出——该信息同时点了两个前置服务，勿拆成只提一个。
- **category 单值假设**：脚本硬编码 `SERIES_CATEGORY`，且 series 聚合键不含 category；一旦同时诊断 SPOT 与其它 category，计数会串行污染，此时应先扩键而不是先加币对。
