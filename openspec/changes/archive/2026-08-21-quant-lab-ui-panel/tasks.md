# Tasks

## 1. shadcn/ui 接入

- [x] 1.1 安装依赖:@radix-ui/react-tabs、@radix-ui/react-tooltip、@radix-ui/react-slider、@radix-ui/react-popover 及 shadcn 所需(clsx、tailwind-merge 等)
- [x] 1.2 新增 `frontend/src/lib/utils.ts`(`cn` 组合函数)
- [x] 1.3 创建 `frontend/components.json`,将 CSS 变量映射到 `--tv-*` token(primary/background/card/border/foreground/muted/up/down)
- [x] 1.4 拷贝 shadcn 组件到 `frontend/src/components/ui/`:button、card、table、tooltip、slider、badge、tabs、popover
- [x] 1.5 校验:新增组件使用 token 类、支持双主题、`npm run typecheck` 通过

## 2. 后端接口与历史扩展

- [x] 2.1 `BacktestParams`/BacktestBody 增加 `model: "lr"|"hgb"`,校验非法值返回 422;`run_pipeline` 透传 `SklearnModel(kind=...)`
- [x] 2.2 新增 `POST /backtest/sweep` 路由(复用窗口/周期校验,同步返回 `sweep_params` 结果)
- [x] 2.3 新增 `POST /backtest/walkforward` 路由:多折 `walk_forward_splits` + 每折回测,返回 folds(train/test 区间 + 指标 + roc_auc/log_loss)
- [x] 2.4 `backtest_history.py` 保存时写入 `stats`/`model_metrics`(非空才写),读取兼容旧记录
- [x] 2.5 后端测试:model 校验、sweep 网格返回与数据不足、walkforward 折区间单调与 422、历史 stats/model_metrics 落盘与旧记录兼容

## 3. 前端展示补齐(不改面板结构)

- [x] 3.1 `MetricCards` 扩容:纯函数 `buildMetricCards(result)` 渲染 stats(Sharpe/Sortino/Calmar/PF)+ model_metrics(AUC/LogLoss),缺失占位
- [x] 3.2 曲线视图增加 proba 分布直方图(series.proba 分桶,Recharts)
- [x] 3.3 `TradeTable` 增加按净利/方向列排序(shadcn Table)
- [x] 3.4 `api/client.ts` + `types.ts`:sweep/walkforward 客户端方法、`BacktestParams.model`、SweepResult/WalkForwardResult 类型
- [x] 3.5 组件测试:buildMetricCards 分组与占位、TradeTable 排序、proba 分桶纯函数

## 4. 面板合并为 QUANT LAB

- [x] 4.1 新建 `QuantLabPanel.tsx`:共享 symbol/timeframe/range/params/model 状态与 run 轮询逻辑(提取自 BacktestTab)
- [x] 4.2 六视图 Tabs 结构:曲线分析/参数扫描/Walk-forward/因子 IC/开单明细/历史
- [x] 4.3 迁移 DlQuantTab 的 DataAvailability、因子 IC、曲线与指标卡到对应视图
- [x] 4.4 迁移 BacktestTab 的开单明细、EconCharts、HistorySidebar 到对应视图,历史回看态携带 stats/model_metrics
- [x] 4.5 agent tab 注册处将 DlQuantTab/BacktestTab 替换为 QuantLabPanel
- [x] 4.6 迁移/重写组件测试:`BacktestTab.test.tsx`→QuantLabPanel 测试,HistorySidebar/TradeTable 测试适配新位置

## 5. 参数扫描与 Walk-forward 视图

- [x] 5.1 参数扫描视图:手写 CSS grid 热力图(行=阈值/列=费用,色阶=total_return)+ Tooltip 全指标 + Popover 明细
- [x] 5.2 Walk-forward 视图:shadcn Table 折指标表 + 横向区间条(train/test 分段着色)
- [x] 5.3 空态/错误/loading 状态处理
- [x] 5.4 组件测试:热力图渲染与单元格交互、区间条渲染

## 6. 回归验证

- [x] 6.1 后端全量 `cd backend && python -m pytest -q`(含新路由与历史测试)
- [x] 6.2 前端 `cd frontend && npm run test && npm run typecheck`
- [x] 6.3 L2 live API/WS 冒烟(新路由在 live_server 下)
- [x] 6.4 L3 e2e 冒烟(QUANT LAB 面板浏览、sweep/walkforward 端到端)
