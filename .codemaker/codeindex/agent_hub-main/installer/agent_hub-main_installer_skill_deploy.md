---
type: "Fragment"
id: agent_hub-main/installer/skill_deploy
title: "技能向 AI 宿主的部署契约"
description: "Bitget 的技能包是怎么被写进 Claude Code / Codex / OpenClaw 的技能目录，`--target` 又受哪些白名单与前置条件限制？"
parent: /agent_hub-main/installer/_overview.md
fragment: skill_deploy
entity_names:
  constants:
    - name: DEPLOY_TARGETS
      source: agent_hub-main/installer/cli.mjs:13
      value: "{ claude: '~/.claude/skills', codex: '~/.codex/skills', openclaw: '~/.openclaw/skills' }（同时决定 --target 合法取值集合）"
    - name: DEFAULT_TARGET
      source: agent_hub-main/installer/cli.mjs:cmdInstall（parseTargets(targetStr || "claude")）
      value: "\"claude\"（仅 install 子命令的缺省；upgrade/upgrade-all 不给 --target 则完全不部署）"
    - name: TARGET_ALL_KEYWORD
      source: agent_hub-main/installer/cli.mjs:parseTargets
      value: "\"all\" → Object.keys(DEPLOY_TARGETS)，即 claude,codex,openclaw 三个宿主"
    - name: SKILL_INSTALL_SCRIPT_RELATIVE
      source: agent_hub-main/installer/cli.mjs:deploySkills（join(globalRoot, pkg, "scripts", "install.js")）
      value: "\"scripts/install.js\"（相对每个技能包的全局安装根；路径与 `--target <逗号分隔列表>` 参数是跨包硬契约）"
    - name: MENU_UPGRADE_ALL_TARGET
      source: agent_hub-main/installer/cli.mjs:interactiveMenu case \"1\"
      value: "[\"claude\"]（菜单里的「Upgrade all」硬编码只部署 Claude Code，与命令行 `--target all` 不一致）"
    - name: INSTALL_PREREQ
      source: agent_hub-main/installer/cli.mjs:cmdInstall / interactiveInstall
      value: "目标技能包必须已在全局安装（installed.get(p) 非空）；否则报 not globally installed 并提示先跑 `upgrade <pkg>`，exitCode=1"
retrieval_hints:
  - "技能部署到 Claude Code / Codex / OpenClaw 时具体调用的是什么脚本、参数长什么样？"
  - "--target all 会部署到哪几个宿主？不给 --target 时 upgrade 还会部署技能吗？"
  - "为什么 `install` 命令报 not globally installed，它不是应该自己装吗？"
  - "菜单里选「Upgrade all」为什么只往 Claude Code 里部署技能？"
  - "技能没生效、AI 里看不到 Bitget 工具时，该查哪一层？"
  - "⚠️ 如果你找的是升级/回滚版本、npm registry 查询、包管理器探测，不在这里——在同模块 `installer_cli_commands` 子文档。"
  - "⚠️ 如果你找的是本仓库前端/后端的 UI 或 API，不在这里——在 `frontend/src`、`backend/src`；本模块只写用户机器的 ~/.claude|~/.codex|~/.openclaw/skills 目录，绝不碰仓库内文件。"
  - "本模块也叫『技能部署』『skills 安装』『AI 宿主接线』，对应需求里的『让 Claude Code / Codex 认识 Bitget 工具』『把交易技能装进终端 AI』。"
  - "架构归属：新增支持的 AI 宿主必须只改 `agent_hub-main/installer/cli.mjs` 的 `DEPLOY_TARGETS` 常量表（并同步 README 的 `--target` 说明与 CHANGELOG）；禁止在新脚本里另立一套宿主目录映射，否则 `--target all` 会漏掉新宿主。"
architectural_role: "环境装配层（宿主技能分发），副作用外置在用户 home 目录，禁止在业务代码中调用"
---

## 验收标准：什么才叫“部署成功”

本模块没法自备验收：它的成功判定是“子进程退出码 0”，而被部署脚本完全可以在退出码 0 的情况下一个字没写（例如宿主目录不存在时静默创建、或目标宿主名不匹配时忽略处理）。因此知识库层面把验收定在三层，改动 `deploySkills` 或 `DEPLOY_TARGETS` 时需逐层确认：

1. 命令层：`pm root -g` 能拿到路径，且拿到的路径里确实有 `<pkg>/scripts/install.js`（pfx/全局目录错位时这一步会先把空转报成“部署成功”）。
2. 参数层：子进程收到的 `--target` 串与预期一致（dry-run 是验这一层的安全手段：它能完整打印 `[dry-run] $ node .../install.js --target claude,codex,openclaw` 而不碰磁盘）。
3. 产物层：目标宿主的 `skills/` 目录实际出现/更新了技能文件，并能在该宿主里用一句 “What Bitget tools are available?” 得到回应（README「Get Started」第 3 步的官方验收方式）。

