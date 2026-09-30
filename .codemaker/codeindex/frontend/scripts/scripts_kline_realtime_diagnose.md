---
type: "Fragment"
id: frontend/scripts/kline_realtime_diagnose
title: "实时K线乱序诊断脚本 / 采样对账与判读链"
description: "实时 K 线帧相对图表尾部是替换、追加还是乱序回退？跑哪条命令、要什么前置、怎么读结论？"
parent: /frontend/scripts/_overview.md
fragment: kline_realtime_diagnose
entity_names:
  constants:
    - name: DEFAULT_SYMBOL
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '"BTCUSDT"（硬编码，脚本不支持按参数换币对）'
    - name: SERIES_CATEGORY
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '"USDT-FUTURES"（前置探测与后端默认 category 一致；换 category 必须同时改这里）'
    - name: PORT / BASE
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '5173（默认，`--port` 可覆盖）→ BASE = `http://127.0.0.1:${PORT}`，即**必须打 vite dev 端口**而不是 8000'
    - name: TIMEFRAMES 默认值
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '"1h"；`--timeframes` 逗号分隔按序串行诊断，旧参数名 `--timeframe` 仍作为次级回退被接受'
    - name: WINDOW_SECONDS（`--window`）
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "30 秒/**每个周期**（不是总时长）；规格要求观测窗口不少于一个采样窗口，design 建议 ≥30s 以覆盖桶切换瞬间"
    - name: 数据列采样节奏
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "约 1000ms 一次（循环内 `waitForTimeout(1000)` 后再 `observe()`），故帧与快照的对账存在最多 ~1s 的时间量化误差"
    - name: 等待/点击超时三常量
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "数据列就绪 `waitForFunction` 30_000ms；`page.goto` 30_000ms；周期条 click 4_000ms，切换成功后再等 1_500ms 让新周期数据落地"
    - name: OUT_DIR（`--out`）
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: '默认 `join(ROOT, "e2e-results")`，ROOT = `frontend/`（脚本目录的上一级），即 `frontend/e2e-results`，已被 `frontend/.gitignore` 忽略'
    - name: verdict 四种结论
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "OK_ORDERED / NO_REALTIME_DATA（该周期 0 帧）/ STALE_OUT_OF_ORDER（该 series 累计 stale ≥1）/ SERIES_NOT_ASCENDING（数据列非严格升序或有重复）"
    - name: 进程退出码
      source: frontend/scripts/diagnose-kline-realtime.mjs
      value: "0=OK_ORDERED；1=任一 verdict 失败**或**前置探测 `[FATAL]` 失败；2=未捕获异常（含浏览器等待超时）"
retrieval_hints:
  - "实时 K 线出现重复或乱序的 bar，怎么端到端复现并定位是哪一帧造成的？"
  - "要验证前端 `bitgetWs` 的 `open_time` 单调性防护 / 后端 `/ws` 轮询保序是否真的生效，跑哪个命令？"
  - "诊断脚本输出的 REPLACE / APPEND / STALE 分别是什么意思，判定标准是什么？"
  - "脚本退出码 1 到底代表『乱序』还是『根本没收到实时数据』，怎么区分？"
  - "⚠️ 如果你找的是**常驻 Playwright E2E 套件**（`npm run test:e2e`、journey 断言、CI/失败重试），不在这里——在 `frontend/tests/e2e/*.spec.ts`（同名文件 `kline-realtime.spec.ts` 是套件版断言，非常驻诊断脚本）；本脚本是 bare script，只手工执行、不进 CI。"
  - "⚠️ 如果你要找的是**后端 `/ws` 帧本身怎么产生与保序**（水位记录、周期快照剥离 `last_candle`），不在这里——在 `backend/src/market_data/webapi.py`（受 `openspec/specs/kline-realtime-order-guard` 与 `realtime-candle-push` 约束）；本脚本只是观察者，不参与保序实现。"
  - "⚠️ 如果你找的是**历史缺口/回填**（向左翻页拉更早历史、深度回灌），不在这里——那是 `getHistoryKLineData`/`applyMoreData` 与 `backend/scripts/backfill_micro_gaps.py`，本脚本的判据明确不覆盖历史与回填路径。"
  - "本模块也叫『K 线实时乱序诊断 / realtime kline order diagnose』，对应规格中的「端到端实时 K 线诊断脚本」与 capability `e2e-playwright-diagnostics`"
  - "新增诊断判据（如多币对、帧到达节奏指纹、指标字段核对）必须扩写 `frontend/scripts/diagnose-kline-realtime.mjs`，禁止另建第二个诊断脚本或在 `frontend/scripts` 下新建被生产代码 import 的模块。"
