## Why

AI Agent 页面的 DL 量化工作台只能看到回测的**标量指标与曲线**,看不到逐笔开单明细,也无法回看历史回测结果。用户需要一个新的回测 tab:完整记录开单列表、用图表呈现收益相关的经济学统计,并持久化多次回测历史以便复盘。

## What Changes

- 后端 `dlquant.backtest()` 新增**逐笔交易提取**:从 position 序列导出 `trade_list[]`(方向/开仓平仓时间与价格/持仓 bar 数/毛利/净利),对现有标量指标与 `series` 为**加法扩展**,标量 `trades`(交易次数)不变,行为完全向后兼容。
- 新增**回测历史持久化**:`/backtest` 完成后自动落盘(JSON store,仿 ChartStore 先例,上限 20 条 LRU 淘汰,序列降采样),并提供 `GET /backtest/history`、`GET /backtest/history/{id}`、`DELETE /backtest/history/{id}` 三个端点。
- 前端 `AgentView` 新增 **Tab3「回测」**:自含标的/周期/参数运行控件(复用已启用因子),展示开单列表表格与四个收益经济学图形(月度收益柱状、单笔交易盈亏柱状、收益分布直方图、权益+回撤曲线),并提供历史侧栏回看。
- 前端引入 **Recharts 3.x** 作为图表库(React 19 兼容,项目此前无独立图表库)。
- **BREAKING**: 无。既有端点响应结构为加法扩展,旧前端/旧后端均可运行。

## Capabilities

### New Capabilities
- `backtest-history`: 回测历史的持久化存储、LRU 淘汰、降采样与查询/删除端点。
- `backtest-analysis-ui`: AI Agent 页面的回测 tab——开单列表表格、收益经济学图形(Recharts)、历史回看交互。

### Modified Capabilities
- `backtest-engine`: 回测输出增加逐笔交易列表 `trade_list[]`(方向/时间/价格/bar 数/毛利/净利),既有标量与曲线序列保持不变。

## Impact

- **代码**:
  - `backend/src/market_data/dlquant.py`(trade 提取)、新增 `backend/src/market_data/backtest_history.py`(JSON store)、`backend/src/market_data/webapi.py`(三个新端点 + `_run_backtest` 自动落盘)。
- **前端**:
  - `frontend/src/components/views/AgentView.tsx`(第三 tab)、新增 `agent/BacktestTab.tsx`、`agent/TradeTable.tsx`、`agent/EconCharts.tsx`、`lib/chartData.ts`(月度聚合/直方分桶纯函数)、`api/client.ts` + `api/types.ts`(历史端点与交易类型)。
  - 依赖新增 `recharts@^3`。
- **测试**:
  - 后端 `test_dlquant.py`(trade 提取 + 权益重构不变量)、`test_live_api.py`(历史三端点)。
  - 前端 `chartData.test.ts`(纯函数)、`BacktestTab` 组件测试。
- **数据**: 新增 `backtest_history.json`(数据目录),无 schema 迁移。
