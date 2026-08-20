## Context

实时 K 线链路当前形态（均为既有代码）：

```
Bitget WS ──► realtime.BitgetWsStream._upsert(buffer, bar)  ──_notify──┐
             (open_time = 桶开盘 UTC ms, 来自 Bitget row[0])            │
                                                                       ▼
                            webapi.py  /ws  一个浏览器连接内有两条来源：
                            (A) candle_update_listener  事件驱动, ~1s 节流 + 合并
                            (B) candle_loop             每 ~5s 轮询 _snapshot()
                                    两者都发 action:"update" + data.last_candle
                                                                       │
                                                                       ▼
                       frontend bitgetWs.deliver()  仅 sameCandle 内容去重
                                    key = category:symbol:timeframe
                                                                       ▼
                       BitgetDatafeed.subscribe(cb) ──► candleToKLine(c)
                                                                       ▼
                       vendored klinecharts-pro:  chart.updateData(bar)
```

`klinecharts` 的 `updateData(bar)` 语义由 `bar.timestamp` 与当前尾部桶决定：**相等则替换，更大则追加新桶**。因此只要有一帧 `open_time` 小于当前尾部，它就会被当成一个“新桶”插进去，序列不再严格升序 → 表现为重复 / 乱序 bar，即用户看到的“无法按正常时间序列显示”。

已确认无关的因素（排查中排除）：`open_time` 在 REST 历史与实时两条路径都取桶开盘毫秒（`candleToKLine` 同一函数），`1h↔1H`、`1mo↔1M` 的 timeframe token 双向映射一致，因此不是单位或标识错配。

真正的缺口是**契约层没有保序要求**：`realtime-candle-push` 允许 (A)(B) 并存却未约束相对顺序；`ws-series-routing` 只要求按 4 元组精确路由，未要求拒绝 stale 帧。而现有 vitest 逐层 mock，`datafeed.test.ts` / `bitgetWs.test.ts` 都以人工顺序喂帧，永远看不到真实 socket 的交错时序。

## Goals / Non-Goals

**Goals:**
- 用 Playwright 在真实浏览器 + 真实后端下**可复现地判定**该缺陷，产出可读诊断报告（区分「没收到实时帧」与「收到但乱序 append」）。
- 让实时 candle 帧具备**端到端保序保证**：后端不下发回退帧，前端再做一层单调性防护（纵深防御）。
- 使图表真实渲染数据（`getDataList()`）可被端到端断言，脱离 mock。

**Non-Goals:**
- 不建设常驻 E2E 套件 / CI 流水线（本次只要 bare 诊断脚本）。
- 不改 REST 历史与回填链路、不改指标与 S/R 计算、不动其它 market 通道。
- 不升级或 fork vendored `klinecharts-pro`（其 `updateData` 语义作为既定约束接受）。
- 不解决 `1s` 级别的高频吞吐/背压问题（正常时间序列为本次焦点）。

## Decisions

### 1. 诊断手段：Playwright bare script + 真实后端，而非 mock socket
选真实链路，因为缺陷本质是**时序竞态**：(A) 的 1s 节流与 (B) 的 5s 轮询在真实事件循环下的交错顺序才是触发条件，脚本化 socket 会把顺序固定下来，等于把要找的 bug 假设掉。代价是需要外网与运行中的 uvicorn，且结果不完全确定性——通过**观测窗口足够长 + 明确报告而非硬失败**来缓解。
- 备选（弃用）：`@playwright/test` 完整套件——超出本次范围，且在根因未定位前先建套件属于过早投资。

### 2. 判据核心：WS 帧与图表数据列「对账」
对每一帧 `data.last_candle`，取当时 `chart.getDataList()` 尾部 `tail`，按三分类判定：

```
frame.open_time == tail.timestamp   → REPLACE  正常（同桶刷新）
frame.open_time >  tail.timestamp   → APPEND   正常（开新桶）
frame.open_time <  tail.timestamp   → STALE    ❌ 缺陷（乱序 append 根因）
```

同时独立校验整条数据列**严格升序且无重复 timestamp**。这两条合起来才能把「实时没到」与「实时到了但破坏序列」分开——这正是本次要回答的首要问题。
- 备选（弃用）：只截图做像素对比——能看出图“坏了”，但无法定位是哪一帧、哪条来源导致，对修复没有指导价值。

### 3. 图表可观测性：通过既有 `onReady` 暴露只读句柄
`KLineChartProView` 已有 `onReady?: (chart) => void`，在此挂一个仅测试读取的全局句柄（如 `window.__kline_chart__`），不新增渲染逻辑、不改变生产行为。选它是因为**零侵入**：图表实例本来就在这个回调里可得。
- 备选（弃用）：解析 canvas 像素反推 OHLC——脆弱且无法给出 timestamp；
- 备选（弃用）：给组件加测试专用 props——会污染生产组件签名。

