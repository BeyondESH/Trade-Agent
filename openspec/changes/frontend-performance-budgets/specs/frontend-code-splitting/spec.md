## ADDED Requirements

### Requirement: 初始 JS 体积上限

前端首屏初始 JS 体积 SHALL 设定显式上限并纳入校验。上限 SHALL 依据拆分后的实测体积确定，MUST NOT 依据拆分前的单块体积。

#### Scenario: 初始块体积受限
- **WHEN** 执行生产构建
- **THEN** 首屏加载的初始 JS 体积 SHALL 不超过既定上限，超限 SHALL 失败

#### Scenario: 上限基于拆分后实测
- **WHEN** 首次设定体积上限
- **THEN** 该数值 SHALL 来自拆分改造完成后的实测体积，MUST NOT 取自拆分前的 975 KB 级单块体积

### Requirement: 视图按需加载

每个视图 SHALL 被构建为独立按需加载的代码块；仅被当前视图需要的代码 SHALL NOT 出现在首屏初始块中。

#### Scenario: 视图独立成块
- **WHEN** 检查生产构建产物
- **THEN** 每个视图 SHALL 对应独立的构建产物分块，且分块 SHALL 在进入该视图时才被请求

#### Scenario: 首屏不加载非当前视图
- **WHEN** 应用以图表视图为首屏启动并观察网络请求
- **THEN** MUST NOT 请求其他视图专属的代码分块

### Requirement: 重型依赖与初始块隔离

重型第三方依赖（图表库及其扩展、可视化库等）SHALL NOT 位于首屏初始块中，SHALL 随其使用方按需加载。

#### Scenario: 图表库不在初始块
- **WHEN** 审查首屏初始分块的依赖构成
- **THEN** 图表渲染库与可视化库 SHALL 不在初始分块内，而位于按需加载的分块中

#### Scenario: 未使用重型库的视图不受其成本影响
- **WHEN** 进入不使用图表渲染库的视图
- **THEN** 该视图 SHALL 不需要下载或解析图表渲染库

### Requirement: 按需加载的稳定性

按需加载 SHALL NOT 引入布局位移或长时间空白：加载期间 SHALL 提供占位（骨架）以避免内容跳变；拆分改造 SHALL 伴随 CLS 复测，CLS SHALL NOT 相对拆分前劣化。

#### Scenario: 加载期间有占位
- **WHEN** 某视图的代码分块正在加载
- **THEN** 界面 SHALL 显示占位内容而非空白或跳变

#### Scenario: 拆分不劣化 CLS
- **WHEN** 完成按需加载改造后复测 CLS
- **THEN** CLS SHALL NOT 高于改造前的实测值