architectural_role: "端到端诊断工具层 · 只读观测，禁止参与生产渲染与数据写入"
---

## 业务意图（解决什么问题）

实时 K 线的缺陷本质是**时序竞态**：同一 series 有事件驱动（~1s 节流）与周期快照（~5s 轮询）两条来源，谁后到是不确定的；而 `klinecharts` 的 `updateData(bar)` 只看 `bar.timestamp` 相对当前尾部是「相等→替换 / 更大→追加」，所以一个更旧但更晚到的帧会被当成新桶插进列尾，表现为图上重复/乱序 bar。逐层 mock 的单测都以人工顺序喂帧，永远复现不了这种交错。本脚本的业务价值因此不是「测代码逻辑」，而是**在真实浏览器 + 真实后端 + 真实行情下，把「有没有回退帧」变成可判定、可留证的结论**，从而把修复范围钉到正确的层（后端不下发回退帧 + 前端投递前单调性防护，双层纵深）。
（来源: `openspec/changes/archive/2026-08-20-diagnose-kline-realtime-order/proposal.md`「Why」、`design.md` Decision 1/2/6）

## 对外接口

本子模块无 HTTP/WS 服务端接口，契约面是**命令行与其输出**：

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `npm run diagnose:kline`（= `node scripts/diagnose-kline-realtime.mjs`，在 `frontend/` 下） | 开发者 → 浏览器/后端 | `--timeframes`（逗号分隔，别名 `--timeframe`）、`--window`（每周期秒数）、`--port`（vite 端口）、`--out`（证据目录） | 打开真实前端、订阅 `/ws`、按周期串行诊断并打印 verdict | `diagnose-kline-realtime.mjs:main` |
| `GET {BASE}/api/candles/recent?symbol=&timeframe=&category=` | 脚本 → vite 代理 → 后端 | 响应必须含数组字段 `candles` | 前置探测：证明「后端 + vite」都在且能出数据，否则 `[FATAL]` 退出 1（探测用**首个**周期） | `diagnose-kline-realtime.mjs:preflight` |
| `e2e-results/frames.json` | 脚本 → 磁盘 | `port/timeframes/windowSeconds/defaultSymbol/frames/snapshots/bySeries` | 全量帧日志 + 每次采样快照 + 每 series 的 replace/append/stale 计数，事后复核用 | `main`（写文件处） |
| `e2e-results/chart-<末周期>.png` | 脚本 → 磁盘 | 1280×800 视口截图 | 视觉证据（规格要求「至少一张图表截图」） | `main`（`page.screenshot`） |

## 典型调用链

### 诊断一个周期序列是否被实时帧破坏

```
npm run diagnose:kline → diagnose-kline-realtime.mjs:main           ← 本模块入口
  → preflight(firstTimeframe)  GET /api/candles/recent               ← 跨模块：frontend vite 代理 → backend/src/market_data/webapi.py
  → chromium.launch + page.on("websocket"){ framereceived → frames.push({t,category,symbol,timeframe,action,open_time,close}) }
      └ 仅收 obj.channel === "candle" && obj.data.last_candle 的帧    ← 跨模块：backend /ws candle 通道契约
  → page.goto(BASE) → waitForFunction(window.__kline_chart__ 就绪)   ← 跨模块：frontend/src/components/chart/KLineChartProView.tsx 只读句柄
  → runTimeframe(page, frames, snapshots, tf)                        ← 本模块：周期对齐 + 采样
      → 读 `.klinecharts-pro-period-bar span.item.period.selected`，与目标周期不符则点击对应项   ← 跨模块：frontend/vendor/klinecharts-pro 周期条 DOM
      → observe() 每 ~1s 记一次 {t, tailTimestamp, length, timestamps} = chart.getDataList() 的 timestamp 全列
  → main：按 series 对账 → tailAt(frame.t) 取「到达时刻 ≤ 帧时间」的最近快照尾部
      → open_time == tail → REPLACE ；> tail → APPEND ；< tail → STALE（并记 lastStale）
  → main：对**最后一个周期**的 timestamps 校验严格升序 + 统计重复数
  → 计算 verdict → 写 frames.json + chart-<末周期>.png → browser.close() → process.exit(ok ? 0 : 1)
```

