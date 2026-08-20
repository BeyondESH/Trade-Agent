## Why

K 线图当前无法按正常时间序列实时显示：图上出现重复 / 乱序的 bar，导致最新一根柱子与时间轴不再一一对应。后端对同一 series 存在**两条并行的推送来源**（事件驱动的 ~1s 节流推送，与每 ~5s 的周期快照轮询），前端 `bitgetWs` 仅按内容相等（`sameCandle`）去重、**不校验时间顺序**，因此一帧“更旧”的 `last_candle` 若晚于较新 bar 抵达，`klinecharts-pro` 会把它当作新桶 `append`，直接破坏升序时间序列。现有 vitest 全部按层 mock，无法覆盖真实 socket 时序，这个缺陷只在浏览器端才暴露，因此需要引入 Playwright 做端到端诊断并据此修复。

## What Changes

- 引入 Playwright（headless Chromium）诊断脚本，对接**真实运行的后端**（uvicorn + vite dev + 真实 `/ws` 中继），采集 `/ws` 上每一帧 candle，并与图表实际数据列 `chart.getDataList()` 做对账。
- 诊断脚本 SHALL 判定并报告三类问题：历史是否渲染、序列是否严格升序无重复桶、每一帧实时 bar 相对当前尾部是 `replace` / 新桶 `append` / **stale 乱序 append**（疑似根因）。
- 修复后端：`/ws` 的 ~5s 周期快照与事件驱动推送对同一 series SHALL 保序，周期快照不得下发比已推送 bar 更旧的 `last_candle`。
- 修复前端：`bitgetWs` 投递 candle 时 SHALL 按 `open_time` 做单调性防护，丢弃早于当前已投递桶的帧，避免向图表下发乱序 bar。
- 图表实例 SHALL 可被端到端测试观测（暴露只读句柄），以便断言真实渲染数据而非 mock。

## Capabilities

### New Capabilities
- `kline-realtime-order-guard`: 实时 candle 帧的时间序列保序契约——`open_time` 单调性防护、stale 帧丢弃、替换/追加语义的判定规则。
- `e2e-playwright-diagnostics`: 基于 Playwright 的端到端诊断能力——真实浏览器 + 真实后端下采集 WS 帧、读取图表数据列、对账并产出可判定的诊断报告。

### Modified Capabilities
- `realtime-candle-push`: 现规格允许事件推送与 ~5s 周期快照并存但未约束二者的**相对顺序**；新增周期快照不得回退到更旧 bar 的保序要求。
- `ws-series-routing`: 现规格只要求按 4 元组精确路由；新增前端投递前的 `open_time` 单调性校验要求（精确路由但仍需拒绝 stale 帧）。

## Impact

- 后端：`backend/src/market_data/webapi.py`（`/ws` 的 `candle_loop` 周期快照与 `candle_update_listener` 事件推送需共享/比较各 series 已推送的 `open_time`）。
- 前端：`frontend/src/api/bitgetWs.ts`（`deliver` 增加单调性防护）、`frontend/src/components/chart/KLineChartProView.tsx`（暴露测试可读的图表句柄）。
- 新增依赖与目录：`playwright`（devDependency）+ Chromium 下载；`frontend` 下新增诊断脚本入口（bare script，非常驻 E2E 套件）。
- 运行前置：诊断需同时起 uvicorn（127.0.0.1:8000）与 vite dev，且可访问 Bitget 公共行情。
- 不影响：REST 历史/回填链路、指标与 S/R 计算、其它 market 通道。
