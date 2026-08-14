## Why

#9a 已提供 FastAPI 的 REST + WebSocket。本 change(#9b,收官)实现 **React 前端**,让用户在浏览器里看 K线/指标/S-R、切换与编辑 Agent 策略、看盈亏与交易日志、控制 kill-switch 与实盘确认。使用 lightweight-charts 画图,Vite + TypeScript 工程,消费已就绪的 API。

## What Changes

- 新增 **Vite + React + TypeScript 前端工程**(`frontend/`),dev 代理到本地 API。
- 新增 **类型化 API 客户端**:封装所有 REST 端点与 `/ws`(快照),供组件调用。
- 新增 **图表视图**:lightweight-charts 画 K 线 + 指标叠加 + S/R 水平线 + 趋势线/箱体 overlay。
- 新增 **策略编辑器**:切换 provider/agent、编辑参数(ProviderConfig/RiskConfig 表单)+ 系统提示 + 手动规则,绑定 `/config`。
- 新增 **交易面板**:组合/盈亏、交易日志、时间段选择、Excel 导入导出、运行控制(kill-switch)、**实盘二次确认对话框**(下单→拿 token→确认)。
- 新增 **实时更新**:WS 快照驱动价格/指标/持仓刷新。
- 纯逻辑(数据转换、API 客户端)用 **Vitest** 单测;`tsc` + `vite build` 作为整体验证。

## Capabilities

### New Capabilities
- `frontend-scaffold`: Vite/React/TS 工程与构建/代理配置。
- `api-client`: 类型化 REST + WS 客户端。
- `charting`: lightweight-charts K 线与叠加层(指标/S-R/趋势线/箱体)。
- `strategy-config-ui`: agent 切换 + 参数/提示/规则编辑,绑定 /config。
- `trading-ui`: 组合/日志/控制/实盘确认/时间段/Excel。

### Modified Capabilities
<!-- 无(纯新增前端工程,消费既有 API) -->

## Impact

- **新增**:`frontend/`(Node 工程);依赖 react、vite、typescript、lightweight-charts;测试 vitest。
- **不改**:后端 Python 代码(仅消费 #9a API)。
- **对齐路线图**:实现 #9b,路线图收官。
- **安全**:实盘经确认对话框 + 后端 confirm-token/#4/#3 闸门;密钥不进前端;默认纸面。
