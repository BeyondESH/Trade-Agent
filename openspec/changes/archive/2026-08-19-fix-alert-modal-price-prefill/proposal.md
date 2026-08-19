# Fix Alert Modal Price Prefill

## Why

通过图表右键菜单「在此设置价格警报 $X」打开创建警报弹窗时，价格输入框没有填入右键选择的位置价格（显示为默认 0/空值），需要手动填写，破坏「右键设警报」的快捷交互。根因：`CreateAlertModal` 在 App 中无条件渲染（`isOpen=false` 时仅内部 `return null`，组件实例不卸载），`useState(initialPrice ?? symbol.price)` 只在首次挂载时求值一次，后续 `initialPrice` 变化永不生效。

## What Changes

- `App.tsx`：将 `<CreateAlertModal>` 改为条件渲染（`{isAlertOpen && <CreateAlertModal ... />}`），使弹窗每次打开都重新挂载，`initialPrice` 重新参与初始化。
- `CreateAlertModal.tsx`：内部 `if (!isOpen) return null` 保留作为防御（App 已保证打开时才渲染）；`useState` 初始化逻辑不变。
- 行为校验：右键设置警报 → 价格框预填右键价格；铃铛/侧栏打开 → 回退当前 `symbol.price`；提交后创建警报阈值 = 预填价格。
- 补 `CreateAlertModal` 集成测试：多次打开（先关闭再打开）时 `initialPrice` 正确生效。

## Capabilities

### New Capabilities

- `alert-modal-price-prefill`: 创建警报弹窗每次打开时正确预填价格（右键价格优先，否则当前价），表单字段随重新挂载重置为默认。

### Modified Capabilities

<!-- 无既有 spec 行为变更 -->

## Impact

- `frontend/src/App.tsx`：CreateAlertModal 条件渲染（1 行）。
- `frontend/src/components/modals/CreateAlertModal.tsx`：无逻辑改动（可选清理 `isOpen` 防御保留）。
- `frontend/src/components/modals/CreateAlertModal.test.tsx`：新增多次打开预填测试。
- 无后端/依赖变更。
