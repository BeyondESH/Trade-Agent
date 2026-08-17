## ADDED Requirements

### Requirement: 全屏品种搜索弹窗

系统 SHALL 提供居中全屏品种搜索弹窗（Modal，圆角 8px、浮层阴影），包含搜索输入框、市场类型 tab（全部 / 现货 / U合约 / USDC / 币本位 / 杠杆）与结果表；结果数据源 SHALL 为 datafeed `searchSymbols`（基于 `/instruments` 的单一入口），每行 SHALL 展示 symbol、品类与价格/数量精度。

#### Scenario: 打开与聚焦

- **WHEN** 点击顶栏品种按钮或按下 `,`
- **THEN** 弹窗 SHALL 居中打开并自动聚焦搜索输入框

#### Scenario: 品类 tab 过滤与搜索

- **WHEN** 输入关键字并切换市场类型 tab
- **THEN** 结果表 SHALL 仅展示匹配且属于该品类的 symbol（含对应精度），且结果随输入实时更新

#### Scenario: 选中联动

- **WHEN** 点击结果表某行（或键盘高亮行回车）
- **THEN** 弹窗 SHALL 关闭，顶栏品种、图表、右栏与状态栏 SHALL 按 `category:instId` 切换到该品种并采用其精度

#### Scenario: 关闭方式

- **WHEN** 按下 Esc 或点击遮罩
- **THEN** 弹窗 SHALL 关闭且不改变当前品种

### Requirement: 搜索弹窗键盘操作

系统 SHALL 支持结果表的键盘导航：上/下方向键移动高亮行，回车选中，Esc 关闭。

#### Scenario: 键盘导航选中

- **WHEN** 在结果输入框按方向键至目标行并回车
- **THEN** SHALL 选中高亮行对应的品种并关闭弹窗
