---
type: "Fragment"
id: agent_hub-main/installer/cli_commands
title: "命令分发与版本升级/回滚语义"
description: "受管的三个 Bitget agent 包如何被判定\"已是最新/需要升级/可回滚到某版本\"，npm 与 pnpm 又是怎样被自动选中的？"
parent: /agent_hub-main/installer/_overview.md
fragment: cli_commands
entity_names:
  constants:
    - name: TARGET_PACKAGES
      source: agent_hub-main/installer/cli.mjs:9
      value: "[\"@bitget-ai/bitget-agent-skill\", \"@bitget-ai/bitget-signal\", \"@bitget-ai/bitget-agent-cli\"]（受管全集，upgrade-all 遍历它）"
    - name: SKILL_PACKAGES
      source: agent_hub-main/installer/cli.mjs:11
      value: "[\"@bitget-ai/bitget-agent-skill\", \"@bitget-ai/bitget-signal\"]（TARGET_PACKAGES 的子集：仅这两个含可部署技能；cli 包无技能）"
    - name: CLI_VERSION
      source: agent_hub-main/installer/cli.mjs:19（createRequire("../package.json").version）
      value: "3.0.0（与 agent family 同版本线；路径必须是 ../package.json，脚本本身在 installer/ 子目录）"
    - name: MIN_NODE_MAJOR
      source: agent_hub-main/package.json engines.node
      value: ">=20.0.0（Node 18 已 EOL；低于 20 时 import.meta / createRequire 行为不保证）"
    - name: PM_DETECT_SOURCE
      source: agent_hub-main/installer/cli.mjs:67 detectPM
      value: "process.env.npm_execpath，路径含 \"pnpm\" 则用 pnpm，否则一律回落 npm"
    - name: ROLLBACK_VERSION_DISPLAY_LIMIT
      source: agent_hub-main/installer/cli.mjs:cmdRollback（versions.slice(0, 20)）
      value: "20（交互回滚最多列出 20 个版本，超出仅提示总数——目前为内联字面量，改动需同步行号提示逻辑）"
    - name: LATEST_QUERY_FALLBACK
      source: agent_hub-main/installer/cli.mjs:getLatestVersion / getInstalledVersions
      value: "查询失败返回 null / 全 null Map（不抛异常），命令层据此判定失败并置 exitCode=1"
retrieval_hints:
  - "我要把 Bitget agent 全家桶升级到最新版，该跑哪条命令、它内部会执行什么？"
  - "某个包出问题了，怎么回到之前发布过的版本？为什么必须先 uninstall 再 install？"
  - "用户没装 pnpm 只有 npm，安装器怎么选包管理器？装错全局目录是谁的责任？"
  - "为什么 `--dry-run` 还会去访问 npm registry？dry-run 到底门控哪些操作？"
  - "upgrade-all 已经最新了还会重新部署技能吗？（答：会跳过该包，但整体 allOk 时仍按 target 重部署）"
  - "⚠️ 如果你找的是「技能部署到 Claude Code / Codex / OpenClaw 的细节、--target 支持的宿主」，不在这里——在同模块 `installer_skill_deploy` 子文档。"
  - "⚠️ 如果你找的是本仓库 Python 后端调用 Bitget MCP/下单/补 K 线的逻辑，不在这里——在 `backend/src`（market_data/agent、execution、mcp_client）；本模块只装环境，不执行任何交易逻辑。"
  - "本模块也叫『bitget-agent-installer』『元安装器』『meta-installer』『agent hub 安装脚本』，对应需求里的『一键装好 Bitget AI Agent 交易工具』。"
  - "架构归属：新增子命令/新受管包必须落在 `agent_hub-main/installer/cli.mjs` 单文件内（它同时是 bin 入口与全部实现），并且必须同步 `agent_hub-main/README.md` 的 Commands 表与 CHANGELOG——禁止新建第二个可执行脚本。"
architectural_role: "环境装配层 CLI（命令分发 + 版本决策），禁止被业务代码 import"
---

