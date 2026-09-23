## MODIFIED Requirements

### Requirement: 右键上下文菜单

系统 SHALL 在图表任意位置右键弹出上下文菜单（在此价格创建警报 / 添加指标 / 复制价格 / 设置 / 重置视图），菜单位置跟随光标，左侧保留 icon 槽、右侧显示快捷键；点击外部 SHALL 关闭。五项均 SHALL 绑定真实行为：创建警报 SHALL 以光标价格预填并打开创建警报弹窗；添加指标 SHALL 打开 klinecharts-pro 原生指标选择弹窗；复制价格 SHALL 将光标价格写入剪贴板并给出反馈；设置 SHALL 打开图表/应用设置入口；重置视图 SHALL 将图表视图复位到最新行情/默认缩放。

#### Scenario: 菜单弹出与动作

- **WHEN** 右键点击图表某价格位置并选择"在此价格创建警报"
- **THEN** SHALL 弹出菜单，并基于该价格预填创建警报；选择其余项 SHALL 执行对应动作

#### Scenario: 添加指标

- **WHEN** 在右键菜单点击"添加指标"
- **THEN** SHALL 打开指标选择弹窗，选择后 SHALL 在图表上即时生效

#### Scenario: 复制价格

- **WHEN** 在右键菜单点击"复制价格"
- **THEN** 光标处价格 SHALL 被写入剪贴板，且 SHALL 关闭菜单

#### Scenario: 设置与重置视图

- **WHEN** 在右键菜单点击"设置"或"重置视图"
- **THEN** "设置" SHALL 打开设置入口；"重置视图" SHALL 将图表视图复位（回到最新 K 线/默认缩放），二者均 SHALL 关闭菜单

#### Scenario: 五项完整

- **WHEN** 打开右键菜单
- **THEN** 菜单 SHALL 呈现创建警报 / 添加指标 / 复制价格 / 设置 / 重置视图五项，MUST NOT 仅呈现其中部分
