## ADDED Requirements

### Requirement: 自托管 Web 字体来源与许可

系统 SHALL 通过项目依赖（npm 包）自托管全部正文 Web 字体，字体文件 MUST 随构建产物一同输出；系统 MUST NOT 在运行时向任何第三方字体 CDN（如 `fonts.googleapis.com`、`fonts.gstatic.com`）发起请求。所引入的每款字体 MUST 采用允许再分发的开源许可（OFL-1.1 或同等），且版本 SHALL 由 lockfile 锁定。

#### Scenario: 构建产物包含字体文件

- **WHEN** 执行生产构建
- **THEN** 字体 `.woff2` 文件 SHALL 出现在构建产物的静态资源目录中，且构建过程 MUST NOT 产生字体路径无法解析的警告

#### Scenario: 运行时无第三方字体请求

- **WHEN** 在浏览器中加载应用并检查网络请求
- **THEN** 全部字体请求 SHALL 指向应用自身域名，MUST NOT 出现指向外部字体 CDN 的请求

#### Scenario: 断网环境字体可用

- **WHEN** 在无外网连接的环境中加载应用
- **THEN** 西文与中文 SHALL 均以自托管字体正确渲染，MUST NOT 降级为系统兜底字体或出现缺字方块

#### Scenario: 许可与版本锁定

- **WHEN** 审查字体依赖
- **THEN** 每款字体 SHALL 为 OFL-1.1 或同等允许再分发的许可，且其版本 SHALL 在 lockfile 中被固定

### Requirement: 中西文按字符集分流

系统 SHALL 通过单一字体栈配合每个 `@font-face` 的 `unicode-range` 声明，实现中西文逐字符分流：拉丁字母、阿拉伯数字与西文标点 SHALL 由西文字体渲染，汉字与 CJK 标点 SHALL 由中文字体渲染。西文字体 MUST 排在中文字体之前，以防含拉丁子集的中文字体抢先命中西文字符。系统 MUST NOT 依赖语言选择器（如 `:lang()`）切换字体，因为中英文常混排于同一文本节点。

#### Scenario: 同一文本节点内中英混排分流

- **WHEN** 渲染包含中英文与数字的混排文本（如 `BTC 现货 8000`）
- **THEN** 拉丁字符与数字 SHALL 由西文字体渲染，汉字 SHALL 由中文字体渲染，二者同时正确显示于同一文本节点内

#### Scenario: 西文字体优先于中文字体

- **WHEN** 检查生效的字体栈顺序
- **THEN** 西文字体 SHALL 位于中文字体之前，纯拉丁文本 MUST NOT 落到中文字体的拉丁子集上

#### Scenario: 西文字体不含 CJK 时正确回落

- **WHEN** 渲染汉字，而西文字体不包含该字形
- **THEN** 该字符 SHALL 回落到中文字体渲染，MUST NOT 显示为缺字方块

#### Scenario: 按需下载字符集分片

- **WHEN** 加载以中文为主的界面
- **THEN** 浏览器 SHALL 仅下载 `unicode-range` 实际命中的字体分片，MUST NOT 下载全部中文字形分片

### Requirement: 字体定义单一真源

系统 SHALL 以 CSS 变量作为字体栈的唯一定义来源，所有消费方（全局 `html`/`body` 样式、Tailwind `font-sans` 工具类、图表 Canvas 绘制配置）SHALL 引用同一份定义。系统 MUST NOT 在多处各自维护内容不一致的字体栈。

#### Scenario: 工具类与全局样式字体一致

- **WHEN** 比较使用 `font-sans` 工具类的元素与未使用该类的 `body` 文本
- **THEN** 二者生效的字体栈 SHALL 完全一致

#### Scenario: 组件无需修改类名

- **WHEN** 更换字体栈内容
- **THEN** 已使用 `font-sans` 的组件 SHALL 自动继承新字体，MUST NOT 需要逐个修改组件的 `className`

#### Scenario: 无重复字体栈定义

- **WHEN** 审查前端样式与配置
- **THEN** 正文字体栈 SHALL 只存在一处权威定义，其余位置 SHALL 为对该定义的引用

### Requirement: Canvas 图表文字字体一致性

系统 SHALL 为图表 Canvas 绘制的文字（坐标轴刻度、十字光标文字、价格标记文字）显式配置字体族，使其与 DOM 面板文字保持一致。由于 Canvas 不解析 CSS 变量且不继承 CSS `font-family`，系统 SHALL 在图表配置中传入与 CSS 变量等值的字体栈字符串。系统 SHALL 在字体加载完成后再进行 Canvas 文字绘制或触发重绘，以避免兜底字体被永久光栅化。

#### Scenario: 图表刻度与面板字体一致

- **WHEN** 图表渲染完成并对比坐标轴刻度文字与面板表格文字
- **THEN** 二者 SHALL 呈现相同字体的字形

#### Scenario: 字体加载完成后绘制

- **WHEN** 图表在自托管字体尚未加载完成时挂载
- **THEN** 系统 SHALL 等待字体加载就绪后再绘制或重绘 Canvas 文字，最终显示的刻度文字 MUST NOT 停留在兜底字体

#### Scenario: 中英混排刻度正确渲染

- **WHEN** 图表刻度或十字光标文字包含中文与数字
- **THEN** 数字 SHALL 由西文字体渲染、中文 SHALL 由中文字体渲染，MUST NOT 出现缺字方块

### Requirement: 字体加载行为与布局稳定

系统 SHALL 使用 `font-display: swap` 策略，保证字体加载期间文字始终可读，MUST NOT 出现文字长时间不可见（FOIT）。数字列 SHALL 保持 `tabular-nums` 以确保同字体内数值刷新时字符不横向抖动。

#### Scenario: 加载期间文字可读

- **WHEN** 自托管字体仍在下载
- **THEN** 文字 SHALL 以兜底字体立即可见，字体到达后 SHALL 自动替换为目标字体

#### Scenario: 数值刷新不抖动

- **WHEN** 价格、成交量等数字列在字体加载完成后持续刷新
- **THEN** 数字 SHALL 应用 `tabular-nums`，字符宽度 MUST NOT 随数值变化而横向跳动