## 对外接口（CLI 契约，本模块唯一的对外面）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `bitget-agent-installer upgrade-all [--target <tools>] [--dry-run]` | 用户/AI→本模块 | 无位置参数 | 遍历 `TARGET_PACKAGES`，逐个比对已装版本与 registry latest，不同则先卸后装；全绿且给了 `--target` 才重部署技能 | `cli.mjs:cmdUpgradeAll` |
| `bitget-agent-installer upgrade <pkg> [--target <tools>]` | 用户/AI→本模块 | `pkg` 必须精确等于 `TARGET_PACKAGES` 之一 | 单包升级；未安装时：TTY 下问 `Install latest? (y/n)`（只有 `y` 继续），非 TTY 下直接安装 | `cli.mjs:cmdUpgrade` |
| `bitget-agent-installer rollback <pkg> --to <version>` | 用户/AI→本模块 | `--to` 取值必须出现在 `pm view pkg versions --json` 结果中 | 回滚到任一已发布版本；非交互且缺 `--to` 直接报错退出码 1 | `cli.mjs:cmdRollback` |
| `bitget-agent-installer [pkg]`（无参数） | 用户/AI→本模块 | 需 TTY | 交互菜单：1=upgrade-all(固定只部署 claude) 2=单包升级 3=单包回滚 4=技能部署 0=退出；非 TTY 时改为打印 `HELP` | `cli.mjs:interactiveMenu` |
| `--version` / `--help(-h)` | 用户→本模块 | 无 | 分别只打印 `CLI_VERSION`、`HELP` 后返回，不触碰 registry | `cli.mjs:main` |

**退出码约定（对外契约）**：任何一步实际执行失败都只做 `process.exitCode = 1`，不 `process.exit()`，让已完成的安装保持完成状态；`main().catch` 兜住异常并同样置 1。**跳过（Already at latest / Cancelled）不算失败，退出码保持 0。**

**子进程契约**：`exec`/`execCapture` 全部以 `spawn(cmd, args, { shell: false })` 执行，因此命令不经过 shell —— 不能传入带管道/引号技巧的参数，也不需要自己转义；`stdio` 上写操作用 `inherit`（用户直接看到 npm 输出），读操作用 `pipe`（要解析 JSON）。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| （外部）`npm` / `pnpm` CLI | 全部包操作与查询的唯一真源：`list -g --depth=0 --json`、`view <pkg> version`、`view <pkg> versions --json`、`root -g` | `execCapture`、`detectPM` | extracted |
| （外部）npm registry | `getLatestVersion` / `getVersionHistory` 需联网；离线时返回 null/[]，命令随之失败退出码 1 | `getLatestVersion`、`getVersionHistory` | extracted |
| （外部）Node 内置模块 | 只用 `node:module` / `node:child_process` / `node:readline` / `node:path`，**零第三方依赖**（发布物只有单文件，加依赖等于自毁） | `createRequire`、`nodeSpawn`、`createInterface` | extracted |
| `agent_hub-main`（package.json） | `bin` 注册可执行名，`version` → `CLI_VERSION`，`files` 决定 `installer/cli.mjs` 是唯一发布代码 | `package.json:bin` | extracted |
| `agent_hub-main/docs` | 上游契约（版本线 3.0.0 / UTA v3 / Node≥20）决定受管集合口径，改集合前须核对文档 | `architecture.md §9 版本策略` | inferred |

反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| 本仓库任何代码 | **无**：全仓 grep 仅 README/CHANGELOG 的文档字符串提到 `npx @bitget-ai/bitget-agent-installer`，Python/TS 运行时代码均不 import 或 spawn 本脚本 | — |
| （外部）终端 AI（Claude Code / Codex / OpenClaw） | README 把 `upgrade-all --target all` 写成给终端 AI 的标准提示词，由 AI 代用户执行 | `cmdUpgradeAll` |

## 典型调用链

### 升级全家桶（最常见入口）

```
npx bitget-agent-installer upgrade-all --target all
  → agent_hub-main/installer/cli.mjs:main          ← 本模块入口（命令分发）
    → cli.mjs:detectPM                             ← 读 npm_execpath 决定 npm|pnpm
    → agent_hub-main_installer_skill_deploy:parseTargets   ← 跨子文档：target 白名单校验
    → cli.mjs:cmdUpgradeAll                        ← 本模块版本决策
      → cli.mjs:getInstalledVersions               ← 跨模块:$ pm list -g --depth=0 --json
      → cli.mjs:getLatestVersion                   ← 跨模块:$ pm view <pkg> version（联网）
      → cli.mjs:exec  [pm uninstall -g <pkg>]      ← 跨模块:$（受 --dry-run 门控）
      → cli.mjs:exec  [pm install -g <pkg>@<ver>]  ← 跨模块:$
      → skill_deploy:deploySkills                  ← 仅当 targets 非空且 allOk=true
```

### 回滚单包（含版本校验）

