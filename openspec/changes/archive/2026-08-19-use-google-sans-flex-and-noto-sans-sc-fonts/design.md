## Context

`frontend/` 是 React 19 + Vite 6 + Tailwind v4（CSS-first，经 `@tailwindcss/vite` 插件）的桌面交易终端。字体现状：

```
frontend/
├─ index.html            lang="zh"，无字体 <link>
├─ src/index.css         @import "tailwindcss"
│                        --font-cn: PingFang SC / Microsoft YaHei / Noto Sans CJK SC / Source Han Sans SC / ...
│                        html, body, #tradingview-desktop-root { font-family: var(--font-cn) }
│                        .font-mono/.tnum { font-family: var(--font-cn); font-variant-numeric: tabular-nums }
├─ tailwind.config.js    fontFamily.sans = [-apple-system, BlinkMacSystemFont, 'Trebuchet MS',
│                                           Roboto, Ubuntu, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif]
├─ src/main.tsx          import './index.css'   ← 唯一 CSS 入口
└─ src/klinecharts-pro-theme.css   仅 font-size/font-weight，无 font-family
```

关键现状事实：

1. **没有任何 `@font-face` 或字体资源文件**（`vendor/klinecharts-pro` 内的 `icomoon.*` 是图标字体，与正文无关）。字体完全靠系统预装，跨平台字形不一致。
2. **两套字体定义并存且不一致**：`index.css` 的 `--font-cn`（作用于 `html/body`）与 `tailwind.config.js` 的 `fontFamily.sans`（作用于 `font-sans` 工具类）内容不同。全站约 15 个组件、50+ 处显式使用 `font-sans`，实际生效的是 Tailwind 那一份。两处必须同时改，否则出现「面板用 A 字体、body 用 B 字体」。
3. **Tailwind v4 与 `tailwind.config.js` 并存**：v4 优先 CSS `@theme`，但项目仍保留 v3 风格 config。需确认哪一份真正参与构建，避免改了不生效。
4. **图表文字分两类**：`klinecharts-pro-theme.css` 管 DOM chrome（可继承 CSS），但 `KLineChartProView.tsx:100-146` 的 `styles` 配置的是 **Canvas 绘制文字**（xAxis/yAxis tickText、crosshair text、priceMark text，目前只设了 `size: 11` 没设 `family`）。**Canvas 文字不继承 CSS `font-family`**，必须在 klinecharts styles 里显式传 `family`，否则图表刻度仍是旧字体。
5. 约束：这是本地运行的交易终端，**运行时不应依赖外部网络**取字体。

## Goals / Non-Goals

**Goals:**

- 西文（拉丁字母、数字、标点）统一渲染为 **Google Sans Flex**；中文（汉字、CJK 标点）统一渲染为 **Noto Sans SC**。
- 自托管：字体随构建产物打包，离线可用，版本可锁定。
- 单一字体真源：`index.css` 定义 CSS 变量，`tailwind.config.js` 与图表 Canvas 配置都引用同一份定义。
- 覆盖 DOM 文字与 Canvas 图表文字两条渲染路径。
- 保持现有 `tabular-nums` 数字对齐、11/12/13px 字号基准、行高与布局尺寸完全不变。

**Non-Goals:**

- 不改任何组件的 `className`（`font-sans` 类名保持原样，靠 token 继承换字体）。
- 不改字号、行高、圆角、阴影、配色等其他设计 token。
- 不引入等宽（monospace）新字体——现有 `.font-mono`/`.tnum` 依赖 `tabular-nums` 而非真等宽字体，此行为保留。
- 不改动 `vendor/klinecharts-pro` 内的图标字体 `icomoon.*`。
- 不做字体子集裁剪工具链（如 fonttools/subfont）；沿用 Fontsource 已切分的子集。
- 不涉及后端、API、数据流。

## Decisions

### D1: 通过 Fontsource npm 包自托管，而非 Google Fonts CDN

**决定**：新增 `@fontsource-variable/google-sans-flex` 与 `@fontsource-variable/noto-sans-sc` 作为依赖，字体文件随 Vite 构建落到 `dist/assets/`。

**理由**：

| 方案 | Google Sans Flex 可得 | 离线可用 | 版本锁定 | 隐私/合规 |
|---|---|---|---|---|
| **Fontsource npm 自托管** | ✅ OFL-1.1 已开源 | ✅ | ✅ package-lock | ✅ 无第三方请求 |
| `fonts.googleapis.com` `<link>` | ⚠️ 该 family 未作为常规 CSS2 API 公开暴露，稳定性无保证 | ❌ | ❌ | ❌ 运行时外链 |
| 手动下载字体文件入仓 | ✅ | ✅ | ⚠️ 需人工维护版本 | ✅ |

