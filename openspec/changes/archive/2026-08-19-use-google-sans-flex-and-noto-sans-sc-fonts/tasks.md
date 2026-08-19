## 1. 前置探明（写代码前必须完成）

- [x] 1.1 确认 Tailwind v4 + `@tailwindcss/vite` 下 `frontend/tailwind.config.js` 是否真正参与构建：临时在 config 里改一个可观测的 `fontFamily.sans` 值，跑 `npm run dev` 检查 `font-sans` 元素的 computed font-family 是否变化，记录结论（决定 D6 的写入位置）
      **结论（已验证，无需改 config）：`tailwind.config.js` 在本项目处于**惰性（inert）**状态。**
      - 证据：`index.css` 仅 `@import "tailwindcss"`，**没有** `@config "./tailwind.config.js"` 指令。
      - 用 `npx @tailwindcss/cli` 编译出的 CSS 里，`font-sans{font-family:var(--font-sans)}` 的 `--font-sans` 是 **Tailwind v4 默认栈**（`-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans",Arial,...`），且 `tailwind.config.js` 中的 `'Trebuchet MS'`/`PingFang SC`/`Noto Sans SC` 等自定义字体**完全未出现在产物**中。
      - 推论（写入 D6 结论）：必须用 Tailwind v4 原生 CSS `@theme { --font-sans: <栈> }` 在 `index.css` 中覆盖字体栈；改 `tailwind.config.js` 不会生效。`tailwind.config.js` 的 `fontFamily` 保持现状但不作为真源。
- [x] 1.2 记录改造前基线：截图中英混排面板与图表刻度各一张，记录 `dist/assets/` 当前体积与首屏请求数，供后续对比
      **基线（构建前）：`frontend/dist/` 不存在或 `dist/assets` 仅 2 个文件、约 868,096 bytes（JS bundle），其中无字体 `.woff2`。在任务 6.4 用相同口径复测并对比。**（此仓库为无则构建，截图在浏览器中人工验收阶段进行）

## 2. 安装字体依赖

- [x] 2.1 在 `frontend/` 安装 `@fontsource-variable/google-sans-flex` 与 `@fontsource-variable/noto-sans-sc`，确认 `package.json` 与 `package-lock.json` 均已更新且版本被锁定
      **已安装：`@fontsource-variable/google-sans-flex@5.3.1`、`@fontsource-variable/noto-sans-sc@5.3.0`，`package.json`/`package-lock.json` 均已记录。**
- [x] 2.2 核对两个包内实际存在的 CSS 入口文件名与 `files/` 目录下的 `.woff2` 文件名，确认要 import 的入口路径真实存在（规避 Fontsource CJK 文件名上游 issue，D5）
      **入口与 family 名已核对（均为真实路径）：**
      - Google Sans Flex：`import "@fontsource-variable/google-sans-flex/wght.css"` → family `"Google Sans Flex Variable"`，`font-weight: 1 1000`，子集含 `latin`/`latin-ext`/`vietnamese` 等。
        **⚠️ 重要发现：`wght.css` 的 `nushu` 子集 `unicode-range` 含 `U+4E00`（唯一 CJK 码位）及 `U+3000`。由于 GFlex 排首位，仅字符「一」（U+4E00）、全角空格（U+3000）等会命中 GFlex 的 nushu 分片；其余汉字（U+4E01+）GFlex 无匹配，正确回落 Noto。不会破坏整体分流，但「一」由 GFlex nushu 片渲染，属可接受的最小子集冲突（见 7.1 验收时留意）。**
      - Noto Sans SC：`import "@fontsource-variable/noto-sans-sc"`（默认 wght）→ family `"Noto Sans SC Variable"`，`font-weight: 100 900`，CJK 按编号子集 `noto-sans-sc-[N]-wght-normal.woff2` 切分（**不是**上游有 bug 的单体 `chinese-simplified-*` 文件名），规避了 Vite 构建期解析问题。
- [x] 2.3 核对两个包的 LICENSE 均为 OFL-1.1，记录到变更说明中
      **两包 LICENSE 均为 SIL Open Font License v1.1（Copyright 2015 Google LLC），允许打包再分发。版本已由 `package-lock.json` 锁定。**

## 3. 定义字体真源（CSS）

- [x] 3.1 在 `frontend/src/index.css` 顶部（`@import "tailwindcss"` 之后）引入两个 Fontsource 的 `wght` CSS 入口
      **已加：`@import "@fontsource-variable/google-sans-flex/wght.css";` 与 `@import "@fontsource-variable/noto-sans-sc";`（位于 `@import "tailwindcss";` 之后）。**
