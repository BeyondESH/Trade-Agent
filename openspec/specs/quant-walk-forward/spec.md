# quant-walk-forward Specification

## Purpose
TBD - created by archiving change quant-lab-ui-panel. Update Purpose after archive.
## Requirements
### Requirement: walk-forward 后端接口

系统 SHALL 提供 `POST /backtest/walkforward` 接口,接收与 `/backtest` 相同的序列引用、窗口、周期、因子集、模型参数及折数(`n_splits`,默认基于数据量自适应),使用 `TimeSeriesSplit` 多折训练并逐折执行回测,返回每折的训练/测试区间与指标。响应 SHALL 含 `folds` 数组与 `data_meta`。

#### Scenario: 多折返回

- **WHEN** 客户端请求 walk-forward
- **THEN** 响应 SHALL 返回每折:train_start/train_end/test_start/test_end(open_time)与 total_return/max_drawdown/win_rate/trades/roc_auc/log_loss

#### Scenario: 测试区间严格晚于训练

- **WHEN** 任一折
- **THEN** 该折测试区间 SHALL 严格晚于其训练区间(时间单调递增,无泄漏)

#### Scenario: 数据不足

- **WHEN** 特征化后有效样本不足以支撑请求折数
- **THEN** 接口 SHALL 返回 422 错误并提示可用的最小样本要求

#### Scenario: 窗口与周期校验

- **WHEN** 提交非法窗口或周期
- **THEN** 接口 SHALL 复用与 `/backtest` 相同的校验逻辑并返回 422

### Requirement: walk-forward 前端视图

Walk-forward tab SHALL 渲染折指标表(折次/训练区间/测试区间/AUC/收益/回撤/胜率)与区间可视化条,直观对比各折稳定性;数据不足或失败 SHALL 显示空态/错误。

#### Scenario: 折指标表

- **WHEN** walk-forward 结果含多折
- **THEN** 前端 SHALL 渲染每折的训练/测试时间区间与指标列

#### Scenario: 区间可视化条

- **WHEN** 存在多折数据
- **THEN** 前端 SHALL 渲染横向区间条,展示各折训练段与测试段在总时间轴上的位置关系

#### Scenario: 空态与错误

- **WHEN** 未执行、结果为错误或无折数据
- **THEN** 显示对应空态/错误提示

### Requirement: 折数可调

QUANT LAB Walk-forward 视图 SHALL 提供折数 `n_splits` 输入(滑杆或数字),默认值与现状一致(后端按数据量自适应);提交时 SHALL 将所选折数传给后端;后端数据不足无法满足折数时 SHALL 返回明确错误并透出到 UI。

#### Scenario: 自定义折数

- **WHEN** 用户将折数设为 8 并运行 Walk-forward
- **THEN** 请求 SHALL 携带 `n_splits=8`,结果表 SHALL 渲染 8 折指标

#### Scenario: 折数非法或数据不足

- **WHEN** 请求折数超过数据可切分上限
- **THEN** 后端 SHALL 返回错误信息,前端 SHALL 以横幅展示而非崩溃

