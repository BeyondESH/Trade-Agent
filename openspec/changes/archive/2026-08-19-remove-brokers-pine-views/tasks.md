## 1. 收敛视图类型（先做，用编译器定位残留引用）

- [x] 1.1 `types/trading.ts`：`DesktopViewMode` 联合类型移除 `'pine'` 与 `'brokers'`
- [x] 1.2 `components/bottom/BottomDock.tsx`：`BottomTab` 联合类型移除 `'pine'`
- [x] 1.3 运行 `npm run typecheck`，记录所有报错位置作为后续清理清单（预期覆盖 App.tsx、GlobalNavRail、DesktopTitleBar、CommandPaletteModal、BottomDock）

## 2. 清理左侧全局导航栏入口

- [x] 2.1 `GlobalNavRail.tsx`：从 `navItems` 移除 `'pine'`（Pine Studio）与 `'brokers'`（Brokers）两项
- [x] 2.2 移除该文件中已无引用的 `Code`、`Briefcase` 图标导入（删前确认文件内无其他引用点）

## 3. 清理标题栏两处入口

- [x] 3.1 `DesktopTitleBar.tsx`：`getTabIcon` 移除 `case 'pine'` 与 `case 'brokers'` 分支，确认 `default` 兜底仍在
- [x] 3.2 同文件「新建标签」菜单移除 Pine Studio 与 Brokers 两个按钮
- [x] 3.3 移除该文件中已无引用的 `Code`、`Briefcase` 图标导入（删前确认文件内无其他引用点）

## 4. 清理命令面板入口

- [x] 4.1 `CommandPaletteModal.tsx`：移除 `view-pine` 与 `view-brokers` 两条命令项
- [x] 4.2 移除该文件中已无引用的 `Code`、`Briefcase` 图标导入（删前确认文件内无其他引用点）

## 5. 清理底部停靠栏 Pine tab

- [x] 5.1 `BottomDock.tsx`：移除 `PineEditor` 导入与 `tabs` 清单中的 Pine Editor 项
- [x] 5.2 移除 `activeTab === 'pine'` 渲染分支
- [x] 5.3 从 Props 接口移除 `onRunStrategy`，并从组件解构参数中移除（决策 A）
- [x] 5.4 移除已无引用的 `FileCode` 图标导入
- [x] 5.5 确认默认激活 tab（`'trading'`）与折叠/展开行为不受影响

## 6. 清理 App 工作区路由与传参

- [x] 6.1 `App.tsx`：移除 `PineStudioView` 与 `BrokersView` 两处 import
- [x] 6.2 移除 `handleNewTab` 中 `'pine'` / `'brokers'` 的 tab 标题分支
- [x] 6.3 移除 `activeView === 'pine'` 与 `activeView === 'brokers'` 两个工作区路由分支
- [x] 6.4 移除传给 `BottomDock` 的 `onRunStrategy` prop
- [x] 6.5 移除已失去唯一调用方的 `handleApplyScriptFromStudio` 函数

## 7. 删除组件文件

- [x] 7.1 删除 `components/views/BrokersView.tsx`
- [x] 7.2 删除 `components/views/PineStudioView.tsx`
- [x] 7.3 删除 `components/bottom/PineEditor.tsx`

## 8. 为保留项加注释标注

- [x] 8.1 `App.tsx: handleRunStrategy` 加注释：保留为未来策略界面的后端回测（`api.backtest` + `api.job` 轮询）接入点，当前零调用方
- [x] 8.2 `App.tsx: handleResetPaperAccount` 加注释：原由已删除的券商视图调用，保留待未来纸交易界面接入
- [x] 8.3 `data/marketData.ts: BROKERS_CATALOG` 与 `types/trading.ts: BrokerAccount` 加注释：券商视图已移除，数据保留待未来界面接入
- [x] 8.4 `utils/pineEngine.ts: SAMPLE_PINE_SCRIPTS` 加注释：Pine 编辑器已移除，样例脚本保留待未来界面接入
- [x] 8.5 确认 `backtestResult` state 与 `StrategyTester` 的接线未被破坏（策略回测 tab 仍正常渲染）

## 9. 更新 spec

- [x] 9.1 将 `specs/tv-template-shell/spec.md` delta 同步到主 spec（保留清单去 Pine Studio / Brokers，全视图数改为 6，新增不可达场景）
- [x] 9.2 将 `specs/bottom-dock/spec.md` delta 同步到主 spec（tab 清单去 Pine 编辑，新增无 Pine tab 场景与回测链路不依赖脚本编辑器场景）

## 10. 验证

- [x] 10.1 `npm run typecheck` 通过，无残留类型错误
- [x] 10.2 `npm run test` 全部通过（预期零影响，无测试引用被删组件）
- [x] 10.3 `npm run build` 通过
- [x] 10.4 静态验证：导航栏仅 6 个视图入口、标题栏菜单无 Pine/Brokers、⌘K 无相关命令、底部 tab 栏仅 4 项、策略回测仍展示回测指标（通过 typecheck + 全局 grep + build 结构保证；浏览器可视化核对由用户可选执行）
- [x] 10.5 全局 grep 确认无残留引用：`BrokersView`、`PineStudioView`、`PineEditor`、`'pine'`、`'brokers'`
