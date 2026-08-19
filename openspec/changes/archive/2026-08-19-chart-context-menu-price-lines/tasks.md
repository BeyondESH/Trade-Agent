## 1. Store 与纯函数辅助层

- [x] 1.1 新增价格线颜色派生辅助 `priceLineColor(alert, theme)` 与预设色板（警报黄 `#ff9800`、参考线 dark `#787b86` / light `#5d606b`）
- [x] 1.2 在 `Alert` 实体支持可选自定义 `color` 字段：`createAlert`/`saveAlerts` 透传，`asAlert`（后端回传解析）与后端镜像 round-trip
- [x] 1.3 扩展 `transform.ts: priceLineToOverlay`：支持 `extendData.alertId` 与自定义颜色样式
- [x] 1.4 为颜色派生、自定义颜色 round-trip、overlay 转换补充单测

## 2. Chart ↔ Store 同步层

- [x] 2.1 在 `NativeChart` 层通过 `onReady` 捕获核心 Chart 实例（ref），供换算与 overlay 使用
- [x] 2.2 实现价格线绘制/重绘/清除逻辑：从 `alertsStore` 取当前 symbol 的所有实体（含 `enabled:false`）绘制 `priceLine` overlay；`removeAllPriceLines` 清空后重建
- [x] 2.3 订阅 `subscribeAlerts` 与 symbol 变化触发重绘；组件卸载时退订并清理 overlay
- [x] 2.4 保证 StrictMode 双挂载/快速重挂下重绘幂等（不重复画线、不泄漏订阅）
- [x] 2.5 补充同步层单测：初始绘制、品种切换重绘、删除后移除、双挂载幂等

## 3. 右键上下文菜单

- [x] 3.1 在容器 div 监听 `contextmenu`：仅当 target 为 canvas 且命中 `candle_pane`（`getDom` hit-test）时 `preventDefault` 并打开菜单；pro 组件区域不拦截
- [x] 3.2 实现 `convertFromPixel` 坐标→价格换算辅助（`candle_pane` + absolute，chart 未就绪/非法价格时返回 null）
- [x] 3.3 实现 `ChartContextMenu` 浮层组件：光标定位、外部点击/Escape 关闭
- [x] 3.4 菜单「在此添加价格线 $X」→ 创建 `enabled:false` 参考线实体并触发重绘
- [x] 3.5 菜单「在此设置价格警报 $X」→ 调用 `onCreateAlertAt(price)` 上抛 App
- [x] 3.6 补充菜单单测：主图右键弹出、工具栏右键不弹、换算失败不弹、添加价格线建实体、点击外部关闭

## 4. 价格线设置弹窗

- [x] 4.1 实现 `PriceLineSettingsModal` 组件（价格/颜色色板/类型参考线·警报线/条件高于·低于/删除）
- [x] 4.2 overlay 创建时挂 `onClick`：左键点线以 `extendData.alertId` 打开设置弹窗并回显
- [x] 4.3 保存动作统一走 `saveAlerts` + `mirrorAlertUpdate`，经订阅触发重绘
- [x] 4.4 删除动作走 `mirrorAlertDelete` + 移除 overlay + 关闭弹窗
- [x] 4.5 补充弹窗单测：回显、改价/改色/改类型/改条件保存、删除

## 5. 拖动调整阈值

- [x] 5.1 overlay 挂 `onPressedMoveEnd`：以最小位移阈值区分点击/拖动，拖动落点更新 `threshold` 并持久化
- [x] 5.2 补充拖动单测：拖动更新阈值、无位移不误更新

## 6. App 集成

- [x] 6.1 `App.tsx`：新增警报预填价格状态，`onCreateAlertAt(price)` 设置后打开 `CreateAlertModal`
- [x] 6.2 `CreateAlertModal` 支持 `initialPrice` prop（缺省回退 `symbol.price`）
- [x] 6.3 `NativeChart` 新增 props 定义并接通 App 侧回调
- [x] 6.4 补充 App/Modal 集成测试：右键动作预填价格并打开弹窗

## 7. 验证

- [x] 7.1 运行 `npm run typecheck`（frontend）无类型错误
- [x] 7.2 运行 `npm test`（frontend）全部通过
- [x] 7.3 手动验证：右键主图弹菜单→添加价格线/设置警报、左键点线弹设置、拖动改阈值、切换品种只显示本品种线、刷新后线保留