交易终端需在无外网环境稳定运行，运行时外链字体会导致首屏字体降级甚至 FOIT。Fontsource 方案同时解决「GFlex 从哪来」和「离线」两个问题。Google Sans Flex 与 Noto Sans SC **均为 OFL-1.1**，允许打包分发。

**备选被否**：手动下载入仓——省一个依赖但失去版本管理与升级路径，且需要人工维护 `@font-face` 与 `unicode-range`（Noto Sans SC 的 CJK 子集分片数量多，手写不现实）。

### D2: 用 `unicode-range` 分流，而非按语言切换字体类

**决定**：字体栈为 `"Google Sans Flex Variable", "Noto Sans SC Variable", <系统兜底>, sans-serif`，依赖 Fontsource 每个 `@font-face` 自带的 `unicode-range` 做**逐字符**回落。

**理由**：Google Sans Flex **只含 Latin/Latin-ext，不含任何 CJK 字形**。而 Noto Sans SC **同时含 Latin**。因此：

```
字体栈顺序：Google Sans Flex → Noto Sans SC → 系统兜底

"BTC 现货 8000"
 └┬┘ └┬┘ └┬┘
  │   │   └── 数字 8000 → GFlex（Latin unicode-range 命中）
  │   └────── 汉字 现货 → GFlex 无此 range → 回落 Noto Sans SC ✅
  └────────── 拉丁 BTC  → GFlex ✅
```

GFlex 必须在 Noto **之前**：若顺序颠倒，Noto Sans SC 的 Latin 子集会抢先命中，西文永远轮不到 GFlex。这是本方案最关键、也最易写错的一点。

**备选被否**：按 `:lang(zh)` / `[lang]` 选择器切换字体类——中英混排在同一文本节点内极常见（如 "BTC 现货"、"MA(5) 均线"），选择器粒度到不了单个字符，做不到正确分流。

### D3: 单一真源 CSS 变量，三处消费

**决定**：

```
index.css  ──定义──▶  --font-sans: "Google Sans Flex Variable", "Noto Sans SC Variable", ...
                            │
              ┌─────────────┼──────────────────┐
              ▼             ▼                  ▼
   html/body/#root    tailwind.config.js   klinecharts styles
   font-family        fontFamily.sans      family: (JS 常量)
                      = ["var(--font-sans)"]
```

保留 `--font-cn` 名称作为向后兼容别名（或直接改名并同步全部 3 处引用，二者在 tasks 中确定）。这样避免 D-Context#2 描述的「两套定义不一致」问题再次发生。

**Canvas 例外**：klinecharts 的 `family` 字段最终进入 Canvas `ctx.font`，**不能用 `var()`**（Canvas 不解析 CSS 变量）。需在 TS 侧导出一个字体栈字符串常量，与 CSS 变量值保持一致，并在 `KLineChartProView.tsx` 的 xAxis/yAxis/crosshair/candle.priceMark 各 text 节点传入。

### D4: Canvas 字体等待字体加载完成

**决定**：图表挂载时（或首次绘制前）等待 `document.fonts.ready`，再让 klinecharts 绘制/重绘。

**理由**：Canvas 绘制是一次性光栅化——若绘制发生在 woff2 下载完成前，刻度文字会以兜底字体永久烧进画布，且不会像 DOM 文字那样在字体到达后自动重排。DOM 侧靠 `font-display: swap`（Fontsource 默认）自动重绘，Canvas 侧必须显式处理。

### D5: 引入方式选 `wght.css` 全量入口，不手挑单个子集文件

**决定**：`import "@fontsource-variable/noto-sans-sc/wght.css"`（及 GFlex 对应入口），而非直接引用某个 `.woff2`。

**理由**：Fontsource 上游存在已知问题（CJK 变体的 `chinese-simplified-*.woff2` 文件名与文档不一致，Vite 构建期无法解析）。走 `wght.css` 入口由包自身声明所有 `@font-face` 与 `unicode-range`，文件名由包内实际内容决定，规避该 issue，同时天然获得按需分片下载（浏览器只拉取 `unicode-range` 命中的分片）。

**实施时须验证**：安装后实际检查包内 `files/` 目录与 CSS 入口名，以包内真实内容为准，不假设文档所列路径存在。

### D6: Tailwind v4 配置归属先探明再动手

**决定**：实施第一步先确认 `tailwind.config.js` 在 Tailwind v4 + `@tailwindcss/vite` 下是否真正生效；据此决定字体栈写入 `@theme { --font-sans: ... }`（v4 原生）还是 `tailwind.config.js`，或两者都写以保证兼容。

**理由**：v4 是 CSS-first，`fontFamily.sans` 若未被读取，改了不生效；若被读取而只改了 CSS 变量，则 `font-sans` 工具类仍输出旧栈。这是「改了没效果」类 bug 的高发点，必须先验证而非猜测。

