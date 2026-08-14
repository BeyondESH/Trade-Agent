## 1. 周期数据链路修复（前后端）

- [x] 1.1 后端 `models.py`：`timeframe_step_ms` / `timeframe_to_granularity` 对输入做小写归一化，兼容 `1H/4H/12H/1D` 与 `1h/4h/12h/1d`
- [x] 1.2 后端 `config.py`：默认 `timeframes` 扩展为 `["1m","5m","15m","30m","1h","4h","12h","1d"]`
- [x] 1.3 后端补测试：`1H/4H/12H/1D` 大小写请求返回 200 且数据非空
- [x] 1.4 前端 `datafeed.ts`：`periodToTimeframe` 统一输出 `1h/4h/12h/1d` 小写规范形式
- [x] 1.5 前端补测试：`periodToTimeframe` 对 1H/4H/12H/1D 输出小写 timeframe

## 2. 移除图表水印

- [x] 2.1 前端 `KLineChartProView.tsx`：创建 KLineChartPro 时传 `watermark: ""`
- [x] 2.2 验证图表渲染后无默认 Logo 水印（浏览器检查或测试）

## 3. 可拖拽布局

- [x] 3.1 新增依赖 `gridstack` 至 `frontend/package.json` 并安装，引入其 css
- [x] 3.2 封装 `GridStackLayout` 组件（初始化、`load`/`save`、版本化持久化到 localStorage）
- [x] 3.3 定义面板枚举与默认布局（market-list/chart/right-panel/ai-panel 四面板）
- [x] 3.4 将 `App.tsx` 固定 grid 替换为 GridStack 布局，各面板组件挂载到对应单元格
- [x] 3.5 监听 `resizestop`/`dragstop` 触发 `KLineChartPro` 的 `resize()`，保证 canvas 尺寸联动
- [x] 3.6 布局持久化恢复与版本回退逻辑（含布局版本不匹配回退默认布局）
- [x] 3.7 布局测试：默认布局渲染、持久化恢复、版本回退
- [x] 3.8 `App.test.tsx` 适配新布局结构

## 4. 全局主题美化

- [x] 4.1 `tailwind.config.js`：新增无衬线 `fontFamily.sans`、圆角 tokens、hover 过渡色
- [x] 4.2 `index.css`：`.tnum` 改为无衬线 + `tabular-nums`；滚动条圆润细化；全局字体栈含中文回退
- [x] 4.3 面板/卡片/按钮统一圆角、边框、阴影与过渡动画（含图表容器衔接）
- [x] 4.4 检查所有既有组件视觉一致性（TickerBar/MarketList/OrderBook/TradesTape/FundingRate/Header）

## 5. 站名更新

- [x] 5.1 `App.tsx` header 左上角改为 `RaiBro Trading`
- [x] 5.2 `index.html` `<title>` 改为 `RaiBro Trading`

## 6. 验证与收尾

- [x] 6.1 运行 `npm run typecheck`
- [x] 6.2 运行 `npm test`（vitest）
- [x] 6.3 运行 `npm run build`
- [x] 6.4 后端 pytest 通过（含新增 timeframe 测试）
- [x] 6.5 手动验证：切换所有 8 个周期图表均渲染、拖拽/缩放面板生效、无默认水印、站名正确、主题观感统一
- [x] 6.6 归档 change 并同步 specs 到主 specs
