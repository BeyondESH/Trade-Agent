## 1. 后端:模型超参与执行参数透传

- [x] 1.1 `webapi.py` 定义 `_MODEL_PARAM_KEYS`(C/max_iter/solver/max_depth/learning_rate/min_samples_leaf)与 `_BACKTEST_MONEY_KEYS`(init_cash/size),并加入 `/backtest` 的 params 校验与透传;非法超参返回 422
- [x] 1.2 `dlquant.py` `SklearnModel` 支持 `scale=False` 时跳过 StandardScaler(标准化开关透传)
- [x] 1.3 `dlquant.backtest` 支持 `init_cash`/`size` 并透传给 `vbt.Portfolio.from_signals`;缺省值与现状一致
- [x] 1.4 `api/types.ts` 扩展 `BacktestParams`(超参/scale/init_cash/size)
- [x] 1.5 `test_webapi.py`/`test_dlquant.py` 覆盖超参透传、非法超参 422、init_cash/size 生效与缺省兼容

## 2. 后端:新输出字段

- [x] 2.1 `dlquant.py` `run_pipeline` 训练后导出 `feature_weights`(lr → coef_ + 符号,hgb → feature_importances_)
- [x] 2.2 `dlquant.py` 用 `sklearn.metrics.roc_curve` 计算 `roc_curve={fpr,tpr}`;测试集退化时省略字段且 roc_auc=null
- [x] 2.3 `dlquant.backtest` 计算 `benchmark=close/close[0]` 并入 series
- [x] 2.4 `api/types.ts` 扩展 `BacktestJobResult`/`BacktestSeries`/历史详情类型
- [x] 2.5 `backtest_history.py` 持久化新字段(SERIES_LANES 加 benchmark,新字段可选存储),旧记录兼容
- [x] 2.6 `test_dlquant.py`/`test_backtest_history.py` 覆盖新字段输出与旧记录兼容

## 3. 前端:模型控制面板(ModelPanel)

- [x] 3.1 新建 `ModelPanel.tsx`:lr/hgb 切换 + 超参滑杆(双模式:Radix Slider + 数字输入)+ StandardScaler 开关 + init_cash/size 输入
- [x] 3.2 定义 4 套预设模板常量(稳健 lr / 激进 lr / HGB 快速 / 自定义)与模板匹配/降级逻辑
- [x] 3.3 `BacktestControls.tsx` 连续参数(训练比例/阈值/手续费/滑点)滑杆化
- [x] 3.4 `QuantLabPanel.tsx` 接入 ModelPanel 状态并随 `params` 提交
- [x] 3.5 组件测试:`ModelPanel.test.tsx`(切换模型、滑杆同步、模板应用与降级)

## 4. 前端:独立信号 K 线(SignalKLineChart)

- [x] 4.1 新建 `SignalKLineChart.tsx`:复用 KLineChartProView,`useMemo` 独立 `BitgetDatafeed`,symbol/period 派生自 QUANT LAB 参数条
- [x] 4.2 新增工具把 `series.signal` + `open_time` 映射为买卖点 overlay 配置(mark 图元,多/空色与朝向区分)
- [x] 4.3 通过 `onReady(chart)` 在回测结果到达后叠加/清空 overlay 标记
- [x] 4.4 `QuantLabPanel.tsx` 新增「信号K线」tab,tab 状态受控化,回测成功自动激活
- [x] 4.5 组件测试:`SignalKLineChart.test.tsx`(数据加载、overlay 生成、空 signal 不渲染)

## 5. 前端:模型诊断(ModelDiagnostics)

- [x] 5.1 新建 `ModelDiagnostics.tsx`:ROC 曲线(Recharts,标注 AUC)+ 特征权重条形图
- [x] 5.2 缺失数据(feature_weights/roc_curve 缺)降级为空态
- [x] 5.3 `QuantLabPanel.tsx` 新增「模型诊断」tab
- [x] 5.4 组件测试:`ModelDiagnostics.test.tsx`(lr/hgb 两种权重、ROC 渲染、缺失空态)

## 6. 前端:曲线与因子 IC 增强

- [x] 6.1 `chartData.ts` 新增 `benchmarkSeries`/`probaThresholdData`/月度热力图数据纯函数及测试
- [x] 6.2 `EconCharts.tsx`:权益叠加基准线、proba+阈值带、月度收益年×月热力图(可切回柱状图)
- [x] 6.3 `FactorIcTable.tsx`/新 `FactorIcChart.tsx`:IC 时序趋势图,无时序数据降级表格
- [x] 6.4 曲线分析 tab 集成增强组件,空态与缺失降级

## 7. 前端:参数扫描与 Walk-forward 输入交互化

- [x] 7.1 `SweepView.tsx`:阈值/费用/滑点滑杆 + 可编辑值列表,按输入生成网格请求
- [x] 7.2 `WalkForwardView.tsx`:`n_splits` 滑杆/数字输入,错误透出
- [x] 7.3 组件测试扩展:SweepView/WalkForwardView 输入变化反映到请求

## 8. 修复与联调

- [x] 8.1 `QuantLabPanel.run()`:检测 `job.result?.error` 并透出横幅,pipeline 错误不渲染空图表
- [x] 8.2 历史 legacy 记录点击显示明确提示(不再空态)
- [x] 8.3 后端全量回归:`cd backend && python -m pytest -q`
- [x] 8.4 前端全量回归:`cd frontend && npm run test && npm run typecheck`
- [x] 8.5 L3 e2e:`cd frontend && npm run test:e2e`(quant-lab.spec.ts 更新新 tab 与自动跳转)
