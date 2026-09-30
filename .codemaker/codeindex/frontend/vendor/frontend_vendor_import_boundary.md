---
type: "Fragment"
id: "frontend/vendor/import_boundary"
title: "vendor 引入与构建边界"
description: "外部图表引擎是怎么被宿主解析、编译、lint 和 CI 消费的？改哪一处会让整条链路静默失效？"
parent: /frontend/vendor/_overview.md
fragment: import_boundary
entity_names:
  constants:
    - name: "@klinecharts/pro (vite alias)"
      value: "frontend/vendor/klinecharts-pro/dist/klinecharts-pro.js"
      source: frontend/vite.config.ts
    - name: "@klinecharts/pro (tsconfig paths)"
      value: "frontend/vendor/klinecharts-pro/types.d.ts"
      source: frontend/tsconfig.json
    - name: "klinecharts (rollup external)"
      value: "external + globals.klinecharts='klinecharts'（产物不打包内核）"
      source: frontend/vendor/klinecharts-pro/vite.config.ts
    - name: "vendored engine version"
      value: "0.1.1（私有 fork，不走 npm 版本）"
      source: frontend/vendor/klinecharts-pro/package.json
    - name: "biome 排除项"
      value: '"!vendor", "!dist", "!package-lock.json"'
      source: frontend/biome.json
    - name: "tsconfig include"
      value: '["src", "vite.config.ts"]（不含 vendor）'
      source: frontend/tsconfig.json
    - name: "coverage 排除项"
      value: "src/vendor/**, src/main.tsx"
      source: frontend/vite.config.ts
    - name: "dist 提交策略"
      value: "frontend/.gitignore 仅忽略 /dist/；vendor/klinecharts-pro/dist 显式跟踪"
      source: frontend/.gitignore
retrieval_hints:
  - "为什么改了 vendor/klinecharts-pro/src 里的代码，页面上的图表一点变化都没有？"
  - "升级 klinecharts 主版本会连带影响哪些地方？"
  - "CI 或新 clone 报 'Failed to resolve @klinecharts/pro' 该从哪里查起？"
  - "@klinecharts/pro 这个名字在构建里到底被解析成哪个文件？"
  - "⚠️ 如果你要找的是图表参数对象怎么传、有哪些回调可挂——不在这里，在 frontend/vendor 的 klinecharts_pro_api 子文档"
  - "⚠️ 如果你要找的是模板外壳组件（DesktopTitleBar/GlobalNavRail/RightDock/BottomDock）的实现——不在这里，在 frontend/src（本目录的 tradingview-pro 只是只读参考副本）"
  - "⚠️ 如果你找的是 K 线数据入库/补历史——不在这里，在 backend/src 的 market_data 层"
  - "本模块也叫 vendor / 第三方图表引擎目录 / vendored klinecharts-pro，对应需求里的「图表引擎接入」与「模板外壳升格」"
  - "架构归属：图表引擎相关的构建解析规则只能改 `frontend/vite.config.ts` + `frontend/tsconfig.json` + `frontend/.gitignore` 三处，禁止新建独立 bundler 配置或在宿主里给 vendor 建 alias 副本"
  - "架构归属：新增的 vendor 本地改造必须落在 `frontend/vendor/klinecharts-pro/src/**` 并重建 `dist/`，禁止以打补丁文件（patch/patch-package）或运行时 monkey patch 的方式实现"
architectural_role: "依赖供给层，禁止在宿主代码里绕过 alias 直接引用 vendor 源码"
---

## 业务意图

交易终端的核心卖点是“图上看到的每一根蜡烛都跟后端一致”，而这份一致性有个前置条件：任何一个开发者、任何一台构建机拿到的图表引擎必须是同一个。本子模块沉淀的就是这条前提如何成立——引擎仍住在本仓库里、以已提交的预构建产物形式被固定解析，而不是仍由 npm 版本、锁文与本地 `node_modules` 状态决定。不看这份边界就动手改图表接入，最常见的代价是“本地好、CI 坏”与“改了不生效”两类难定位问题。

