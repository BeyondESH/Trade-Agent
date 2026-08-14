## Why

后端 8 个 change 已把能力做全并测好(89 项),但只能用 CLI/Python 调用。#9 前端需要一个 HTTP/WS 接口层。本 change(#9a)实现 **FastAPI 薄 API 层**,把 `market_data` 的能力暴露为 REST + WebSocket,供后续 React 前端(#9b)消费。API 层可用 httpx + pytest 覆盖,保持与前 8 个 change 一致的测试基线。

## What Changes

- 新增 **FastAPI 应用**(绑定 127.0.0.1,本地自用):OpenAPI 文档、统一错误处理。
- 新增 **行情/分析端点**:candles、analyze(指标末值+Top-N S/R)、structure(趋势线/箱体/OB)、levels、backtest(后台任务+进度)、pull(后台,走 MCP)。
- 新增 **Agent 端点**:decide(只出决策)、cycle(纸面执行一次,记忆增强)、portfolio、journal。
- 新增 **配置管理**:provider/risk 参数、**可编辑系统提示**、**手动规则** 的读写与 JSON 持久化(策略编辑器 a+b 的后端)。
- 新增 **实盘控制流**:全局 kill-switch/实盘开关;实盘下单走 **confirm-token 两步**(先校验拿 token,确认后经 #4/#3 闸门执行)。
- 新增 **WebSocket**:定时快照广播(最新 K线/指标/持仓浮盈/循环进度)。
- 小幅**向后兼容扩展**:`LLMTextProvider` 增加可选 `system_prompt` 参数(默认沿用原常量,不改既有行为)。

## Capabilities

### New Capabilities
- `api-core`: FastAPI 应用骨架、本地绑定、错误处理、健康检查。
- `market-endpoints`: 行情/分析/结构/回测/拉取端点。
- `agent-endpoints`: Agent 决策/循环/组合/交易日志端点。
- `config-persistence`: provider/risk/系统提示/手动规则 的读写与持久化。
- `live-control`: kill-switch/实盘开关 + confirm-token 实盘下单流。
- `realtime-ws`: 定时快照 WebSocket 广播。

### Modified Capabilities
<!-- 无(以可选参数向后兼容扩展 llm-provider,不改既有行为) -->

## Impact

- **新增依赖**:`fastapi`、`uvicorn`;测试用 `httpx`(FastAPI TestClient)。
- **代码**:`backend/src/market_data/webapi.py`、`appconfig.py`;CLI 增加 `serve`。
- **对齐路线图**:实现 #9a;React UI 为 #9b。
- **安全**:绑定 127.0.0.1;凭据仅环境变量;实盘经开关 + 每单 confirm token + #4 双闸门 + #3 风控;默认纸面。
