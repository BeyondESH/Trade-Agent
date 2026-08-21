# quant-lab-panel Specification

## Purpose
TBD - created by archiving change quant-lab-ui-panel. Update Purpose after archive.
## Requirements
### Requirement: QUANT LAB 单入口与 Tabs 分层

系统 SHALL 提供单一「QUANT LAB」面板,合并原 DlQuantTab 与 BacktestTab 的全部能力,并以 Tabs 分层组织:曲线分析、参数扫描、Walk-forward、因子 IC、开单明细、历史。各 tab SHALL 共享同一标的/周期/区间/模型/参数状态。

#### Scenario: 合并后单入口

- **WHEN** 用户进入 AI Agent 页面
- **THEN** 原「DL 量化」与「回测」两个独立 tab 入口 SHALL 合并为单一 QUANT LAB 面板
- **AND** 面板内 SHALL 以 Tabs 呈现曲线分析/参数扫描/Walk-forward/因子 IC/开单明细/历史六个视图

#### Scenario: 参数状态共享

- **WHEN** 用户在任一 tab 切换标的/周期/区间
- **THEN** 其余 tab 与参数条 SHALL 使用同一状态,无需重复设置

### Requirement: shadcn/ui 组件接入与主题融合

系统 SHALL 引入 shadcn/ui 组件体系(Radix 原语 + 拷贝组件)构建 QUANT LAB 视图,新增组件 SHALL 使用 `--tv-*` 设计 token 并支持 dark/light 双主题,不得硬编码颜色。控件原语(`ui.tsx`)SHALL 迁移或保持兼容层。

#### Scenario: 组件库接入

- **WHEN** 安装 @radix-ui/react-* 与 shadcn 组件
- **THEN** QUANT LAB 的按钮/卡片/表格/Tooltip/Slider SHALL 使用 shadcn/ui 组件,且与现有 TradingView 色板风格一致

#### Scenario: 双主题与 token

- **WHEN** 在 dark/light 间切换主题
- **THEN** 新增 shadcn 组件 SHALL 随 `--tv-*` token 切换,布局尺寸不变

### Requirement: KPI 指标卡组完整展示

QUANT LAB SHALL 渲染完整绩效指标卡组:总收益、最大回撤、Sharpe、Sortino、Calmar、Profit Factor、胜率、交易次数、模型 AUC、模型 LogLoss。前五项源自 `/backtest` 返回的 `stats`,AUC/LogLoss 源自 `model_metrics`,缺失字段 SHALL 以占位展示而非报错。

#### Scenario: stats 全量展示

- **WHEN** 回测结果含 stats 且含 Sharpe/Sortino/Calmar/profit_factor
- **THEN** 指标卡组 SHALL 渲染全部四个风险调整指标

#### Scenario: model_metrics 展示

- **WHEN** 回测结果含 model_metrics
- **THEN** 指标卡组 SHALL 渲染 roc_auc 与 log_loss,缺失字段显示占位符

#### Scenario: 字段缺失降级

- **WHEN** stats 或 model_metrics 字段缺失(如旧引擎结果)
- **THEN** 对应指标卡 SHALL 显示占位符而不渲染异常值或抛错

### Requirement: 曲线分析视图

曲线分析 tab SHALL 渲染权益曲线、回撤曲线与测试集信号标记,并基于 `series.proba` 渲染模型概率分布直方图;数据不足时显示空态。

#### Scenario: 权益与回撤曲线

- **WHEN** series 含 equity 与 drawdown 序列
- **THEN** 曲线分析 tab SHALL 渲染两条曲线,样式沿用现有 SeriesChart/EconCharts

#### Scenario: 概率分布直方图

- **WHEN** series.proba 非空且点数足够分桶
- **THEN** 曲线分析 tab SHALL 渲染 proba 分布直方图,直观呈现模型置信度分布

#### Scenario: 空态

- **WHEN** 曲线序列点数不足
- **THEN** 显示空态提示而非空白或崩溃

### Requirement: 因子 IC 视图迁移

因子 IC 视图 SHALL 从 FactorIcTable 迁移,保留因子启用集、IC/|IC|/覆盖率/均值/末值展示与排序交互,并支持时间区间。

#### Scenario: 迁移后行为保持

- **WHEN** 用户切换因子启用集或时间区间后请求分析
- **THEN** 因子 IC 表 SHALL 按现有行为刷新并展示各因子 IC 指标

### Requirement: 新增信号K线与模型诊断 tab

QUANT LAB SHALL 在现有 tab 结构(曲线分析/参数扫描/Walk-forward/因子 IC/开单明细/历史)基础上新增「信号K线」与「模型诊断」两个视图,共享同一标的/周期/区间/模型/参数状态。

#### Scenario: 新 tab 可见且共享状态

- **WHEN** 用户进入 QUANT LAB
- **THEN** SHALL 看到「信号K线」与「模型诊断」tab,且其内容 SHALL 使用参数条当前状态

### Requirement: Tab 受控化与自动跳转

QUANT LAB 的 tab 激活状态 SHALL 由受控状态管理(非默认值模式),以支持编程切换;回测成功完成后 SHALL 自动激活「信号K线」tab。

#### Scenario: 运行成功后自动激活信号K线

- **WHEN** 回测 job 完成且返回有效结果
- **THEN** 激活 tab SHALL 变为「信号K线」

#### Scenario: 手动切换仍可用

- **WHEN** 用户点击任意 tab
- **THEN** 激活状态 SHALL 切换为用户所选 tab,且后续运行成功会再次自动跳转

### Requirement: 参数条滑杆化

QUANT LAB 参数条中连续型参数(训练比例/信号阈值/手续费/滑点,及模型超参)SHALL 以滑杆 + 数字输入双模式呈现,替代纯数字输入框;滑杆 SHALL 提供合理取值范围与刻度。

#### Scenario: 滑杆调节参数

- **WHEN** 用户拖动「信号阈值」滑杆
- **THEN** 数字输入框 SHALL 同步显示新值,后续回测 SHALL 使用该阈值

### Requirement: Pipeline 级错误横幅透出

QUANT LAB SHALL 将 `job.result.error`(pipeline 级失败,如特征行不足)透出为错误横幅;回测结果状态 SHALL 不因 pipeline 错误而渲染空图表。

#### Scenario: pipeline 错误透出

- **WHEN** 回测 job 状态为 done 但其 result 含 error 字段
- **THEN** QUANT LAB SHALL 显示该错误信息横幅,且不渲染基于缺失 series 的图表

#### Scenario: 历史 legacy 记录提示

- **WHEN** 用户点击 history 中的 legacy 记录
- **THEN** SHALL 明确提示该记录来自旧引擎且不可回看图形,而非渲染空图表

