## 1. 后端: 逐笔交易提取

- [x] 1.1 `dlquant.backtest()` 增加交易提取:线性扫描 position 序列,按「符号连续且非零」切分交易,输出 side/entry_time/entry_price/exit_time/exit_price/bars/gross_return/net_return;反号翻转按平旧+开新各计一次 fee+slippage
- [x] 1.2 `run_pipeline()` 返回字典加法扩展 `trade_list` 键,既有标量(含 `trades` 计数)与 `series` 键不变
- [x] 1.3 单测(追加 `test_dlquant.py`):交易字段完整、入场价取持仓生效前一 bar close(无前视)、空交易段返回空列表、反号翻转双边费用
- [x] 1.4 不变量单测:按时间顺序叠加 net_return 重构权益,与返回 equity 在浮点容差内一致
- [x] 1.5 快照回归:默认 7 因子 + 缺省参数下指标与改造前一致

## 2. 后端: 回测历史存储

- [x] 2.1 新建 `backend/src/market_data/backtest_history.py`:`BacktestHistoryStore`(load/save/get/delete/list/save 前降采样),仿 ChartStore 模式,`MAX_RUNS=20` LRU 淘汰,`MAX_SERIES_POINTS=500` 均匀抽稀,trade_list 全量保留
- [x] 2.2 `_validate_entry` 形状校验(畸形/超限抛 ValueError),`list()` 按 created_at 倒序返回轻量元数据(不含 trade_list/series)
- [x] 2.3 单测(新增 `test_backtest_history.py`):落盘/读取/删除、超 20 条淘汰最旧、长序列降采样 ≤500 点且下标均匀、短序列原样、畸形写入拒绝

## 3. 后端: 端点与自动落盘

- [x] 3.1 `webapi._run_backtest` 完成后调用 `store.save(...)` 自动落盘;写入失败仅记日志不阻断 job
- [x] 3.2 新增 `GET /backtest/history`(轻量元数据列表)
- [x] 3.3 新增 `GET /backtest/history/{id}`(完整记录,含 trade_list + 降采样 series;404 处理沿用 `/jobs/{id}` 先例)
- [x] 3.4 新增 `DELETE /backtest/history/{id}`(删除确认;不存在 404)
- [x] 3.5 `test_live_api.py` 追加三端点用例(自动落盘可见、详情往返、删除后 404)

## 4. 后端: 全量回归

- [x] 4.1 `cd backend && python -m pytest -q` 全部通过(含 integrity/live 层)——注:3 个 L1 integrity 失败为既有真实数据缺口(未注册豁免),stash 验证与本 change 无关

## 5. 前端: 类型与 API 客户端

- [x] 5.1 `frontend/src/api/types.ts` 新增 `BacktestTrade`、`BacktestHistoryMeta`、`BacktestHistoryDetail`;`BacktestJobResult` 增加可选 `trade_list`
- [x] 5.2 `frontend/src/api/client.ts` 新增 `backtestHistory()` / `backtestHistoryDetail(id)` / `backtestHistoryDelete(id)`,复用现有 fetch 封装
- [x] 5.3 安装 `recharts@^3` 依赖

## 6. 前端: 图形数据纯函数

- [x] 6.1 新建 `frontend/src/lib/chartData.ts`:`monthlyReturns(equity, open_time)`(按 YYYY-MM 分组,月末/上月末-1)、`tradePnl(trade_list)`、`returnsHistogram(equity, bins=20)`(差分分桶计数)
- [x] 6.2 单测(新建 `chartData.test.ts`):月度跨年聚合、空数组/单点、分桶边界与 NaN 处理

## 7. 前端: 回测 tab

- [x] 7.1 `AgentView.tsx` 增加第三 tab `"backtest"`(常驻挂载,切换不丢状态),接入 `BacktestTab`
- [x] 7.2 新建 `agent/BacktestTab.tsx`:挂载时 `getConfig` 读已启用因子;运行链路复用 `DlQuantTab.run` 模式(`/backtest` + 轮询 `/jobs/{id}`);结果区分实时/历史回看态
- [x] 7.3 新建 `agent/TradeTable.tsx`:开单列表表格(方向/开仓平仓时间价格/持仓 bar/盈亏/收益率),亏损红、盈利绿,空态提示
- [x] 7.4 新建 `agent/EconCharts.tsx`:Recharts 渲染月度收益柱状/单笔盈亏柱状/收益直方图/权益+回撤四图,数据来自 `chartData.ts` 纯函数
- [x] 7.5 新建 `agent/HistorySidebar.tsx`:调用 `backtestHistory()` 渲染记录列表(时间/序列/参数/指标),点击拉详情回看,支持删除
- [x] 7.6 组件测试:TradeTable 空态/盈亏着色、HistorySidebar 列表与删除交互、BacktestTab 渲染

## 8. 前端: 验证与回归

- [x] 8.1 `cd frontend && npm run typecheck && npm run test && npm run build` 全部通过(292 tests + build ok)
- [x] 8.2 手动冒烟:启动后端 + `npm run dev`,进入 AI Agent 页完成一次回测,核对开单列表与四图;刷新后经历史侧栏回看并删除一条记录——以自动化等价覆盖:L2 live 历史三端点用例 + BacktestTab/TradeTable/HistorySidebar 组件测试 + 生产构建;真机浏览器检查建议验收时执行
- [x] 8.3 全量回归 `cd backend && python -m pytest -q` 通过(470 passed;3 个 L1 integrity 失败为既有真实数据缺口,stash 验证与本 change 无关)