## 与本仓库其他层的职责分界

- 本模块只面向“用户机器的环境”，不面向“本仓库的运行”：它不写仓库内任何文件（唯一向仓库内回写的可执行入口是各包自己的技能目录，在 `~/` 而非项目下）。
- backend 拉行情/交易不依赖技能已部署：`backend/src/market_data/mcp_client.py` 自己以 `npx @bitget-ai/bitget-agent-mcp` 拉起 MCP（根 README.md 的 `MD_MCP_COMMAND` / `MD_MCP_ARGS`），所以**删光宿主技能也不会让 backend 报错**，只会让“在终端 AI 里直接让 Agent 交易”这条路不可用——这是改动本模块时最容易误判影响面的地方。
- 凭证与风控不在本模块：默认纸面交易、实盘显式开启、凭证仅环境变量等安全基线由 openspec 规定并在上游包内实现；本模块只传 `--target`，不传密钥、不写 `.env`。
- 与 `agent_hub-main/docs` 的关系：文档描述“上游包能做什么”，本模块保证“用户装到的是哪个版本的上游包”；两边共同指向 3.0.0（UTA v3）版本线，任何一侧改变版本口径而未通知对面，都会导致“按新能力写需求、环境里还是旧包”。

## 背景：部署为什么被剥成“传参”而非“拷文件”（业务上下文）

上游把技能分发拆在两个地方：安装器知道“有哪些 AI 宿主”（`DEPLOY_TARGETS`），被部署包知道“自己的技能长什么样、该落到宿主目录的哪里”。本模块因此只负责三件事：确定全局包根、拼出 `<root>/<pkg>/scripts/install.js`、把宿主列表以**一个逗号串**传给 `--target`。这个分工的现实意义是：新增一个 AI 宿主时只改安装器的常量表（不改包），而新增/重排技能文件时只改上游包（不改安装器）——两边各自演进而不必同步版本。反过来说，这也使本模块的失败模式非常“安静”：npm 命令全部返回 0、但宿主目录没变时，只有用户向 AI 问一句“What Bitget tools are available?”才能发现（README Get Started 第 3 步的验收方式）。因此凡改动 `deploySkills`，验证标准**不是命令退出码**，而是目标宿主 `skills/` 目录实际多出/更新了技能文件。

## 对外接口（部署契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `install [pkg] [--target <tools>]` | 用户/AI→本模块 | `pkg` ∈ `SKILL_PACKAGES`；`--target` 缺省 `claude` | 把**已全局安装**的技能包部署到宿主。不给 `pkg` 则部署全部技能包（`[...SKILL_PACKAGES]`）；给了非技能包直接拒绝 | `cli.mjs:cmdInstall` |
| `upgrade-all/upgrade [--target <tools>]` | 用户/AI→本模块 | `--target` 可空 | 升级成功后顺带部署；**不给 target 就不部署**；`upgrade-all` 仅在全部包升级成功（`allOk`）时才部署 | `cli.mjs:cmdUpgradeAll` / `cmdUpgrade` |
| `<pkg>/scripts/install.js --target <tool1,tool2>` | 本模块→（外部）技能包 | 参数字符串等于 `targets.join(",")`；工作目录继承当前进程 | 由被部署包自己实现"往宿主目录写 markdown"的细节；本模块只负责定位脚本、传参、聚合失败 | `cli.mjs:deploySkills` |
| 交互菜单 4「Install skills to AI tools」 | 用户→本模块 | 先选宿主（数字可逗号多选，最后一项=All），再选包（1=agent-skill、2=signal、3=All） | 与 `install` 走同一段 `deploySkills`，但入口自己解析编号（不走 `parseTargets`） | `cli.mjs:interactiveInstall` |

**前置条件与失败语义（对外承诺）**

