# Design: Fix Alert Modal Price Prefill

## Context

`CreateAlertModal` 在 `App.tsx` 中无条件渲染：`<CreateAlertModal isOpen={isAlertOpen} ... />`，关闭时组件内部 `return null` 但实例保持挂载。`useState(initialPrice ?? Number(symbol.price.toFixed(symbol.digits)))` 仅在 App 首次挂载时初始化一次（此时 `alertPrefillPrice=null`、`symbol=DEFAULT_SYMBOL(price:0)`），因此右键菜单传入的 `initialPrice` 从不生效，价格框停留在初始的 0。

探索阶段确认 `App.tsx:883` 已正确传递 `initialPrice={alertPrefillPrice ?? undefined}`，`NativeChart` → `onCreateAlertAt(price)` → `setAlertPrefillPrice(price)` 链路无问题；`onClose` 已重置 `alertPrefillPrice` 为 null。

## Goals / Non-Goals

**Goals:**
- 每次打开创建警报弹窗，价格框正确预填：右键价格优先，否则回退当前 `symbol.price`。
- 打开即全新表单（条件/频率/备注重置为默认）。

**Non-Goals:**
- 不重构弹窗表单为受控组件。
- 不处理 `OrderModal.tsx` 中同款 `useState(symbol.price)` 模式（同型问题，另行评估）。

## Decisions

### D1: App 层条件渲染（方案 A）

将 `App.tsx` 中 `CreateAlertModal` 改为 `{isAlertOpen && <CreateAlertModal ... />}`。

**理由**：
- 关闭时真正卸载组件，每次打开重新挂载 → `useState` 以当前 `initialPrice ?? symbol.price` 重新初始化，右键预填与默认回退都正确。
- 全新表单语义天然达成（条件/频率/备注都回到默认值），无需组件内重置逻辑。
- 改动最小（1 行），符合 React「key/条件渲染以重置状态」的惯例。
- **备选方案 B**（组件内 `useEffect` 监听 `isOpen` 边沿重置）：自包含但需 `useRef` 防"打开期间实时价格刷新覆盖用户输入"，复杂度更高且容易引入依赖数组陷阱，放弃。

### D2: CreateAlertModal 内部防御保留

`if (!isOpen) return null` 保留：App 条件渲染后该分支恒真，但作为防御不影响行为，且避免改动组件内部语义。

## Risks / Trade-offs

- **挂载动画重复触发**：条件渲染使每次打开都重新执行入场动画（`animate-in`）→ 属预期效果（关闭时原本 return null 也重渲染），无回归。
- **打开期间实时价格刷新**：`symbol.price` 每秒更新，但条件渲染只在打开时刻初始化一次，打开期间不会覆盖用户输入 → 无风险。
- **onClose 重置依赖**：预填回退正确依赖 `onClose` 清空 `alertPrefillPrice`（已存在）→ 保持现状即可。

## Migration Plan

1. 纯前端 1 行改动 + 测试，无数据/部署迁移。
2. 回滚：恢复无条件渲染即可。

## Open Questions

- 无。