**实施实测结论（已验证）**：`index.css` 仅 `@import "tailwindcss"`，无 `@config "./tailwind.config.js"`，故 `tailwind.config.js` **惰性**。用 `npx @tailwindcss/cli` 编译证实 `--font-sans` 为 v4 默认栈、`tailwind.config.js` 的自定义字体未进入产物。因此字体栈只写入 `@theme { --font-sans }`（不碰 `tailwind.config.js`），实测编译产物已正确输出自定义双字体栈，`font-sans` 依赖 `--font-sans` 生效。

## Risks / Trade-offs

- **[字体栈顺序写错 → 西文不生效或中文变豆腐块]** → GFlex 必须先于 Noto；验收时用中英混排样本（"BTC 现货 8000 · MA(5) 均线"）逐字符核对实际生效字体（DevTools > Computed > Rendered Fonts 会列出每种字体的字符命中数）。

- **[Canvas 图表刻度未换字体，与面板割裂]** → 单独在 klinecharts `styles` 传 `family`（D3），并按 D4 等待 `document.fonts.ready`；验收需单独检查图表刻度而非只看面板。

- **[两处字体定义只改了一处 → 面板与 body 字体不一致]** → 按 D3 收敛到单一变量；验收覆盖「用 `font-sans` 的组件」与「未用 `font-sans` 的 body 文本」两类。

- **[CJK 字体体积拖慢首屏]** → Noto Sans SC 全量 woff2 达数 MB。依赖 Fontsource 的 `unicode-range` 分片按需加载，中文界面首屏通常只命中少数分片。构建后需实测 `dist/assets/` 字体总量与首屏实际请求的字体请求数/体积，若超预期再评估子集裁剪（当前列为 Non-Goal）。

- **[FOUT 文字抖动]** → `font-display: swap` 会在字体到达时重排。风险集中在数字列（价格刷新时列宽跳动）。现有 `tabular-nums` 只保证同字体内等宽，跨字体切换仍会变宽。缓解：验收时观察首屏字体切换瞬间的表格列宽跳动幅度；必要时对数字列显式指定字体栈以缩短切换窗口。

- **[Fontsource 上游文件名 issue]** → 按 D5 走 CSS 入口而非硬编码文件路径；安装后立即执行一次 `npm run build` 验证无 "didn't resolve at build time" 警告。

- **[Tailwind v4 config 未生效]** → 按 D6 先验证再实施。

- **[产物体积与依赖增加]** → 接受。换取跨平台一致排版与离线可用性，这是本变更的核心价值。

- **[新增 2 个 npm 依赖的供应链面]** → 二者均为 Fontsource 官方维护、OFL-1.1、纯静态资源包（无安装脚本），风险可接受；通过 `package-lock.json` 锁定版本。

## Migration Plan

无数据迁移、无 API 变更、无向后兼容包袱。落地路径：

1. 探明 Tailwind v4 配置归属（D6）——决定字体栈写入位置。
2. 安装两个 Fontsource 包，核对包内实际 CSS 入口与 `files/` 内容（D5）。
3. `index.css` 引入字体 CSS + 收敛字体变量（D1/D2/D3）。
4. 同步 Tailwind `fontFamily.sans`（D3/D6）。
5. 同步图表 Canvas `family` + `document.fonts.ready`（D3/D4）。
6. 验证：`npm run typecheck`、`npm run test`、`npm run build`（无字体解析警告），并做中英混排 + 图表刻度 + 首屏体积三项人工验收。

**回滚**：还原 `index.css` / `tailwind.config.js` / `KLineChartProView.tsx` 三个文件并移除两个依赖即可，无残留状态。

## Open Questions

- `--font-cn` 变量是**改名**为语义更准的 `--font-sans`（需同步 3 处引用），还是**保留原名**只换内容？倾向改名以消除「cn 变量里其实也管西文」的误导，但会扩大 diff 面。
  **✅ 已定：改名 `--font-sans`。** 与 Tailwind v4 主题变量 `--font-sans` 同名而合并为单一真源（满足 spec「单一真源」需求），`--font-cn` 已移除、全仓 grep 无残留。未改任何组件 `className`。
- `.font-mono` / `.tnum` 是否应继续复用正文字体栈？当前它们只靠 `tabular-nums`。Google Sans Flex 是否提供质量足够的 tabular 数字，需实测后决定是否需要为数字列单独处理。
  **✅ 已定：`.font-mono` / `.tnum` 复用 `var(--font-sans)` 并保留 `tabular-nums`**，未单独引入等宽字体（符合 Non-Goal）。GFlex 的拉丁数字等权/窄化矢量画质是否足够，待 7.4 实测数字列抖动后确认是否需要后续微调。
- 是否需要在 `index.html` 加 `<link rel="preload">` 预加载西文字体分片以缩短 FOUT 窗口？取决于第 6 步实测的首屏字体到达时间。
  **⏳ 待评估**：取决于 7.5 首屏字体加载实测。当前依赖 `font-display: swap`（Fontsource 默认）保证文字始终可读，未加 preload。
