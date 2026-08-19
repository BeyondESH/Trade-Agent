# alert-modal-price-prefill Specification

## Purpose
TBD - created by archiving change fix-alert-modal-price-prefill. Update Purpose after archive.
## Requirements
### Requirement: 每次打开预填价格

系统 SHALL 在每次打开创建警报弹窗时，以当前指定的预填价格初始化价格输入框；预填价格来自图表右键菜单传入的 `initialPrice`；未指定预填价格时 SHALL 回退到当前品种价格。

#### Scenario: 右键设置警报预填

- **WHEN** 用户通过图表右键菜单「在此设置价格警报 $X」打开创建警报弹窗
- **THEN** 价格输入框 SHALL 自动填入 $X

#### Scenario: 无预填回退当前价

- **WHEN** 通过铃铛/侧栏入口打开创建警报弹窗且无预填价格
- **THEN** 价格输入框 SHALL 填入当前品种价格

#### Scenario: 关闭后再次打开仍生效

- **WHEN** 用户打开弹窗后关闭，再次通过右键菜单设置价格警报
- **THEN** 价格输入框 SHALL 填入最近一次右键选择的价格

### Requirement: 打开即全新表单

系统 SHALL 在每次打开创建警报弹窗时将条件、触发频率与备注重置为默认值，不保留上次会话的编辑内容。

#### Scenario: 字段重置

- **WHEN** 用户在弹窗中修改条件/频率/备注后关闭，再重新打开
- **THEN** 条件 SHALL 为 "Crossing"，频率 SHALL 为 "Only Once"，备注 SHALL 为空

### Requirement: 提交阈值与预填一致

系统 SHALL 在提交警报时将价格输入框当前值作为警报阈值。

#### Scenario: 提交预填价格

- **WHEN** 用户右键设置价格警报后直接提交
- **THEN** `onAddAlert` 回调的 `targetPrice` SHALL 等于预填价格