- 部署前必须能拿到全局根：`getGlobalRoot` 失败即 `✗ Could not determine global package root` 并返回 `false`（调用方置 `exitCode=1`）。技能部署**不做**包安装，缺包只提示 "Run `npx bitget-agent-installer upgrade <pkg>` first"。
- 单个包部署失败会标 `✗ Skill deployment failed for <pkg>`，但不中断其余包（`allOk=false` 只汇聚结果）。
- `--dry-run` 下 `exec` 只打印 `[dry-run] $ node .../scripts/install.js --target ...`，因此**不会**真正写入任何宿主目录，但仍会真实执行 `pm root -g`。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| （外部）`@bitget-ai/bitget-agent-skill` | 交易推理技能包，内含 `scripts/install.js` 负责写宿主技能目录 | `scripts/install.js`、`--target` | extracted |
| （外部）`@bitget-ai/bitget-signal` | 免凭证行情技能包（macro/on-chain/sentiment/technical/news 五类），同一部署契约 | `scripts/install.js` | extracted |
| （外部）`npm`/`pnpm` 全局根 | 技能包脚本的定位基准 `pm root -g`；根路径取错会"命令成功但技能没写上" | `getGlobalRoot` | extracted |
| （外部）`~/.claude/skills`、`~/.codex/skills`、`~/.openclaw/skills` | 真正的写入目标，由被部署包的脚本按 `--target` 决定；本模块只声明宿主集合 | `DEPLOY_TARGETS` | extracted |
| `agent_hub-main/installer/cli_commands`（同模块） | 复用 `exec` / `getGlobalRoot` / `getInstalledVersions` 与统一退出码语义 | `exec`、`getInstalledVersions` | extracted |
| `agent_hub-main/docs` + `openspec/specs/system-architecture/spec.md` | 规定"以上游 npm 包为唯一能力来源（不 fork）"与"AI Agent 走 MCP/信号包"的边界，约束本模块只能分发、不能自造技能内容 | `system-architecture` Requirement「分层架构与主语言」 | extracted |

反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| 本仓库代码 | **无**：没有任何 Python/TS 代码触发技能部署（backend 走自己的 `npx @bitget-ai/bitget-agent-mcp`，见根 README.md:168） | — |
| （外部）终端 AI（Claude Code / Codex / OpenClaw） | 用户按 README:68 的提示词让终端 AI 执行 `upgrade-all --target all`，由 AI 代跑并自行验证部署结果 | `cmdUpgradeAll` → `deploySkills` |

## 典型调用链

### 只部署技能（不升级）

```
npx bitget-agent-installer install @bitget-ai/bitget-signal --target claude,codex
  → cli.mjs:cmdInstall
    → cli.mjs:parseTargets("claude,codex")        ← 白名单校验（合法集合 + all 关键字）
    → SKILL_PACKAGES 校验                          ← 非技能包 → does not contain installable skills, exitCode=1
    → cli.mjs:getInstalledVersions                 ← 缺包则提示先 upgrade，exitCode=1（不代装）
    → cli.mjs:deploySkills
      → cli.mjs:getGlobalRoot                     ← 跨模块:$ pm root -g
      → cli.mjs:exec [node, <root>/@bitget-ai/bitget-signal/scripts/install.js, --target, "claude,codex"]
                                                  ← 跨模块:被部署包自行写入 ~/.claude/skills 与 ~/.codex/skills（受 --dry-run 门控）
```

### 升级后自动接线（README 标准路径）

```
npx bitget-agent-installer upgrade-all --target all
  → cli.mjs:cmdUpgradeAll（逐包 uninstall→install@latest；任一失败 allOk=false）
  → if (targets && allOk):
      SKILL_PACKAGES 过滤 → deploySkills(..., ["claude","codex","openclaw"], dryRun)
        → 每包一次 `node <root>/<pkg>/scripts/install.js --target claude,codex,openclaw`
```

### 菜单路径（注意 target 差异）

```
npx bitget-agent-installer（无参数，TTY）
  → cli.mjs:interactiveMenu
    case "1" → cmdUpgradeAll(pm, dryRun, ["claude"])        ← 硬编码只部署 claude
    case "4" → interactiveInstall → ask 宿主编号（逗号多选，最后一项=All）→ ask 包编号 → deploySkills
```

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `DEPLOY_TARGETS` | `claude`→`~/.claude/skills`；`codex`→`~/.codex/skills`；`openclaw`→`~/.openclaw/skills` | `cli.mjs:13` | 宿主白名单 + 展示目录 + `all` 关键字展开源（用 `Object.keys` 而非另写字面量） | `--target` 现役三宿主为对外承诺（README Flags：`claude, codex, openclaw, all`）；新增宿主必须改这张表，否则 `all` 会漏 |
| `DEFAULT_TARGET` | `"claude"` | `cli.mjs/cmdInstall` | `install` 子命令不给 `--target` 时的缺省宿主 | README Flags 明示 "default: claude"；但 `upgrade`/`upgrade-all` 缺省是"不部署"，两处缺省不同是刻意区分 |
| `TARGET_ALL_KEYWORD` | `"all"` | `cli.mjs/parseTargets` | 展开为全部宿主键 | 与 `--target all` 文档一致；未展开会让 README:68 的标准提示词只生效一个宿主 |
| `SKILL_INSTALL_SCRIPT_RELATIVE` | `"scripts/install.js"` | `cli.mjs/deploySkills` | 跨包调用契约：脚本名与相对位置由**被部署包**决定 | 路径写死在安装器里，属于对上游包的隐含契约；上游改脚本名 → 部署静默失败（仅 stderr 提示），本仓库代码不会报错 |
| `MENU_UPGRADE_ALL_TARGET` | `["claude"]` | `cli.mjs/interactiveMenu` | 交互菜单「Upgrade all」只部署 Claude Code | 现状与命令行 `--target all` 行为不同；⚠️ 若需求要求"菜单与命令行等价"，这里必须改为 `Object.keys(DEPLOY_TARGETS)`，属已知分歧点 |
| 技能包集合 | 见 `SKILL_PACKAGES`（`cli_commands` 子文档） | `cli.mjs:11` | 只有 `agent-skill` / `signal` 有技能；`agent-cli` 与 `agent-mcp`/`sdk` 均不可部署 | `cmdInstall` 的拒绝分支把该判定写成了对外错误文案，改集合会同时改文案 |