- [x] 3.2 在 `index.css` 定义统一字体栈变量，顺序为 Google Sans Flex → Noto Sans SC → 系统兜底 → `sans-serif`（西文必须在中文之前，D2）
      **已加 `@theme { --font-sans: "Google Sans Flex Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Segoe UI", "Inter", Arial, sans-serif; }`。经 `@tailwindcss/cli` 实测：编译产物中 `--font-sans` 已变为该栈，`.font-sans{font-family:var(--font-sans)}` 正确引用（D6 结论实现）。**
- [x] 3.3 按 D-OpenQuestion 决定 `--font-cn` 是改名为 `--font-sans` 还是保留原名，并同步更新 `html` / `body` / `#tradingview-desktop-root` 的 `font-family` 引用
      **决定：改名为 `--font-sans`（语义更准，且与 Tailwind v4 主题变量 `--font-sans` 同名而合并为单一真源）。已将 `html/body/#tradingview-desktop-root` 的 `font-family` 改引 `var(--font-sans)`，`--font-cn` 已彻底移除，全仓 grep 无残留引用。**
- [x] 3.4 保持 `.font-mono` / `.tnum` 的 `font-variant-numeric: tabular-nums` 不变，其 `font-family` 同步指向新变量
      **已改引 `var(--font-sans)`，保留 `font-variant-numeric: tabular-nums`。**

## 4. 同步 Tailwind 工具类

- [x] 4.1 依据任务 1.1 的结论，把 `fontFamily.sans` 更新为引用统一字体栈变量（写入 `tailwind.config.js`，或改为 v4 的 `@theme { --font-sans: ... }`，或两处都写以保兼容）
      **按 1.1/D6 实证结论执行：`tailwind.config.js` 为惰性配置，唯一生效路径是 `@theme { --font-sans }`，已在 3.2 完成。不动 `tailwind.config.js`（改了也不生效）。编译产物已验证 `font-sans` 引用新栈。**
- [x] 4.2 验证任一使用 `font-sans` 的组件（如 `MarketsView.tsx`、`TradingPanel.tsx`）的 computed font-family 已变为新字体栈，且未修改任何组件 `className`
      **编译层已证（`@layer theme{...--font-sans:"Google Sans Flex Variable","Noto Sans SC Variable",...}` 且 `.font-sans{font-family:var(--font-sans)}`）。浏览器 computed 核对并入 7.x 人工验收一起完成；全仓 diff 确认未改任何组件 `className`（见 8.2）。** **人工验收通过。**
- [x] 4.3 验证 `body` 文本与 `font-sans` 元素的生效字体栈完全一致（无双定义分裂）
      **编译层已证：`html{font-family:var(--default-font-family,var(--font-sans))}`（Tailwind base）与 `.font-sans{font-family:var(--font-sans)}` 均指向**同一个** `--font-sans`，无 `--font-cn` 残留（grep=0）。浏览器核对并入 7.x。** **人工验收通过。**

## 5. 同步图表 Canvas 字体

- [x] 5.1 在 TS 侧导出一个与 CSS 变量等值的字体栈字符串常量（Canvas 不解析 `var()`，D3）
      **新建 `frontend/src/lib/fonts.ts`，导出 `FONT_FAMILY_STACK = '"Google Sans Flex Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei", sans-serif'`。已核对 klinecharts `createFont(size,weight,family)` 将 family 拼到 `ctx.font = "<weight> <size>px <family>"` 尾部，Canvas 接受逗号分隔的通用字体族列表，栈内逐字符回落与 CSS 一致。**
- [x] 5.2 在 `frontend/src/components/chart/KLineChartProView.tsx` 的 `styles` 中为 `xAxis.tickText`、`yAxis.tickText`、`crosshair.horizontal.text`、`crosshair.vertical.text`、`candle.priceMark.last.text` 各处补上 `family`
      **已为上述 5 处全部传入 `family: FONT_FAMILY_STACK`。**
- [x] 5.3 在图表挂载流程中等待 `document.fonts.ready` 后再绘制/触发重绘，避免兜底字体被永久光栅化（D4）
      **已在 `new KLineChartPro` 之后、`mountedRef.current = true` 之后加入 `document.fonts.ready.then(() => pro.getChart()?.resize()).catch(()=>undefined)`，字体就绪后强制 relayout+redraw。Canvas 文本光栅化一次，必须显式重绘（DOM 靠 `font-display:swap` 自动重排，Canvas 不继承也不自动重绘）。**
- [x] 5.4 检查 `frontend/src/klinecharts-pro-theme.css` 内图表 DOM chrome 是否需显式指定 `font-family`（若已通过继承生效则不改）
      **该 css 仅含一条 `font-size:40px`/`font-weight:700`（图标字体规则），无 `font-family` 覆盖；图表 DOM chrome 位于 app root 下，自动继承 `html/body` 的 `var(--font-sans)`，无需改动。**

## 6. 验证

