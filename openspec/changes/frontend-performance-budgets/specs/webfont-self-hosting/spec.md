## MODIFIED Requirements

### Requirement: 字体加载行为与布局稳定

系统 SHALL 使用 `font-display: swap` 策略，保证字体加载期间文字始终可读，MUST NOT 出现文字长时间不可见（FOIT）。数字列 SHALL 保持 `tabular-nums` 以确保同字体内数值刷新时字符不横向抖动。

`tabular-nums` 仅对齐**字形宽度**，无法约束**位数增长**引起的容器宽度变化。因此数值展示单元 SHALL 预留稳定宽度（或以等宽列/网格对齐），使数值在位数变化时（如 `+0.05%` 变为 `+12.34%`）MUST NOT 撑开容器或推移相邻元素。

#### Scenario: 加载期间文字可读

- **WHEN** 自托管字体仍在下载
- **THEN** 文字 SHALL 以兜底字体立即可见，字体到达后 SHALL 自动替换为目标字体

#### Scenario: 数值刷新不抖动

- **WHEN** 价格、成交量等数字列在字体加载完成后持续刷新
- **THEN** 数字 SHALL 应用 `tabular-nums`，字符宽度 MUST NOT 随数值变化而横向跳动

#### Scenario: 位数增长不推移相邻元素

- **WHEN** 同一个涨跌幅或价格单元的数值位数增加（例如由 `+0.05%` 变为 `+12.34%`，或价格由 3 位变为 5 位整数）
- **THEN** 该单元 SHALL 保持其占位宽度不变，相邻元素的位置 MUST NOT 发生位移，且 SHALL NOT 产生累积布局位移

#### Scenario: 数值单元宽度在混合数据下稳定

- **WHEN** 同一列同时渲染正负号、不同位数与不同精度的数值
- **THEN** 该列各行 SHALL 对齐，行高与列宽 SHALL NOT 因单个数值变化而改变

## ADDED Requirements

### Requirement: 字体声明块的体积占比约束

`@font-face` 声明所构成的 CSS SHALL NOT 主导渲染阻塞的关键路径。字体声明块的体积 SHALL 设定上限，并使渲染阻塞 CSS 的总体积不超过既定预算。

当字体分片数量较多时，系统 SHALL 采用不阻塞首屏渲染的组织方式（例如将字体定义从渲染阻塞样式中拆分、或按需注入），MUST NOT 让数百条字体声明全部计入首屏关键 CSS。

#### Scenario: 渲染阻塞 CSS 体积受限

- **WHEN** 执行生产构建并检查渲染阻塞样式表体积
- **THEN** 其总体积 SHALL 不超过既定预算，且 `@font-face` 声明块占比 SHALL 被记录

#### Scenario: 字体声明不阻塞首屏

- **WHEN** 首屏渲染在字体样式尚未应用时进行
- **THEN** 首屏内容 SHALL 能够以兜底字体先完成渲染，字体声明 MUST NOT 成为首屏渲染的阻塞项

#### Scenario: 分片数量增加不劣化首屏

- **WHEN** 新增字体或提高分片粒度导致 `@font-face` 声明数量增加
- **THEN** 渲染阻塞 CSS 体积 SHALL NOT 相应线性膨胀至超限
