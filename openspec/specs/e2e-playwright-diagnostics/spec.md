# e2e-playwright-diagnostics Specification

## Purpose
TBD - created by archiving change diagnose-kline-realtime-order. Update Purpose after archive.

## Requirements

### Requirement: 端到端实时 K 线诊断脚本
系统 SHALL 提供一个基于 Playwright（headless Chromium）的诊断脚本，在真实浏览器中加载前端、连接真实运行的后端 `/ws` 中继，观测实时 K 线链路并产出可判定的诊断结论。脚本 SHALL 可在本地按需运行，不作为常驻 CI 门禁。

#### Scenario: 脚本运行并产出结论
- **WHEN** 在 uvicorn 与 vite dev 均已运行的前提下执行诊断脚本
- **THEN** 脚本 SHALL 打开图表页面、观测不少于一个采样窗口，并输出每个被检查 series 的通过/失败结论

#### Scenario: 前置依赖缺失时明确报错
- **WHEN** 后端或前端开发服务器未运行
- **THEN** 脚本 SHALL 以明确的错误信息终止，指出缺失的前置服务，而非静默通过

### Requirement: WebSocket candle 帧采集
诊断脚本 SHALL 采集页面 WebSocket 上所有 `channel:"candle"` 帧，并为每帧记录到达时刻、series 标识（`category`/`symbol`/`timeframe`）、`action` 与 `last_candle.open_time`，形成可追溯的帧日志。

#### Scenario: 记录完整帧日志
- **WHEN** 观测期间收到 candle 帧
- **THEN** 脚本 SHALL 记录该帧的到达时刻、4 元组 series 标识、`action` 与 `open_time`

#### Scenario: 帧日志可用于识别来源节奏
- **WHEN** 诊断结束
- **THEN** 帧日志 SHALL 保留到达时刻，使 ~1 秒事件推送与 ~5 秒周期快照的节奏可被区分

### Requirement: 图表数据列可观测
系统 SHALL 使图表实例的数据列在端到端测试中可读取，以便断言真实渲染数据。该可观测句柄 SHALL 为只读用途，不得改变生产渲染行为。

#### Scenario: 读取真实数据列
- **WHEN** 诊断脚本在图表就绪后读取可观测句柄
- **THEN** 脚本 SHALL 能取得图表当前数据列及其 `timestamp` 序列

#### Scenario: 不改变生产行为
- **WHEN** 应用在无诊断脚本的正常使用下运行
- **THEN** 该句柄的存在 SHALL 不改变图表的渲染结果与交互行为

### Requirement: 帧与图表对账判定
诊断脚本 SHALL 将每个实时 candle 帧与当时图表数据列尾部对账，按三类判定并统计：`open_time` 等于尾部为 REPLACE，大于尾部为 APPEND，小于尾部为 STALE。出现任一 STALE SHALL 判定为失败并高亮报告。

#### Scenario: 判定 STALE 乱序帧
- **WHEN** 某实时帧的 `open_time` 小于当时图表数据列尾部的 `timestamp`
- **THEN** 脚本 SHALL 将其标记为 STALE 并使该 series 的诊断结论为失败

#### Scenario: 正常替换与追加不报错
- **WHEN** 所有实时帧的 `open_time` 均等于或大于当时尾部 `timestamp`
- **THEN** 脚本 SHALL 分别计入 REPLACE 与 APPEND，且该 series 结论为通过

#### Scenario: 校验序列升序无重复
- **WHEN** 采样窗口结束
- **THEN** 脚本 SHALL 校验图表数据列 `timestamp` 严格升序且无重复，违反即判定失败

#### Scenario: 区分「无实时数据」与「乱序」
- **WHEN** 观测窗口内未收到任何实时 candle 帧
- **THEN** 脚本 SHALL 报告为「未收到实时数据」而非「乱序」，二者结论 SHALL 可区分

### Requirement: 诊断证据留存
诊断脚本 SHALL 在结束时留存可复核的证据，至少包含帧日志与图表截图，便于在非确定性行情下事后复核。

#### Scenario: 留存证据文件
- **WHEN** 诊断脚本运行结束（无论通过或失败）
- **THEN** 脚本 SHALL 输出帧日志与至少一张图表截图作为证据