## 对外接口

本子模块没有网络协议，它的"接口"是**构建期解析契约**——三处配置共同决定宿主 `import ... from "@klinecharts/pro"` 拿到什么：

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号/位置 |
|------|------|---------|---------|---------|
| `resolve.alias["@klinecharts/pro"]` | 宿主→vendor（运行时） | 指向 `dist/klinecharts-pro.js`（预构建 ESM） | 运行时图表引擎的唯一真身；因 Windows 下 `file:` 包解析不稳定而直连文件 | `frontend/vite.config.ts` |
| `compilerOptions.paths["@klinecharts/pro"]` | 宿主→vendor（类型期） | 指向 `types.d.ts` | 宿主 typecheck 只看手写 d.ts；d.ts 与 bundle 不一致时"类型过得了、运行时炸" | `frontend/tsconfig.json` |
| rollup `external: ['klinecharts']` | vendor→npm | 产物首行 `import {...} from "klinecharts"` | vendor 不自带画布内核，内核由宿主 `klinecharts@^9.8.10` 提供 | `frontend/vendor/klinecharts-pro/vite.config.ts` |
| 静态资源 CSS | vendor→宿主 | `dist/klinecharts-pro.css`（由 `style.css` 改名而来） | 宿主以相对路径直引，不走包解析 | `frontend/src/components/chart/KLineChartProView.tsx` |

> 无协议字段。持久化字段：本模块不落任何存储；pinned 周期偏好由宿主 `frontend/src/lib/periodsStore.ts` 以 `raibro.pinnedTimeframes` 落 localStorage。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `klinecharts`（npm 依赖，非本仓库） | vendor 产物把内核 API 全部 external 化，宿主必须提供同主版本 | `init` / `applyNewData` / `applyMoreData` / `loadMore` / `registerOverlay` / `dispose` / `utils` | extracted |
| `frontend/` 根配置 | alias/paths/include/ignore 全在根配置里，vendor 自身没有接入权 | `resolve.alias`、`compilerOptions.paths` | extracted |
| 本机 `vendor/klinecharts-pro/node_modules/` | 重建 dist 需要 vendor 自带的 vite4 + TS4.9 + solid 工具链，与根 vite6/TS5.8 不同代 | `npm run build-core`（`tsc && vite build`） | extracted |

反向依赖（谁依赖本模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/src` | 单例图表挂载、CSS 引入、主题覆盖 | `KLineChartProView`、`klinecharts-pro-theme.css` |
| `frontend/src/api/datafeed.ts` | 实现 vendor 的 `Datafeed` 接口（因此类型必须与 d.ts 同步） | `BitgetDatafeed` |
| `frontend/src/vendor/klinechartsProRace.test.ts` | 读 `dist/klinecharts-pro.js` 文本做正则切片断言竞态修复仍在产物里 | 测试文件内 `distPath` |
| `frontend/tests/e2e/*`、`frontend/src/**/*.test.tsx` | 以 vendor DOM 类名定位 chrome；`vi.mock("@klinecharts/pro")` 造 mock 引擎 | `.klinecharts-pro-period-bar .item.tools`、`.klinecharts-container` |
| `.github/workflows`（CI） | 全新 clone 直接消费已提交的 dist；dist 缺失即"missing module" | — |

## 典型调用链

```
宿主 `import { KLineChartPro } from "@klinecharts/pro"`
  → frontend/vite.config.ts:resolve.alias            ← 本模块解析边界（运行时真身 = dist bundle）
  → frontend/vendor/klinecharts-pro/dist/klinecharts-pro.js
    → import { init, applyNewData, ... } from "klinecharts"   ← 跨模块：宿主 node_modules 的 klinecharts@9
  同时（类型期）frontend/tsconfig.json:paths → frontend/vendor/klinecharts-pro/types.d.ts   ← 与 bundle 无强校验