### 判读要点

- `frames captured : 0` → 结论是 `NO_REALTIME_DATA`（行情静默/未订阅成功/后端没推），**不是**乱序；规格要求这两种失败必须可区分。
- `STALE = N` → 确凿的回退帧证据：帧的 `open_time` 小于当时的列尾 `timestamp`，即历史上那个「乱序 append」根因的形态；此时应先怀疑后端水位（`webapi.py` 的 `candle_sent_open_time`，每连接一份、按 `(category,symbol,timeframe)` 分键，退订时 `pop`）而不是图表侧。
- `strictly asc : true` 但有 `STALE` 也可能发生——前端单调性防护会在投递前丢掉回退帧，于是**列仍合法但帧到过**；这正是「后端顺序不保证、前端兜底」两层防御的期望形态，别把 true 误读成「后端没问题」。
- 归档实证记录显示：quiet 行情下 1m/1h 三窗口均为 WS 层已按序、STALE=0，乱序竞态是**潜在/非确定**的，只可能在桶切换瞬间或行情突增使轮询 `latest()` 滞后时触发 → 「跑绿」不等于「防护可以拆」。
（来源: `openspec/changes/archive/2026-08-20-diagnose-kline-realtime-order/design.md`「实证结论」表）

## 实现约束清单

> 改动本脚本或它验证的保序链路时逐条核对。

### 必须保持的判据常量/口径

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| REPLACE/APPEND/STALE 三分法 | `==` / `>` / `<` 尾部 `timestamp` | `diagnose-kline-realtime.mjs` | 等号=同桶刷新（正常）、大于=开新桶（正常）、小于=回退（**唯一硬失败判据**） | 规格逐条钉死该三分类语义，改判定方向即改契约（来源: `openspec/specs/e2e-playwright-diagnostics/spec.md`「帧与图表对账判定」） |
| `open_time` 与 `timestamp` 同源 | 桶开盘 **UTC 毫秒** | 同 `candleToKLine` | 二者必须同一单位；排查已确认 `open_time↔timestamp`、`1h↔1H`/`1mo↔1M` token 双向映射一致，单位错配是**已排除**的假设 | 若以后有人改 `candleToKLine` 的单位，本判据会静默错位（来源: `design.md` Context「已确认无关的因素」） |
| 严格升序 + 无重复 断言 | 取**最后一个周期**快照的 `timestamps` | 同上 | 逐元素 `>` 前一项，`===` 记为重复 | 规格「图表数据列始终为合法时间序列」（`kline-realtime-order-guard`） |
| series 聚合键 | `${symbol}/${timeframe}`（**不含 category**） | 同上 | 当前只诊断 USDT-FUTURES 一个 category，故等价；多 category 共存时会互相污染计数 | 规格要求保序按 `category:symbol:timeframe` 独立判定（`kline-realtime-order-guard`），脚本聚合键是其弱化版，扩多 category 前必须补上 |
| 前置探测必达 | 响应含数组 `candles` | `preflight` | 不满足即 `[FATAL]` + `process.exit(1)`，禁止改成 warn 后继续 | 规格「前置依赖缺失时明确报错…而非静默通过」 |
| 单页单视口 | viewport `1280×800`，一个 `page` | `main` | 串行遍历周期，共用同一条 `/ws` 连接与同一份 `frames[]` | 帧归属由帧自带 `timeframe` 决定，不依赖订阅顺序——改成并行会毁掉判读的周期归属 |

### 必须包含的协议字段（观测侧读取）