```
npx bitget-agent-installer rollback @bitget-ai/bitget-agent-cli --to 1.2.0
  → cli.mjs:main → cli.mjs:cmdRollback             ← 本模块入口
    → cli.mjs:validatePkg                          ← 必须命中 TARGET_PACKAGES
    → cli.mjs:getVersionHistory                    ← versions.reverse() 后是"新→旧"
    → versions.includes(targetVersion) 校验         ← 不在列表 → 报错并给出自查命令，exitCode=1
    → cli.mjs:exec [uninstall] → exec [install@to]
      → skill_deploy:deploySkills                  ← 仅当该包在 SKILL_PACKAGES 且给了 --target
```

### 非交互环境（CI / AI 代跑）

```
非 TTY + 无命令  → cli.mjs:main → isInteractive()=false → 只打印 HELP 返回（退出码 0）
非 TTY + rollback 无 --to → cmdRollback 直接报错 exitCode=1（不弹版本菜单）
非 TTY + upgrade 未安装的包 → 跳过 y/n 询问，直接安装 latest
```

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `TARGET_PACKAGES` | `agent-skill`, `signal`, `agent-cli`（均带 `@bitget-ai/` scope） | `agent_hub-main/installer/cli.mjs:9` | 受管包全集，同时是 `validatePkg` 的白名单和 `upgrade-all` 的遍历序 | CHANGELOG 1.1.0：包家族从 `bitget-skill/bitget-signal/bitget-client` 整体改名，旧名在 npm 上已不维护；3.0.0 明确「Managed package set 不变」 |
| `SKILL_PACKAGES` | `agent-skill`, `signal` | `cli.mjs:11` | 只有它们有可部署技能；`cmdUpgrade`/`cmdRollback` 用它决定是否顺带部署 | `cmdInstall` 对不含技能的包直接报 `does not contain installable skills` |
| `CLI_VERSION` | `3.0.0`（`../package.json` 的 version） | `cli.mjs:19` | `--version`/`--help` 的输出源 | BUG 修复：脚本迁入 `installer/` 子目录后仍写 `./package.json`，导致任意命令 `Cannot find module './package.json'`（来源: agent_hub-main/CHANGELOG.md 1.1.0 节）→ **路径必须保持 `../package.json`** |
| `MIN_NODE_MAJOR` | `20.0.0` | `agent_hub-main/package.json` engines | 运行下限，低于它 npx 拉起即可能语法错 | 1.1.0 起从 18 提到 20（Node 18 EOL，来源: CHANGELOG） |
| 回滚展示上限 | `20`（`versions.slice(0, 20)`） | `cli.mjs/cmdRollback` | ⚠️ 现为**内联字面量**：列出可选版本的前 N 项 | 版本列表可能上百项，全量打印会淹没 TTY 选择提示；改动需与 `idx > display.length` 校验同步 |
| 成功/失败标记 | `✓` / `✗` / `⚠` / `[dry-run] $` | `cli.mjs` 各命令 | 输出前缀约定，供用户与终端 AI 判定结果 | 与 `--dry-run` 「Safe to preview」的对外承诺配套（README Why Use It） |

### 必须实现的函数（顺序/互斥关系不可省略）

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `detectPM()` | `cli.mjs:67` | 包管理器只能由此决定，`exec*` 与所有 `pm ...` 参数数组必须复用同一个 `pm`，禁止在命令里硬写 `npm` |
| `parseArgs(argv)` | `cli.mjs:43` | 位置参数解析必须剔除 `--to`/`--target` 的**取值**，否则 `upgrade-all --target all` 会把 `all` 误当成 `<pkg>` |
| `validatePkg(pkg)` | `cli.mjs:177` | 统一"包名未提供/不支持"的错误文案 + `exitCode=1`；新命令必须复用，不要各写一份校验 |
| `getInstalledVersions(pm)` | `cli.mjs:110` | 失败也必须返回「全部包 → null」的 Map，调用方据此区分"未安装"与"查询失败" |
| `getLatestVersion(pm, pkg)` | `cli.mjs:126` | registry 权威版本源；返回 null 视为该包升级失败并继续下一个（`upgrade-all`）或直接退出码 1（`upgrade`）——两处行为差异是刻意的 |
| `cmdUpgradeAll` 的"先 uninstall 再 install"@精确版本 | `cli.mjs:223` | 已装且不同版本 → 必须走 uninstall→install；未装 → 直接 install |
| `main().catch(err)` | `cli.mjs:600` | 顶层兜底：只打 `err.message` 并置 `exitCode=1`，保证任何 rejection 不以 Node 未捕获异常栈结束 |

