## 1. Playwright 诊断脚手架

- [x] 1.1 在 `frontend` 添加 `playwright` devDependency 并安装 Chromium（不引入 `@playwright/test` 套件）
- [x] 1.2 新增诊断脚本入口（如 `frontend/scripts/diagnose-kline-realtime.mjs`）并在 `package.json` 添加运行脚本
- [x] 1.3 脚本启动时校验前置服务：探测 vite dev 与后端 `/candles/recent` 可达，缺失则以明确错误信息退出
- [x] 1.4 脚本支持参数化被检查的 series（symbol、timeframe 列表）与采样窗口时长（默认 ≥30s）

## 2. 图表数据列可观测

- [x] 2.1 在 `KLineChartProView` 的 `onReady` 链路上挂只读诊断句柄（如 `window.__kline_chart__`），不改变渲染与交互行为
- [x] 2.2 补充单测断言句柄在图表就绪后可取得数据列，且不影响既有挂载/卸载生命周期测试

## 3. WS 帧采集与对账判定

- [x] 3.1 脚本用 `page.on('websocket')` 采集所有 `channel:"candle"` 帧，记录到达时刻、4 元组 series 标识、`action`、`last_candle.open_time`
- [x] 3.2 实现对账三分类：`open_time` 等于尾部为 REPLACE、大于为 APPEND、小于为 STALE，并按 series 统计
- [x] 3.3 校验采样窗口结束时图表数据列 `timestamp` 严格升序且无重复
- [x] 3.4 区分并分别报告「未收到实时数据」与「收到但乱序（STALE）」两种失败结论
- [x] 3.5 输出证据：帧日志文件 + 至少一张图表截图

## 4. 复现并定位根因

- [x] 4.1 启动 uvicorn 与 vite dev，对 1m / 1h 运行诊断脚本，记录基线结论
- [x] 4.2 依据帧日志的到达时刻确认 STALE 节奏：实时采样内未出现 STALE——WS 层帧已按序到达，5s 轮询未滞后；竞态为潜在/非确定（已在 design.md「实证结论」记录）
- [x] 4.3 竞态未复现 ≠ 假设被证伪：未改用重连/缓冲假设；由确定性单测钉住两层保序，design.md 已补记实证结论

## 5. 后端保序修复

- [x] 5.1 在 `webapi.py` 的 `/ws` 连接作用域为每个 series 维护「已推送最新 `open_time`」水位
- [x] 5.2 事件驱动推送成功下发后更新该水位
- [x] 5.3 `candle_loop` 周期快照下发前比较水位：`last_candle.open_time` 更旧时不下发该 `last_candle`
- [x] 5.4 保证被跳过 `last_candle` 的周期快照仍按既有规格提供 `levels` / `macd_hist`，且 5 秒周期不变
- [x] 5.5 后端单测覆盖：更旧快照被拦截、正常快照放行、水位随事件推送前移

## 6. 前端单调性防护

- [x] 6.1 在 `bitgetWs.deliver` 中于 `sameCandle` 内容去重之外增加 `open_time` 单调性校验，丢弃早于本 series 已投递值的帧
- [x] 6.2 确认时间水位按 `category:symbol:timeframe` 分条目持有，退订/切换 series 时不复用旧水位
- [x] 6.3 确认防护只作用于实时投递路径，不影响 `getHistoryKLineData` / `applyMoreData` 的历史与回填
- [x] 6.4 前端单测覆盖：stale 帧被丢弃、同桶替换放行、新桶追加放行、切换 series 不误判

## 7. 验证与收尾

- [x] 7.1 重跑诊断脚本：1m / 1h 下 STALE=0、数据列严格升序
- [x] 7.2 运行 `npm run test`（234 通过）、`npm run typecheck`（frontend）及后端 `test_webapi`（47 通过），全绿
- [x] 7.3 通过诊断脚本对 1m / 1h 实时推进做了端到端观测，确认无重复或乱序 bar
- [x] 7.4 在 change（design.md「实证结论」）记录诊断结论与最终根因，供归档时同步进主 specs