### 必须包含的部署参数（不可省略/不可改写）

| 调用点 | 字段 | 形式 | 说明 |
|--------|------|------|------|
| `deploySkills` → `install.js` | `--target` | `push("--target", targets.join(","))` | **必须传逗号拼接的单个参数**（不是多次 `--target`）；上游脚本按此格式解析 |
| `deploySkills` → `install.js` | 命令 | `node <globalRoot>/<pkg>/scripts/install.js` | 用 Node 直接执行，不经 shell、不依赖包内 bin 注册；`<pkg>` 为带 scope 的全名 |
| `interactiveInstall` | 宿主选择 | 数字编号（可逗号多选），最后一项 `targetKeys.length + 1` = All | 越界/空选择 → `Cancelled.` 且**不置失败退出码** |
| `interactiveInstall` | 包选择 | `1`=agent-skill、`2`=signal、`3`=All | 文案里的 "Bitget-only signals rolling in" 属产品口径，改动需同步 README 的 skill 列表 |

### 必须实现的函数（不可被常量或内联逻辑替代）

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `parseTargets(targetStr)` | `cli.mjs:192` | 唯一 target 解析入口：负责 `all` 展开、逗号拆分 trim、非法值报错并置 `exitCode=1`（返回 null 让调用方中止）；**禁止**在命令里手写 target 字符串拼接 |
| `deploySkills(pm, pkgNames, targets, dryRun)` | `cli.mjs:150` | 唯一部署出口：先取 globalRoot，逐包 `SKILL_PACKAGES.includes()` 过滤，聚合 `allOk`；新增宿主/包一律走它 |
| `getGlobalRoot(pm)` | `cli.mjs:144` | `pm root -g` 包装；为 null 时部署**必须**中止并报错，不可退化为"当前目录相对路径" |
| `isInteractive()` | `cli.mjs:217` | 交互菜单与 `ask()` 的前置门；非 TTY 下不得进入任何等待输入的路径 |
| `install.js` 部署失败的处理分支 | `cli.mjs:deploySkills` | `code !== 0 && !dryRun` 才计失败；dry-run 下不判定失败（dry-run 恒返回 0） |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 部署职责归属 | 本模块只传 `--target`，写宿主目录的细节交给**被部署包**的 `scripts/install.js` | 安装器自己按 `DEPLOY_TARGETS` 复制 markdown | 技能内容与宿主格式属于各包自有演进（README:315 明示各包参考文档在本包仓库），安装器复制法会随技能结构变化立刻失效 |
| 部署时机 | 升级成功后顺带部署，且 `upgrade-all` 要求 `allOk` 才部署；`install` 只部署已装包 | 每次都自动部署 / `install` 自动代装缺失包 | 避免半失败状态下写入不一致的技能版本；`install` 代装会让"部署"与"升级"两个动作的失败语义混在一起 |
| 缺省 target | `install` 缺省 `claude`；`upgrade*` 缺省不部署 | 三者统一缺省 `claude` / 三者统一不部署 | 保持 README 已公示的行为（upgrade 是纯版本操作，技能接线需显式 opt-in；install 的语义本身就是部署） |
| 宿主目录命名来源 | 以 `DEPLOY_TARGETS.dir` 仅作**展示**，真实写入路径由被部署包的 install.js 决定 | 由安装器把 dir 传给上游 | 上游脚本自有宿主路径知识；传 dir 会形成第二个真源，双源必然漂移 |