### 设计决策（两种方案均可行时的选型记录）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 升级写法 | 显式解析 latest → `uninstall -g` → `install -g pkg@<精确版本>` | `pm update -g` / `install pkg@latest` | 精确 pin 让"先卸后装"可预期、并把实际装上的版本号回显给用户；同时是回滚能复用同一段代码的前提（来源: CHANGELOG "uninstalled and replaced in place"） |
| 版本口径 | 永不持久 pin，统一取 registry `@latest` | 在仓库内维护一份"推荐版本表" | 三包共享 3.0.0 UTA v3 线，无 flag 变更即可整体跟随上游；维护版本表会立刻与上游漂移（来源: CHANGELOG 3.0.0 节） |
| registry 查询失败 | 记为 `✗ Failed to fetch latest version` + 置失败，**不降级为"保持已装版本"** | 静默跳过该包（视为已最新） | 静默跳过会让用户误以为全家桶已升级，实际旧包仍在；显式失败 + 退出码 1 才符合 `⚠ Some packages failed.` 的对外承诺 |
| CLI 实现形态 | 单文件、零依赖、只用 node: 内置模块 | 拆成多个 `.mjs` + 依赖库 | `package.json.files` 只发布 `installer/cli.mjs`；拆分或加依赖会让 npx 路径找不到文件/依赖（本仓库另有一个 `agent_hub-main/e2e/mcp-smoke-test.mjs` 属于父包测试，不是运行时依赖） |
| 交互式 vs 非交互式 | 以 `isInteractive()`（`stdin.isTTY`）分流，非 TTY 一律不阻塞等待输入 | 始终弹菜单 | AI/CI 代跑必须能在无人应答下完成；否则终端 AI 会卡死在 `ask()` |
| 「已是最新」 | 完全跳过（不重装、不重部署该包技能） | 幂等重装 | 重装会无谓改动用户全局目录并触发技能重复写入；但注意 `upgrade-all` 结束时只要 `allOk` 就仍会按 target 重部署一轮技能（见 skill_deploy 子文档） |

## 背景与动机：为何需要一个“元”安装器

上游把一个生态拆成了五个包（SDK / CLI / MCP / Skill + 独立的 signal），它们的发布节奏一致但版本各自独立。若让用户手工“先装 SDK、再装 CLI、再进每个包跑自己的安装脚本”，会出现三类真实故障：装到一半断电留下版本错配（CLI v2 + Skill v3 导致技能里的 verb 在 CLI 里不存在）、升级时 npm 不降级而残留旧版、新版本换了包名（历史上的 `bitget-hub` → `bitget-agent-installer`，旧名已停维）。本模块的业务职责就是把这三类风险收敛为一条命令：以 npm registry 为唯一真源、以“先卸后装精确版本”为统一动作、以 `@latest` 为统一版本口径。因此本子文档所描述的命令与退出码不是“工具函数”，而是对终端用户与终端 AI 的行为承诺：`agent_hub-main/README.md:68` 把 `upgrade-all --target all` 直接当提示词交给用户的终端 AI，意味着命令集一旦变更（改名、改参数位、改默认行为），存量文档里的 AI 指令会立即失效。同理，`agent_hub-main/CHANGELOG.md` 把“所有命令与 flag 不变”当作 3.0.0 升级中的正式兼容性声明——改动前必须确认这个承诺仍然成立。

## 命令间行为差异（改动时逐条对齐）

四个写命令看似同构，其行为差异全在“何时问用户、何时部署、何时中止”三处，而这三处就是对外契约本体：

- `upgrade-all` 是**无提问、可半成功**的：它不询问任何东西（非 TTY 安全），逐包独立推进，所有包绿了才把技能重部署一轮（target 缺省时完全不部署）。若把任一包的失败改成“提前中止”，会造成“装了三个包只升一个就停”的错配状态比现在更糟——这正是现设计选择“继续跑但置失败码”的理由。
- `upgrade <pkg>` 是**可提问、单包终止**的：只在“该包未安装 + 处于 TTY”时弹 (y/n)，输入不是 `y` 就当作 `Cancelled.` 并以退出码 0 正常结束（用户主动取消≠失败）；同样“已是最新”也是 0。若把取消归为失败，终端 AI 会在一键脚本里把它当成安装报错去重试。
- `rollback` 是**四个命令里唯一硬要求版本存在性校验**的：`--to` 的值必须出现在 `pm view <pkg> versions --json` 结果里，否则报错并告知自查命令——因为回滚往往发生在故障现场，一个错字不应变成“先卸了再用错码重试”。同理它**不做“当前已最新”的短路判定**（它是 `current === targetVersion` 短路，语义是“已在目标版本”）。
- `install` 不碰包本身，只做部署；缺包时不代装（见 skill_deploy 子文档）。因此“先 upgrade 后 install”是两命令的组合用法，而不是 install 的内嵌行为。

