## ADDED Requirements

### Requirement: 可配置因子集

系统 SHALL 按用户配置的因子集构造特征矩阵;未提供配置时 SHALL 使用默认 7 因子且行为与现状完全一致。

#### Scenario: 缺省因子集

- **WHEN** build_features 不传因子配置
- **THEN** 输出特征列与标签 SHALL 与当前默认 7 因子完全一致

#### Scenario: 自定义因子集

- **WHEN** 因子配置中列出若干启用的 preset 与 expr 因子
- **THEN** build_features SHALL 仅返回这些因子的特征列(以及标签),并按既有逻辑丢弃含 NaN 的行

### Requirement: 预设因子目录

系统 SHALL 提供预设因子目录(现有 7 因子 + RSI/ATR/成交量比/动量等),支持以数字参数实例化。

#### Scenario: 目录实例化

- **WHEN** 启用 preset 因子 `{fn: "rsi", params: {period: 14}}`
- **THEN** 特征列 SHALL 等于 rsi(close, 14) 的逐 bar 值,且无前视

### Requirement: 白名单表达式因子

系统 SHALL 以白名单方式求值自定义因子表达式(允许列名、算术运算与安全函数),并拒绝白名单之外的任何内容。

#### Scenario: 合法表达式

- **WHEN** 配置表达式 `log(close / sma(close, 20))`
- **THEN** 系统 SHALL 计算出该列并作为特征参与训练

#### Scenario: 拒绝非法表达式

- **WHEN** 表达式含 `__`、方法链 `.`、`import`、字符串字面量或未知函数
- **THEN** 系统 SHALL 拒绝该表达式并返回明确错误,且 MUST NOT 执行任何代码

#### Scenario: 表达式确定性

- **WHEN** 相同表达式与相同数据求值两次
- **THEN** 两次结果 SHALL 完全一致

### Requirement: 因子 IC 分析

系统 SHALL 提供 POST /dl/features,返回每个因子的 IC(Spearman 秩相关,与下一根方向标签)、IC_abs、均值、标准差、覆盖率与末行值。

#### Scenario: 因子排序

- **WHEN** 以某因子配置调用 /dl/features
- **THEN** 系统 SHALL 返回各因子的 ic、ic_abs、coverage、last_value
- **AND** 前端 SHALL 以可排序表格渲染

#### Scenario: 覆盖率

- **WHEN** 某因子大部分为 NaN
- **THEN** 其 coverage SHALL 反映非 NaN 比例,且仍列于结果中

### Requirement: 因子驱动训练

系统 SHALL 允许以选定因子集训练并回测(POST /backtest body 接受可选 factors 与训练参数)。

#### Scenario: 按因子集训练

- **WHEN** /backtest body 含启用因子列表与训练参数
- **THEN** 服务端 SHALL 以该因子集构造特征、训练并回测
- **AND** 结果含与所选因子集对应的指标与曲线序列

### Requirement: 因子配置持久化

系统 SHALL 将因子配置持久化于 /config(config.json);缺省无 factors 键时 SHALL 解析为默认因子集。

#### Scenario: 保存并回读

- **WHEN** 用户在因子管理面板编辑并保存
- **THEN** /config SHALL 包含更新后的 factors
- **AND** 后续读取 SHALL 返回该配置

#### Scenario: 旧配置兼容

- **WHEN** 配置文件无 factors 键
- **THEN** 系统 SHALL 无报错地按默认因子集处理
