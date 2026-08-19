## MODIFIED Requirements

### Requirement: TV 字体与排版规范

系统 SHALL 使用自托管双字体栈：西文（拉丁字母、数字、西文标点）用 **Google Sans Flex**，中文（汉字、CJK 标点）用 **Noto Sans SC**（思源黑体），最后以系统 sans-serif 兜底；字体栈中西文字体 SHALL 排在中文字体之前，并依赖各 `@font-face` 的 `unicode-range` 完成逐字符分流。字号基准 12px，坐标轴刻度/状态栏/表格数值 11px，品种名/弹窗标题 13-14px，行高 1.2-1.4；数字 SHALL 使用 `tabular-nums` 防止横向跳动；圆角按钮/输入 4px、浮层/上下文条 6px、弹窗 8px；边框统一 1px；唯一阴影 `0 2px 8px rgba(0,0,0,.4)` 仅用于浮层。

#### Scenario: 中西文字体分流

- **WHEN** 渲染包含中英文与数字的混排文本
- **THEN** 拉丁字符与数字 SHALL 由 Google Sans Flex 渲染，汉字 SHALL 由 Noto Sans SC 渲染

#### Scenario: 字体自托管无外部依赖

- **WHEN** 在无外网环境加载应用
- **THEN** 西文与中文 SHALL 均以自托管字体正确渲染，MUST NOT 请求外部字体 CDN

#### Scenario: 数字等宽对齐

- **WHEN** 渲染价格/成交量/盘口等数字列
- **THEN** SHALL 应用 `tabular-nums`，数值刷新时字符不横向抖动

#### Scenario: 圆角与阴影分级

- **WHEN** 渲染按钮、浮层、弹窗
- **THEN** SHALL 分别使用 4/6/8px 圆角，仅浮层带 `0 2px 8px rgba(0,0,0,.4)` 阴影

#### Scenario: 字号与行高基准不变

- **WHEN** 渲染坐标轴刻度、表格数值、品种名与弹窗标题
- **THEN** SHALL 分别为 11px、11px、13-14px，行高 SHALL 保持 1.2-1.4，布局尺寸不因换字体而改变
