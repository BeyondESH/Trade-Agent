## ADDED Requirements

### Requirement: 仅实时级别的定义

系统 SHALL 将交易所仅提供实时推送、不提供历史查询的时间级别标记为「仅实时级别」。秒级 SHALL 被标记为仅实时级别。系统 SHALL 依据该标记决定是否发起历史请求、是否落盘、是否参与回灌。

#### Scenario: 秒级被标记为仅实时

- **WHEN** 查询秒级是否为仅实时级别
- **THEN** 系统 SHALL 判定为真

#### Scenario: 其他级别不受影响

- **WHEN** 查询分钟级至月级中任一级别是否为仅实时级别
- **THEN** 系统 SHALL 判定为假
- **AND** 这些级别的历史加载、落盘与回灌行为 SHALL 保持不变

### Requirement: 仅实时级别不请求历史

对仅实时级别,系统 MUST NOT 向交易所历史接口发起请求。图表请求该级别历史数据时 SHALL 直接返回空结果,MUST NOT 产生失败请求或错误提示。

#### Scenario: 历史请求被短路

- **WHEN** 图表请求仅实时级别的历史 K 线
- **THEN** 系统 SHALL 返回空结果
- **AND** MUST NOT 向交易所历史接口发起请求

#### Scenario: 无失败请求噪音

- **WHEN** 用户切换至仅实时级别
- **THEN** MUST NOT 出现因历史接口不支持该级别而产生的失败请求或错误提示

#### Scenario: 不触发深度回灌

- **WHEN** 图表在仅实时级别向更早方向滚动
- **THEN** 系统 MUST NOT 触发历史回灌或后台预取

### Requirement: 仅实时级别不落盘

系统 MUST NOT 将仅实时级别的 K 线写入持久化存储,且 MUST NOT 将其纳入定时抓取任务。

#### Scenario: 不写入存储

- **WHEN** 仅实时级别的实时 K 线到达
- **THEN** 系统 SHALL 仅在内存中用于图表渲染
- **AND** MUST NOT 写入持久化存储

#### Scenario: 不纳入定时抓取

- **WHEN** 定时抓取任务运行
- **THEN** 其抓取的时间级别集合 MUST NOT 包含仅实时级别

### Requirement: 仅实时级别的实时订阅

系统 SHALL 支持订阅仅实时级别的实时 K 线推送,并将其正确路由至对应级别的订阅方。仅实时级别的推送 MUST NOT 泄漏至其他时间级别的订阅方。

#### Scenario: 订阅秒级推送

- **WHEN** 图表切换至秒级
- **THEN** 系统 SHALL 建立该品种秒级的实时订阅
- **AND** 推送到达时 SHALL 更新图表最后一根蜡烛

#### Scenario: 级别间不串流

- **WHEN** 同时存在秒级与其他级别的订阅
- **THEN** 秒级推送 MUST NOT 被投递给其他级别的订阅方

#### Scenario: 切离后释放订阅

- **WHEN** 图表从仅实时级别切换至其他级别
- **THEN** 系统 SHALL 释放该仅实时级别的订阅

### Requirement: 仅实时级别的界面标示

周期选择器 SHALL 对仅实时级别给出可识别的标示,使用户在选择前即可知晓该级别无历史数据。

#### Scenario: 弹窗内标示仅实时

- **WHEN** 扩展弹窗展示仅实时级别
- **THEN** SHALL 以可识别的方式标示其为仅实时

#### Scenario: 空图起始可被理解

- **WHEN** 用户切换至仅实时级别且尚无推送到达
- **THEN** 图表 SHALL 呈现无历史数据的状态
- **AND** MUST NOT 呈现为加载失败或错误
