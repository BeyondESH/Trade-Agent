## ADDED Requirements

### Requirement: 已固定级别常驻显示

周期栏 SHALL 仅将用户已固定(pin)的时间级别渲染为常驻按钮。点击常驻按钮 SHALL 切换图表至该时间级别,当前生效级别 SHALL 有区别于其他级别的选中态。

#### Scenario: 常驻栏渲染已固定级别

- **WHEN** 周期栏渲染
- **THEN** SHALL 显示且仅显示当前已固定的时间级别按钮
- **AND** 未固定的级别 MUST NOT 出现在常驻栏

#### Scenario: 点击常驻按钮切换级别

- **WHEN** 用户点击某个常驻级别按钮
- **THEN** 图表 SHALL 切换至该时间级别
- **AND** 该按钮 SHALL 呈现选中态

#### Scenario: 默认固定级别

- **WHEN** 用户从未修改过固定偏好
- **THEN** 常驻栏 SHALL 显示默认固定级别:1 分钟、15 分钟、1 小时、6 小时、1 天、1 周、1 月

### Requirement: 扩展弹窗展示全部级别

周期栏 SHALL 在常驻级别之后提供扩展按钮。点击该按钮 SHALL 打开弹窗,弹窗 SHALL 展示时间级别原生全集,并按时间单位分组(秒、分钟、小时、天、周月)。扩展按钮 SHALL 始终可见,不随固定级别数量变化而隐藏。

#### Scenario: 打开扩展弹窗

- **WHEN** 用户点击扩展按钮
- **THEN** SHALL 打开弹窗并展示原生全集中的所有时间级别
- **AND** 级别 SHALL 按时间单位分组呈现

#### Scenario: 弹窗内切换级别

- **WHEN** 用户在弹窗内点击某个时间级别
- **THEN** 图表 SHALL 切换至该级别

#### Scenario: 弹窗标示固定状态

- **WHEN** 弹窗展示各时间级别
- **THEN** 每个级别 SHALL 标示其当前是否已被固定

#### Scenario: 扩展按钮恒常可见

- **WHEN** 无论已固定级别数量为多少(含为零)
- **THEN** 扩展按钮 SHALL 保持可见且可点击

### Requirement: 自定义固定级别

用户 SHALL 能在扩展弹窗内为任一时间级别添加或取消固定。固定状态变更 SHALL 立即反映到常驻栏,无需重新加载图表,且 MUST NOT 改变当前生效的时间级别。

#### Scenario: 添加固定

- **WHEN** 用户在弹窗内固定一个原未固定的级别
- **THEN** 该级别 SHALL 立即出现在常驻栏

#### Scenario: 取消固定

- **WHEN** 用户在弹窗内取消一个已固定的级别
- **THEN** 该级别 SHALL 立即从常驻栏移除

#### Scenario: 固定变更不影响当前级别

- **WHEN** 用户添加或取消固定
- **THEN** 图表当前生效的时间级别 SHALL 保持不变
- **AND** MUST NOT 触发数据重新加载

#### Scenario: 取消当前生效级别的固定

- **WHEN** 用户取消当前正在生效级别的固定
- **THEN** 该级别 SHALL 从常驻栏移除
- **AND** 图表 SHALL 继续显示该级别的数据

### Requirement: 允许固定级别为空

系统 SHALL 允许用户取消所有固定级别。固定级别为空时,常驻栏 SHALL 仅保留扩展按钮,且布局 MUST 保持完整不塌陷。

#### Scenario: 全部取消固定

- **WHEN** 用户取消所有已固定级别
- **THEN** 常驻栏 SHALL 不显示任何级别按钮
- **AND** 扩展按钮 SHALL 仍然可见可点击

#### Scenario: 空固定态布局完整

- **WHEN** 固定级别为空且周期栏渲染
- **THEN** 周期栏布局 SHALL 保持完整,相邻元素间距与分隔 MUST NOT 出现异常

#### Scenario: 从空态恢复固定

- **WHEN** 固定级别为空时用户在弹窗内固定一个级别
- **THEN** 该级别 SHALL 出现在常驻栏

### Requirement: 固定偏好持久化

固定级别偏好 SHALL 持久化于浏览器本地存储,作用域为全局用户偏好,MUST NOT 随品种或时间级别而区分。页面重新加载后 SHALL 恢复用户上次的固定配置。存储不可用或内容损坏时 SHALL 回退到默认固定级别而非报错。

#### Scenario: 重新加载后保持

- **WHEN** 用户修改固定配置后重新加载页面
- **THEN** 常驻栏 SHALL 恢复用户上次的固定配置

#### Scenario: 偏好跨品种共享

- **WHEN** 用户切换到另一个品种
- **THEN** 固定配置 SHALL 保持一致,MUST NOT 因品种不同而不同

#### Scenario: 存储内容损坏时回退

- **WHEN** 本地存储中的固定偏好无法解析
- **THEN** 系统 SHALL 回退到默认固定级别
- **AND** MUST NOT 抛出异常或导致周期栏无法渲染

#### Scenario: 存储不可用时可用

- **WHEN** 浏览器本地存储不可写
- **THEN** 周期栏 SHALL 仍可正常渲染与切换级别
- **AND** 固定变更在当前会话内 SHALL 生效