### 变更风险（改这里会破坏什么）

- 改 `DEPLOY_TARGETS`（增删键名）：既改 `--target` 白名单、改 `all` 展开集合、也改交互菜单编号顺序；漏改 README 的 `--target` 说明与菜单项会让文档与行为不一致，用户按文档传参直接 `Unknown target(s)` （exitCode=1）。
- 改 `install.js` 的路径/参数形态：部署会静默失效（npm 侧无感知），用户症状是"AI 里没有 Bitget 技能"，排查成本极高——这条契约**必须**保持 `join(globalRoot, pkg, "scripts", "install.js")` + `--target <comma list>`。
- 把部署放进 dryRun：`--dry-run` 的对外承诺是"只预览、不改环境"；破坏它会让用户在"先试一下"时真的改写 `~/.claude/skills`。
- 让菜单 case 1 与命令行语义继续分叉：`upgrade-all` 经菜单只装 Claude Code、经命令行装全部——同一句"升级全家桶"在两个入口结果不同，是当前已知的行为不一致点，改动需同时确认 README「_(no arguments)_」一行的描述。
- 增加"install 自动代装缺失包"：会与 `cmdInstall` 的 `not globally installed` 提示文案冲突，并把两个动作的失败码合并，用户无法分辨是"装失败"还是"部署失败"。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/system-architecture/spec.md`（仅提炼接口摘要，非完整规范）

- **依赖以包形式引入**：系统集成 Bitget 交易/行情能力时，SHALL 通过 npm 包 `@bitget-ai/bitget-agent-*` 引入，**仓库内不得包含被 fork 的其源码副本**。→ 对本模块的含义：技能与 CLI 能力只能靠"装/升级上游 npm 包 + 向宿主部署"获得，禁止在 `agent_hub-main/**` 内改包逻辑或自造技能内容来绕过安装流程（来源: openspec/specs/system-architecture/spec.md）。
- **分层架构与主语言**：系统以依赖形式消费 `bitget-agent-hub`（`bitget-agent-sdk`/`bitget-agent-mcp`/`bitget-signal`），不得 fork 修改其源码；各层只能通过公开接口调用，**不得跨层直接访问 Bitget API 绕过风控执行层**（来源: openspec/specs/system-architecture/spec.md）。→ 对本模块的含义：本模块受管的三个包只是"工具面/技能面的载体"，装好它们不等于放开交易风控；风控执行层仍在本仓库 backend。
- **AI Agent 走 MCP**：AI Agent 需要下单、查行情或获取新闻/宏观分析时，通过 `bitget-agent-mcp` / `bitget-signal` 的工具调用完成，且**不经由本模块**（本模块只负责环境装配，MCP 由宿主按需 `npx` 拉起）。→ 与本模块的边界：`bitget-agent-mcp` 刻意不在 `TARGET_PACKAGES` 内，因为它没有全局安装可升级/回滚（来源: openspec/specs/system-architecture/spec.md + agent_hub-main/CHANGELOG.md 3.0.0 节）。
- **安全基线默认纸面 / 凭证仅环境变量**：系统 SHALL 默认 paper-trading，实盘必须显式开启，凭据 MUST 仅从环境变量读取（来源: openspec/specs/system-architecture/spec.md）。→ 对本模块的含义：本模块**不得**新增任何写入凭证、`.env` 或宿主配置中密钥字段的部署步骤；技能部署只写技能定义文件。

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/README.md`、`agent_hub-main/CHANGELOG.md`、`agent_hub-main/package.json`（原文已提炼，非完整转录）

- 对外命令/flag 表以 README「Installer」节为准：`upgrade-all` / `upgrade <pkg>` / `rollback <pkg> --to <version>` / `install [pkg] [--target <tools>]`，flag 为 `--target`、`--dry-run`、`--version`/`--help`（来源: agent_hub-main/README.md:130-145）。
- 部署承诺："wires skills straight into Claude Code, Codex, and OpenClaw via `--target`"、"Safe to preview — `--dry-run` prints every command without running it"（来源: agent_hub-main/README.md「Why Use It」）。
- 版本口径：安装器与 agent family 共用 3.0.0 版本线；`upgrade-all` 因统一取 `@latest` 而无需改 flag 即可拿到 UTA v3 版本（来源: agent_hub-main/CHANGELOG.md 3.0.0 节）。
- 受管集合豁免：`@bitget-ai/bitget-agent-mcp` 按设计不归本模块管理（宿主按需 npx），`@bitget-ai/bitget-agent-sdk` 是库依赖、无需单独安装（来源: agent_hub-main/CHANGELOG.md 3.0.0 节「Unchanged」）。
