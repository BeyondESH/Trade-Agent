## Why

当前前端字体完全依赖操作系统预装字体栈（`-apple-system`、`Trebuchet MS`、`PingFang SC`、`Microsoft YaHei`），没有任何 `@font-face` 或字体资源。这导致同一套 UI 在 Windows / macOS / Linux 上渲染出完全不同的字形、字重与字宽，交易终端的数字列宽、表格对齐与视觉密度无法保证一致，也无法呈现设计稿指定的品牌字形。

现在 Google Sans Flex 已由 Google 以 **OFL-1.1** 开源发布（可自托管），Noto Sans SC（思源黑体）同为 OFL-1.1，具备了自托管双字体的许可条件。将西文统一到 Google Sans Flex、中文统一到 Noto Sans SC，可获得跨平台像素级一致的排版基线。

## What Changes

- 新增两个自托管可变字体依赖（Fontsource npm 包，随构建打包，运行时不请求外部 CDN）：
  - `@fontsource-variable/google-sans-flex` — 西文（Latin / Latin-ext），`wght` 轴 1–1000
  - `@fontsource-variable/noto-sans-sc` — 中文（chinese-simplified）及 CJK 标点，`wght` 轴 100–900
- 在 `frontend/src/index.css` 引入上述字体 CSS，并重写全局字体变量：西文优先 Google Sans Flex，中文回落 Noto Sans SC，最后系统 sans-serif 兜底。
- 依赖 Fontsource 每个 `@font-face` 自带的 `unicode-range` 实现**按字符集分流**：Latin 字符走 Google Sans Flex，汉字走 Noto Sans SC，浏览器只下载实际用到的子集。
- 同步更新 `frontend/tailwind.config.js` 的 `fontFamily.sans`，使全站已在使用的 `font-sans` 工具类自动继承新字体栈。
- 同步图表 chrome（`klinecharts-pro-theme.css` 及 klinecharts 画布文字配置）的字体，避免图表区与面板区字体割裂。
- 保留现有 `tabular-nums` 数字等宽策略与 11/12/13px 字号基准，不改动布局尺寸。
- 非 **BREAKING**：仅替换字形来源，不改变任何组件 API、类名或布局尺寸。

## Capabilities

### New Capabilities
- `webfont-self-hosting`: 自托管 Web 字体的获取、打包、子集分流与离线可用性要求。涵盖依赖来源（Fontsource npm 而非运行时 CDN）、许可合规（OFL-1.1）、`unicode-range` 分流策略、`font-display` 行为、构建产物中字体文件的落地方式，以及无网络环境下字体仍可用的保证。

### Modified Capabilities
- `design-system`: 「TV 字体与排版规范」需求的字体栈定义发生变化——由纯系统字体栈改为「Google Sans Flex（西文）+ Noto Sans SC（中文）+ 系统兜底」的自托管双字体栈；字号基准、行高、`tabular-nums`、圆角与阴影规则保持不变。

## Impact

**代码与配置**
- `frontend/package.json` — 新增 2 个 devDependencies/dependencies（Fontsource 可变字体包）
- `frontend/src/index.css` — 引入字体 CSS、重写 `--font-cn` / 新增 `--font-en` 与统一字体栈变量
- `frontend/tailwind.config.js` — `theme.extend.fontFamily.sans` 更新
- `frontend/src/klinecharts-pro-theme.css` — 图表 chrome 字体继承
- 使用 `font-sans` 的约 15 个组件文件**无需修改**（通过 Tailwind token 自动继承）

**构建与产物**
- Vite 会将字体 woff2 输出到 `dist/assets/`，产物体积增加：西文可变字体约数十 KB；中文按 Fontsource 切分的子集分片按需加载，首屏通常仅命中少量分片。
- 需验证 Fontsource CJK 子集文件名在 Vite 构建期能正确解析（已知上游 issue：部分 CJK 变体文件名与文档不一致，需以包内实际文件为准）。

**风险**
- Google Sans Flex **不含 CJK 字形**，字体栈顺序与 `unicode-range` 分流若配置错误，会导致中文回落到系统字体或出现豆腐块。
- 首次加载字体期间可能出现 FOUT，需通过 `font-display: swap`（Fontsource 默认）与兜底字体度量控制抖动。

**不受影响**
- 后端、API、数据流、图表数据逻辑完全不涉及。