### 4. 后端修复：按 series 记录「已推送的最新 open_time」，周期快照不得回退
在 `/ws` 连接作用域内为每个 series 维护 `last_sent_open_time`。事件推送 (A) 成功发送后更新它；周期快照 (B) 在发送前比较，若其 `last_candle.open_time` **小于**已记录值，则**剥离/跳过该帧的 last_candle**（其指标与 S/R 增强字段的价值仍保留，见风险）。把权威顺序交给事件流，因为 (A) 直接来自 stream buffer 的变更通知，(B) 只是 `stream.latest()` 的一次采样，天然更容易滞后。
- 备选（弃用）：直接取消 5s 轮询——会一并丢掉 `levels`/`macd_hist` 的周期刷新，属于回归既有规格；
- 备选（弃用）：给帧加 `source` 字段让前端自行取舍——把后端的顺序责任外推给每个客户端，契约更差。

### 5. 前端修复：`bitgetWs.deliver` 增加 `open_time` 单调性防护
`SeriesEntry` 已持有 `last`，在内容去重（`sameCandle`）之外增加一条：若 `candle.open_time < entry.last.open_time` 则丢弃，不投递给任何 listener。即使后端（或任一中继/重连乱序）漏了保序，图表也拿不到会破坏序列的 bar。
- 采用纵深防御而非「只修一端」：后端保证正确性，前端保证鲁棒性（重连、代理缓冲都可能重排）。
- 注意边界：**跨 symbol/timeframe 切换后 `entry.last` 必须视为无效**，否则新 series 的合法旧时间戳会被误杀——由 `series` 条目本身按 key 独立持有 `last` 天然隔离。

### 6. 单元测试与端到端测试的分工
- vitest 覆盖**确定性规则**：`deliver` 的 stale 丢弃、后端保序比较逻辑；
- Playwright 覆盖**真实时序**：对账三分类与序列升序断言。
规则一旦被单测钉住，端到端脚本就退化为「回归确认 + 现场取证」，不必长期维护。

## 实证结论（Playwright 对真实后端采样记录）

在已运行的真实后端（**:8000，为改动前旧代码、无轮询保序**）+ 改动后前端（vite :5173，含前端单调性防护）上运行诊断脚本，结果：

| window | frames(1m/1h) | WS 层乱序到达 | 图表侧 STALE | 数据列 |
|---|---|---|---|---|
| 1m, 35s | 37 / 0 | 0 | 0 | 严格升序 |
| 1h, 40s | 34 / 34 | 0 | 0 | 严格升序, 2 append |
| 1m, 75s（跨越分钟桶）| 71 / 69 | 0 | 0 | 严格升序, 1 append |

结论：实时采样窗口内，**WS 帧在边界层已按 `open_time` 有序到达**，5s 轮询的 `stream.latest()` 未出现在事件推送之后回退的情况；stale 竞态为**潜在/非确定**——只会在桶切换瞬间或行情突增使轮询 `latest()` 短暂滞后于刚推送的事件 bar 时触发，quiet 窗口下未复现。因此：

- 前端单调性防护与后端轮询保序的正确性由**确定性单元测试**钉住（stale 丢弃 / 更旧快照被剥离 / 水位前移）。
- 诊断脚本证明端到端链路在真实行情下有序、无回归，并可在行情触发竞态时取证。
- 复现未达成 ≠ 缺陷不存在：该竞态由两层纵深防御兜底，使图表在任何时序下都保持严格升序时间序列。

## Risks / Trade-offs

- [周期快照被剥离 `last_candle` 后，增强字段刷新是否受影响] → 只在**检测到回退时**跳过其 last_candle，`levels`/`macd_hist` 仍按既有规格随快照下发；不改变 5s 周期本身。
- [Playwright 依赖真实行情与外网，结果非确定性] → 观测窗口取足够长（约 30s+），报告输出帧日志与截图作为证据；判定以「是否出现 STALE」为主，不把「必须出现 tick」当硬失败条件。
- [新增 Chromium 下载体积较大] → 仅作 devDependency 且不进 CI；本地诊断用完即止。
- [前端单调性防护可能掩盖真实的「补历史」场景] → 该防护只作用于**实时 candle 投递路径**（`deliver`），历史与回填走 `getHistoryKLineData`/`applyMoreData`，完全不受影响。
- [跨 series 切换时误判 stale] → `last` 按 `category:symbol:timeframe` 分条目持有，切换即换条目；退订清理已存在，需在实现时确认不复用旧 `last`。
- [`window` 上暴露图表句柄的安全/污染顾虑] → 只读、仅用于诊断；如需可在生产构建下省略，或接受其等价于既有 devtools 可达性。
- [根因假设可能被证伪（真凶不是 5s 轮询）] → 这正是先做诊断脚本的原因：对账日志会直接给出 STALE 帧的到达节奏（~5s 特征 vs 其他），若不成立则依据帧日志转向下一假设（如重连重放、代理缓冲）。
