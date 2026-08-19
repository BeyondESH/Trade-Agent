## MODIFIED Requirements

### Requirement: 界面顶部 + 号新增 Dashboard 标签页
系统 SHALL 以顶栏 `+` 号作为新增标签入口:点击 `+` 号 SHALL NOT 弹出基于 `absolute` 下拉的"Open Workspace"菜单(该方案因被 `overflow-x-auto` 容器裁剪无效且引发滚动条),而是 SHALL 新增一个 `dashboard` 类型标签页并激活显示。顶栏标签栏容器保持 `overflow-x-auto`,但 SHALL NOT 因承载下拉菜单而在无溢出时产生滚动条。标签栏 SHALL 占满标题栏左侧可用宽度;当标签内容超出可视区域时,系统 SHALL 允许横向滚动且 SHALL 保证新激活的标签自动滚动进入可视区,SHALL NOT 因此限制可创建的标签数量。

#### Scenario: 点击+号新增标签
- **WHEN** 用户在顶栏点击 `+` 号
- **THEN** 系统 SHALL 新增一个 Dashboard 标签页并激活显示,且 SHALL NOT 出现水平或垂直滚动条,也 SHALL NOT 打开任何无效下拉菜单

#### Scenario: +号不被下拉裁剪
- **WHEN** 用户点击 `+` 号后查看工作区
- **THEN** 顶栏标签栏 SHALL 正常新增标签,Dashboard 视图 SHALL 完整可见,无被裁剪内容

#### Scenario: 新增标签自动滚入可视区
- **WHEN** 标签栏内容已横向溢出时新增标签（或点击切换任一标签）
- **THEN** 被激活的标签 SHALL 自动滚动进入可视区域
- **AND** 标签栏 SHALL 占满标题栏左侧可用宽度
- **AND** 标签数量 SHALL 不受可视宽度限制,标签过多时可横向滚动查看

#### Scenario: 切换旧标签就近滚入
- **WHEN** 用户点击可视区外的旧标签
- **THEN** 该标签 SHALL 以就近方式滚入可视区（已在可视区内时滚动位置 SHALL 保持不变）