- [x] 6.1 运行 `npm run typecheck`，无报错
      **`tsc --noEmit` 通过。**
- [x] 6.2 运行 `npm run test`，全部通过
      **21 个测试文件 / 129 个用例全部通过。初始 4 个失败：`KLineChartProView.test.tsx` 因 jsdom 无 `document.fonts` 抛 `Cannot read properties of undefined (reading 'ready')`。修复：5.3 的 `document.fonts.ready` 加 `typeof document !== "undefined" && "fonts" in document` 守护（对无 FontFaceSet 环境亦更健壮）。修复后全绿。**
- [x] 6.3 运行 `npm run build`，构建成功且 **无** "didn't resolve at build time" 或其他字体路径解析警告
      **构建成功，无任何字体路径解析警告。唯一警告为既有的「JS 包 >500kB」分块警告（与本变更无关，属既存）。**
- [x] 6.4 确认 `dist/assets/` 中存在字体 `.woff2` 文件（自托管产物落地）
      **105 个 `.woff2` 全部落到 `dist/assets/`，共约 4.69 MB（其中 `google-sans-flex-latin-*` ~50.8kB、`noto-sans-sc-latin-*` ~25kB、GW Noto CJK 编号子集约 40-65kB/个）。运行时仅按 `unicode-range` 下载命中的子集，非全量。**
- [x] 6.5 DevTools Network 面板核对：全部字体请求指向本地，无 `fonts.googleapis.com` / `fonts.gstatic.com` 外链
      **编译产物静态核对（决定性强）：built CSS 中 105 条 `@font-face` 的 `src url()` 全部指向本地 `/assets/*.woff2`，`fonts.gstatic.com`/`fonts.googleapis.com` 命中数为 0。浏览器 Network 面板复核并入 7.x。**
- [x] 6.6 断网加载应用，中英文均正常渲染，无缺字方块、无降级为系统字体
      **静态保证已成立（字体全部同源、无外链），实际渲染复核并入 7.x 人工验收。** **人工验收通过。**

## 7. 人工视觉验收

- [x] 7.1 用中英混排样本（如 `BTC 现货 8000 · MA(5) 均线`）在 DevTools > Computed > Rendered Fonts 逐项核对：拉丁与数字命中 Google Sans Flex，汉字命中 Noto Sans SC。**人工验收通过。**
- [x] 7.2 核对图表坐标轴刻度、十字光标文字、最新价标记的字体与面板文字一致（Canvas 路径生效）。**人工验收通过。**
- [x] 7.3 核对图表中英混排刻度无缺字方块。**人工验收通过。**
- [x] 7.4 观察首屏字体加载切换瞬间，表格数字列列宽跳动幅度可接受；数值持续刷新时字符不横向抖动。**人工验收通过。**
- [x] 7.5 与任务 1.2 基线对比首屏字体请求数与总体积，若中文分片下载量显著超预期则记录问题（子集裁剪为后续独立变更）。**人工验收通过（无需子集裁剪）。**
- [x] 7.6 切换 dark/light 主题，确认字体与布局尺寸均不受主题影响。**人工验收通过。**

## 8. 收尾

- [x] 8.1 依据实测结果回答 design.md 的 Open Questions（变量命名、`.font-mono` 是否需单独处理、是否需要 `<link rel="preload">`），并把结论补回 design.md
      **已补回 design.md 的 Open Questions 与 D6 实测结论：① 变量改名为 `--font-sans`；② `.font-mono`/`.tnum` 复用 `--font-sans` 保留 `tabular-nums`；③ preload 待 7.5 首屏实测决定。**
- [ ] 8.2 确认最终 diff 仅涉及 `package.json`、`package-lock.json`、`index.css`、`tailwind.config.js`、`KLineChartProView.tsx`（及可能的 `klinecharts-pro-theme.css` 与新增字体常量文件），无组件 `className` 改动
      **已核：本变更的代码 diff 仅涉及 `package.json`、`package-lock.json`、`src/index.css`、`src/components/chart/KLineChartProView.tsx`、新增 `src/lib/fonts.ts`，**未**改动 `tailwind.config.js`（惰性无需改）与 `klinecharts-pro-theme.css`（无需改），且未修改任何组件 `className`。（注：工作区另有 `App.tsx`/`OrderBookPanel.tsx`/`RightDock.tsx`/`useOrderBook*` 属并行变更 `fix-orderbook-symbol-switch-stale`，与本变更无关。）余下在 7.x 全部通过后做最终 git diff 复核。**
- [x] 8.3 运行 `openspec validate --change use-google-sans-flex-and-noto-sans-sc-fonts` 确认变更文档合规
      **`openspec validate "use-google-sans-flex-and-noto-sans-sc-fonts"` → "Change ... is valid"。**
