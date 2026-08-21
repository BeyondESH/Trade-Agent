# quant-signal-kline Specification

## Purpose
QUANT LAB 内新增自包含 K 线信号图:独立 KLineChartProView 模块显示当前标的/周期行情,回测完成后把 `series.signal` 的多空买卖点叠加为 overlay 标记,并自动切换到该 tab 让用户第一眼看到交易位置。

## ADDED Requirements

### Requirement: QUANT LAB 内独立 K 线模块

QUANT LAB SHALL 提供「信号K线」视图,内嵌自包含 `KLineChartProView` 模块:其 symbol/timeframe SHALL 跟随 QUANT LAB 参数条当前值,datafeed SHALL 使用 QUANT LAB 私有的 `BitgetDatafeed` 实例,SHALL 不与主界面其他 K 线图共享订阅或联动。

#### Scenario: 跟随参数条

- **WHEN** 用户在 QUANT LAB 参数条切换标的或周期
- **THEN** 「信号K线」视图 SHALL 切换为对应标的/周期的行情,加载其历史与实时数据

#### Scenario: 独立实例不联动主图

- **WHEN** QUANT LAB 与主界面 K 线图同时存在
- **THEN** 两者 SHALL 各自独立加载与订阅数据,任一方的标的/周期切换不改变另一方

### Requirement: 回测买卖标记叠加

回测成功后,「信号K线」视图 SHALL 依据 `result.series.signal` 在当前 K 线上叠加买卖标记:`signal==1` 处 SHALL 标记多单,`signal==-1` 处 SHALL 标记空单,标记位置按 `series.open_time` 对齐到对应 K 线;多空 SHALL 使用不同颜色与朝向以便区分。

#### Scenario: 多空标记渲染

- **WHEN** 回测结果含 signal 序列且含 +1 与 -1 值
- **THEN** K 线图上 SHALL 在对应时间点渲染多单标记与空单标记,颜色分别采用多/空语义色

#### Scenario: 无信号不渲染

- **WHEN** 回测结果 signal 序列全为 0 或缺失
- **THEN** K 线图 SHALL 正常显示行情且不渲染任何买卖标记

### Requirement: 回测完成自动定位信号K线

QUANT LAB 运行回测成功后 SHALL 自动切换到「信号K线」tab,使用户立即看到买卖点;回测失败或取消时 SHALL 不切换。

#### Scenario: 成功自动跳转

- **WHEN** 用户在任意 tab 点击运行且回测成功返回结果
- **THEN** QUANT LAB SHALL 自动激活「信号K线」tab

#### Scenario: 失败不跳转

- **WHEN** 回测 job 失败或返回 pipeline 错误
- **THEN** tab 保持当前激活状态,错误 SHALL 以横幅展示