## 故障定位顺序（真实排查路径）

用户报“安装器跑了但没作用”时，按以下顺序定位，每一步对应一个具体守卫：“能不能启动”（`CLI_VERSION` 读取、Node ≥ 20）→ “包管理器选对了没”（`detectPM` 看 `npm_execpath`；用 `corepack pnpm` 与直接用 `npm i -g` 的人会在不同全局目录间错位）→ “已装版本读到没”（`getInstalledVersions` 失败不报错而是归为 null，表现为“本已装着却报 not globally installed”）→ “latest 拿到没”（registry/代理/离线）→ “写操作执行没”（uninstall 成、install 败会直接把包**弄没了**，这是“先卸后装”已知代价，所以失败时必须置退出码 1 提醒用户重跑）→ “技能部署没”（见 skill_deploy）。注意前四步全部是只读查询，不受 `--dry-run` 影响，因此**用 dry-run 可以把“环境/网络类故障”从“命令逻辑故障”里剥出来**。

## 业务语义与判定规则（非表格速记）

- **“已是最新”的判定只看版本字符串相等**（`current === latest`），不比日期也不比 semver 大小；⚠️ 若 registry 上的 latest 实际低于本地装着的预发布版，安装器会把它“降”到 latest 并认为这是一次升级——因为设计口径就是“永远跟随 registry latest”。
- **失败不中断**：`upgrade-all` 对单包失败只置 `allOk=false` 并继续下一个包，最后统一打印 `⚠ Some packages failed.`；只有 `upgrade`/`rollback` 这类单包命令才提前 return。相应地，**部分成功时仍会因 allOk=false 而跳过技能部署**，即“三个包只装成两个”时技能不会被接线。
- **`--dry-run` 的真实边界**：它只把写操作转成 `[dry-run] $ ...` 打印（`exec` 的 `dryRun` 分支恒返回 0），因此打印的 `current → latest` 对比、target 校验、全局根探测都是真实查询结果；离线环境下 dry-run 仍会因 `pm view` 失败而报错，这是预期行为而非 bug。
- **非交互守卫**：`stdin.isTTY !== true` 时，无子命令 → 只打 HELP（不算失败）；rollback 缺 `--to` → 报错退出码 1；upgrade 未安装的包 → 跳过多余询问直接装。这样终端 AI / CI 代跑不会卡在 `ask()` 上。
- **幂等目标**：本模块没有自己的状态文件，“已装且已最新”的重复执行只产出一行 `Already at latest (…) — skipping`，不触碰全局目录；因此用户可以放心重跑——但这也意味着**本地被手工改坏的包文件不会被修复**（不会强制重装）。

## 变更风险（改这里会破坏什么）

- 动 `TARGET_PACKAGES` / `SKILL_PACKAGES`：`upgrade-all` 覆盖面与"含技能"判定同时改变；误纳 `bitget-agent-mcp` 会给一个设计上不做全局安装的包做 `install -g`，误纳 `bitget-agent-sdk` 会把库依赖当工具装（**禁止**，来源: CHANGELOG 3.0.0「Unchanged — Managed package set」）。
- 动 `CLI_VERSION` 取值路径：`./package.json`→`../package.json` 的历史事故会重演——**所有**命令（含 `--help`）都会崩（来源: agent_hub-main/CHANGELOG.md 1.1.0）。
- 动 `parseArgs` 的 flag 值剔除逻辑：`<pkg>`/`--to`/`--target` 位置会互相污染，最典型症状是把 `all`/版本号当包名传给 `validatePkg` 而报 Unknown package。
- 动 `exec` 的 `shell:false` 或 stdio 配置：写操作输出不再继承（用户看不到 npm 进度），或在 Windows 下需要 shell 才能启动 `.cmd` shim —— 改这一处即改变跨平台安装可达性，必须实测 `--dry-run` 与真实两态。
- 把「查询」也塞进 dryRun 门控：会破坏 `--dry-run` 需要真实 registry 信息展示 `current → latest` 的语义（现约定：**只有写走 dryRun 开关**）。
- 本模块与 `agent_hub-main/docs` 记录的上游契约、`agent_hub-main/README.md` 的 Commands/Flags 表是同一份对外承诺的三处副本：改 CLI 不同步文档，等于让终端 AI 按 README 生成的命令失效（README:68 就是给 AI 的提示词）。