```

## 实现约束清单

> 动笔前逐条核对：本模块 90% 的事故不是"代码写错"，而是"改了不被执行的那一份"。

### 必须定义的常量/标识

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `@klinecharts/pro` alias | `./vendor/klinecharts-pro/dist/klinecharts-pro.js` | `frontend/vite.config.ts` | 运行时装载的是预构建 bundle，不是 `src/` | fix: `file:` 包解析在 Windows 上不稳定（vite.config 注释原文） |
| `paths["@klinecharts/pro"]` | `./vendor/klinecharts-pro/types.d.ts` | `frontend/tsconfig.json` | 类型面与实现面分离，两者靠人工同步 | 契约：宿主 `BitgetDatafeed`/`NATIVE_PERIODS` 以此为唯一类型依据 |
| `external` | `['klinecharts']` | `frontend/vendor/klinecharts-pro/vite.config.ts` | 内核不进 bundle，避免双实例（双实例会导致 overlay/指标注册表不一致） | rollup 配置 + 产物首行 import 可验证 |
| `dist` 跟踪策略 | 提交（含 `.map`） | `frontend/{,.}gitignore` 两处注释 | CI 与 fresh clone 免构建即可跑测试 | fix: 宽 `dist/` 规则曾导致 CI 缺模块（commit `1f5784c`） |
| `vendored engine version` | `0.1.1` | `frontend/vendor/klinecharts-pro/package.json` | 本地 fork 的基线版本号；升级上游时以此判断改动跨度 | 上游 npm 版本对齐用 |

### 必须实现的函数/流程（重建产物的固定顺序）

| 步骤 | 位置 | 说明 |
|--------|---------|------|
| 改 `src/**` | `frontend/vendor/klinecharts-pro/src/` | 唯一合法的引擎改造入口；需同步 `src/types.ts` 与 `types.d.ts` 两处类型 |
| `npm run build`（= `build-core`：`tsc && vite build`） | `frontend/vendor/klinecharts-pro/package.json` | 必须在 vendor 目录内执行，用其自带 vite4/TS4.9；不得用仓库根 vite6 代跑 |
| 提交 `dist/klinecharts-pro.{js,css,umd.js}` + `.map` | `frontend/vendor/klinecharts-pro/dist/` | 产物未提交等于改动未生效（对 CI 而言） |
| 回归守卫自查 | `frontend/src/vendor/klinechartsProRace.test.ts` | 切片断言依赖产物里的字符串字面量（`applyNewData(`、`getHistoryKLineData(`）；重建后必须跑 `cd frontend && npm run test` |

### 设计决策（两种方案均可行、本项目已选定）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 引擎引入方式 | vendored fork + 直连 dist 文件 | npm `@klinecharts/pro@0.1.1` + 运行时 monkey patch | 上游不提供 pin/秒级/竞态修复能力，npm 版无法改；monkey patch 私有打包符号不可维护。选 fork 换可控性，代价是产物必须入库 |
| 产物与源码关系 | 单源：src 与 dist 同提交、以 dist 为运行时真身 | CI 内构建 dist | CI 构建会把 solid/vite4 老工具链变成流水线依赖，且 e2e 的 mock 边界会变模糊；代价是 diff 里出现长行产物 |
| 外观层（TradingView 壳） | copy-in 升格：把 `tradingview-pro/src` 拷进 `frontend/src` 后独立演化，vendor 副本保持 pristine | 直接把 vendor 目录当包引用（git submodule/workspace） | 前端要删视图（Pine/Brokers）、改单图、接真实数据；引用式集成会让"参考模板"与"在跑代码"互相污染。保留 pristine 副本的用途是回滚与日后二次拷贝（来源: openspec 归档变更 `2026-08-17-frontend-tv-rebuild/design.md`） |
| 模板自带工具链 | 不安装、不参与根构建（vendor 的 package.json/vite.config 只作版本参考） | 纳入 workspace 一起装 | 模板依赖 `@google/genai`/`express`/`dotenv`，本项目不需要；装上会污染锁文件与审计面 |

### 禁止项（含由来）

- **禁止**用宿主根目录的 vite/tsc 编译 vendor `src/`。约束由来：vendor 工具链是 vite4/TS4.9 + `vite-plugin-solid`，根 vite6 不做 Solid JSX 转换，会把 Solid 树当 React 编译，产物运行时才发现。
- **禁止**在测试里覆盖 alias 指向 `src/`（现有做法是 `vi.mock("@klinecharts/pro")`）。由来：一旦指向 src，单测就不再命中"线上真正跑的 bundle"，`klinechartsProRace.test.ts` 的切片断言语义失效。
- **禁止**把 `!vendor` 从 `frontend/biome.json` 的 includes 移除、或把 vendor 加进 `tsconfig.include`。由来：仓库根的 `ci-quality-gates` / `repo-hygiene` 约定 + 覆盖率棘轮（lines/statements=55）——第三方 15k 行代码会把 lint 与类型门槛整体冲垮。
- **禁止**为 vendor 新增第二份 alias 副本（如再开 `@klinecharts/pro-src`）。由来：双 alias 会让"类型来自 d.ts、实现来自 bundle"的隐式契约裂成三处，升级时无法一次收敛。
- **禁止**删除 `LICENSE` 与源文件 Apache-2.0 版权头，修改过的文件须保留头部声明。由来：Apache-2.0 第 4 条的再分发条件。
- **禁止**把 `frontend/vendor/tradingview-pro` 当作可编辑代码（详见 `frontend_vendor_tradingview_template.md`）。由来：design.md 明确"模板保持 pristine 所以可回滚重拷"。

## 变更风险（改这里会破坏什么）

1. **动 alias / 改指 `src/`** → 图表引擎实现被静默替换，Solid 编译失败或 CSS 类名换代：中心图表区白屏 + `KLineChartProView`、`NativeChart`、`SignalKLineChart` 三处消费点全崩，e2e `quant-lab.spec.ts` 的 canvas 断言直接红。
2. **重建 dist 但忘了提交 / 或 `.gitignore` 又把它排除** → 本地一切正常、CI 与同事 clone 失败（本仓库已发生一次，见 commit `1f5784c`）。属于"只在别人机器上坏"的最难查类型。
3. **改了 dist 里的竞态修复结构**（哪怕语义等价） → `klinechartsProRace.test.ts` 的正则切片按字面量匹配 `applyNewData(`/`getHistoryKLineData(` 附近文本，产物压缩器变量名一变就可能误报；反过来，若把 `symbol()/period()` 读回挪到 loading 锁之后，测试会正确失败——那是 `chart-symbol-switch-race` 契约被破坏的信号（快速切币停在旧 symbol）。
4. **升 `klinecharts` 主版本** → 产物 external 的 10 个内核符号（`applyMoreData`、`loadMore`、`registerOverlay` 等）签名或存在性一变，历史左拖懒取与自定义画线 overlay（17 种，`src/extension/` 19 个文件含 index/utils）同时失效，且崩在运行时而非编译期。
5. **`types.d.ts` 与 bundle 漂移** → typecheck 通过但运行时缺方法/参数不匹配，典型表现是"宿主新加的 `pinnedTimeframes`/`onPinChange` 在本机有效、在构建产物上 undefined"。

> 📄 本节内容来源于仓库内置文档：`frontend/vendor/klinecharts-pro/README.md`、`frontend/vendor/tradingview-pro/README.md`（原文已提炼，非完整转录；后者为 Google AI Studio 通用脚手架教程，已判定对本模块无架构价值，仅用作"模板出处与不可再分发"的依据）
