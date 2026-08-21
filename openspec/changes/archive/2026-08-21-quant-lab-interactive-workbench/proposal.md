# quant-lab-interactive-workbench

## Why

QUANT LAB 目前是 sklearn + vectorbt 的一条"窄管道":因子集→固定默认参数的模型→阈值→固定 fee/slippage→固定输出。scikit-learn 与 vectorbt 的真实能力绝大部分被锁死——模型超参(C/max_iter/max_depth/learning_rate)不可调、特征权重(coef_/feature_importances_)不返回、ROC 曲线只有两个标量、权益曲线无基准对照、signal/proba 序列画不出来、交易买卖点无法落到 K 线上。用户无法通过前端 UI 完整使用后端的量化框架。

本次改动把 QUANT LAB 升级为完整交互式量化工作台:参数滑杆化 + 预设模板一键切换,新增独立 K 线信号图与模型诊断可视化,后端把已有但未暴露的 sklearn/vectorbt 能力全部吐出。

## What Changes

- **模型层交互(新)**:`model: "lr" | "hgb"` 切换;超参滑杆化(lr: C/max_iter/solver;hgb: max_depth/learning_rate/min_samples_leaf),StandardScaler 开关;**4 套预设模板**——稳健 lr / 激进 lr / HGB 快速 / 自定义(改动任一滑杆自动降级为自定义)。
- **回测层交互(增强)**:fee/slippage 滑杆化,新增初始资金 `init_cash` 与仓位 `size` 输入,与超参共享同组预设模板。
- **独立信号 K 线(新)**:QUANT LAB 内新增自包含 `KLineChartProView` 模块(用自己的 `BitgetDatafeed`,跟随 QUANT LAB 自身参数条的 symbol/timeframe,不与主界面其他 K 线图联动),回测完成后把 `series.signal` 的 +1/-1 买卖点叠加为 overlay 标记;**回测完成自动切换到"信号K线" tab**。
- **模型诊断可视化(新)**:ROC 曲线(`sklearn.metrics.roc_curve`)、特征权重条形图(lr → `|coef_|`,hgb → `feature_importances_`)。
- **曲线增强**:权益曲线叠加 buy&hold 基准(`close/close[0]`);proba 时间序列 + 阈值带;月度收益升级为年×月热力图。
- **因子 IC 增强**:现有表格之外新增 IC 时序趋势图(依赖后端返回逐期 IC 或前端按窗口聚合)。
- **参数扫描 / Walk-forward 增强**:阈值/费用/滑点网格输入滑杆化可编辑;walk-forward 折数 `n_splits` 暴露。
- **修复**:`result.error`(pipeline 级错误)透出为错误横幅,不再静默吞掉;legacy 历史记录点击时给出明确提示而非空态。
- **后端**:webapi 透传模型超参白名单(`C`/`max_iter`/`solver`/`max_depth`/`learning_rate`/`min_samples_leaf`)与 `init_cash`/`size`;`run_pipeline` 返回 `coef_`/`feature_importances_`/`roc_curve`(fpr/tpr);`backtest` 返回 `benchmark` 序列。

## Capabilities

### New Capabilities

- `quant-model-control`: 模型超参交互——lr/hgb 切换、滑杆参数、StandardScaler 开关、4 套预设模板(稳健 lr/激进 lr/HGB 快速/自定义)及回测执行参数(init_cash/size)。
- `quant-signal-kline`: QUANT LAB 内独立 K 线信号图——自包含 KLineChartProView + BitgetDatafeed,回测 signal 买卖点 overlay,回测完成自动定位到该 tab。
- `quant-model-diagnostics`: 模型诊断可视化——ROC 曲线(AUC)、特征权重条形图(lr 系数 / hgb 重要性)。

### Modified Capabilities

- `quant-lab-panel`: 面板新增"信号K线"与"模型诊断"tab;回测完成后自动切换 tab;参数条滑杆化。
- `backtest-analysis-ui`: 权益曲线叠加基准、proba+阈值带、月度收益热力图;错误横幅透出 pipeline 错误。
- `ml-model`: 模型参数从"仅 kind"扩展为完整超参集,前端预设模板 + 滑杆交互,后端返回特征权重与 ROC。
- `quant-parameter-sweep`: 阈值/费用/滑点输入可编辑(滑杆),不再硬编码。
- `quant-walk-forward`: 折数 `n_splits` 可调。
- `quant-factor-ic`: 新增 IC 时序趋势可视化。
- `backtest-history`: legacy 记录点击提示明确;`result.error` 记录不做回看混淆。

## Impact

- **前端**: `QuantLabPanel.tsx`(新 tab 与自动切换)、新增 `ModelPanel.tsx`(滑杆+预设)、`SignalKLineChart.tsx`(独立 K 线 + overlay)、`ModelDiagnostics.tsx`(ROC/特征权重)、`FactorIcChart.tsx`(IC 时序)、`BacktestControls.tsx` 滑杆化、`SweepView.tsx`/`WalkForwardView.tsx` 输入可编辑、`api/client.ts` + `api/types.ts`(新字段与参数)。
- **后端**: `webapi.py`(超参/资金/仓位白名单透传)、`dlquant.py`(coef_/feature_importances_/roc_curve/benchmark 输出)、`backtest_history.py`(新字段持久化,可选)。
- **测试**: `test_dlquant.py`/`test_webapi.py`(新输出字段与透传)、`test_live_api.py`(回归)、前端 `ModelPanel`/`SignalKLineChart`/`ModelDiagnostics` 组件测试、`QuantLabPanel.test.tsx` 扩展、L3 e2e 更新。
- **依赖**: 无新增;复用现有 `klinecharts`/`@klinecharts/pro`/`recharts`/`@radix-ui/react-slider`。