| 帧/响应 | 字段 | 说明 |
|--------|------|------|
| `/ws` candle 帧 | `channel`、`category`、`symbol`、`timeframe`、`action`、`data.last_candle.open_time`（并附带 `close` 备查） | 帧日志必须保留**到达时刻 `t`**，否则无法区分 ~1s 事件推送与 ~5s 周期快照的节奏（规格明列此要求） |
| `/api/candles/recent` | `candles`（数组） | 唯一前置健康探针；它同时是「后端已能为该周期出历史」的证据 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 是否引入 `@playwright/test` 套件 | bare script（直接 `import { chromium } from "playwright"`） | 建常驻 E2E 套件 | 根因未定位前先建套件属过早投资；套件版另由 `frontend/tests/e2e` 承担常规断言（来源: `design.md` Decision 1、`tasks.md` 1.1） |
| 判据形态 | 帧 ↔ 图表数据列「对账」 | 截图像素比对 | 像素只能看出「图坏了」，无法定位是哪一帧、哪条来源导致，对修复无指导价值（来源: `design.md` Decision 2 备选弃用理由） |
| 对账参照 | 取「到达时刻 ≤ 帧时间」的**最近**快照 | 用最终列或实时查询列 | 快照节奏 ~1s，取最近前置快照才能近似「帧到达那一刻的列尾」；用最终列会把所有正常 APPEND 误判成 STALE |
| 无帧场景的成败 | 记为**失败**（`ok=false` → exit 1），同时在文案上明确区别于乱序 | 视为「无法判定」跳过 | 规格要求结论「可区分」，design 风险表又希望「不把必须出现 tick 当硬失败」——现实现选择了保守口径：静默行情下不给你绿码。改成本地跳过前必须显式确认这一取舍 |
| 结果落盘 | `frames.json` + 截图，目录 gitignored | 只打印 stdout | 行情非确定，证据必须在事后仍可复核（规格「诊断证据留存」） |

## 跨模块依赖

> 实现本子文档功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `frontend/src` | 待观测方：只读图表句柄与投递前单调性守卫均住在应用层 | `window.__kline_chart__`、`bitgetWs.ts:BitgetWsClient.deliver` | extracted |
| `frontend/vendor` | 周期条 DOM 类名与时间格口来自 vendored 引擎，选择器契约属于 vendor | `klinecharts-pro/src/widget/period-bar`、预构建 `dist/klinecharts-pro.js` | extracted |
| `backend/src` | `/ws` candle 帧与 `/candles/recent` 前置探测的字段定义在后端 | `webapi.py` 的 `candle_sent_open_time` 水位与快照剔 `last_candle` 逻辑 | extracted |
| `frontend`（工程契约层） | 入口脚本名、dev server 代理与 Chromium 依赖均声明在 `frontend/package.json` / `vite.config.ts` | `diagnose:kline` | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/tests` | 实时保序回归：套件版断言与本脚本共用 `__kline_chart__` 句柄与升序口径，修实时链路时两处都要跑 | `e2e/kline-realtime.spec.ts` |
| `backend/src` / `frontend/src` | 作为观测结论的消费者：诊断输出的 STALE/REPLACE 用于定位前后端保序修复点 | 本模块不反向影响生产代码 |

## 变更风险

- **动判据 = 动验收口径**：把 `STALE → 失败` 弱化（例如只统计不计入 `ok`），会让后端水位回归（周期快照又下发更旧 `last_candle`）无人拦截；反之把「未收到实时数据」并入 `STALE_OUT_OF_ORDER`，会让人去修一个不存在的前端保序 bug——规格把「二者 SHALL 可区分」写成硬要求正是为此。
- **升序断言的覆盖面**：`finalTs` 只取最后一个周期的快照。往 `--timeframes` 里追加周期（如 `1m,5m,1h`）**不会**扩展升序断言的覆盖面，只是多几份 STALE 统计；真正需要逐周期断言时必须改这里，否则会出现「三周期只有最后一个被校验却报告全绿」。
- **1s 量化误差是刻意接受的成本**：非确定竞态（帧落在两次采样之间）可能被归到相邻快照，导致 REPLACE/APPEND 边界偶发偏移。要提精度应该缩短采样间隔，而不是改成「拿当前实时列」——那会把「帧到达时」的语义彻底破坏。
- **窗口时长语义**：`--window` 是**每周期**秒数；周期数乘以窗口就是总耗时，`1m,5m,1h --window 30` ≈ 90s+ 外加切换等待，别在 CI/脚本包装器里按总时长设超时（本脚本本就不该进 CI）。
- **与 e2e 套件的隐性重复**：`frontend/tests/e2e/kline-realtime.spec.ts` 已断言「列严格升序 + 帧 `open_time` 不回退」。修实时链路时两处都要跑；只跑一处会出现「套件绿但真实窗口未取证」或反之。
