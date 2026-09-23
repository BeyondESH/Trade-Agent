## REMOVED Requirements

### Requirement: Tailwind 扫描覆盖 Vue SFC
**Reason**: 本项目为 React + Vite + Tailwind 4，`frontend/src` 中不存在任何 `.vue` 单文件组件（`.vue` 仅出现在 `node_modules/vitepress` 依赖内）。该 requirement 及其场景（"Vue SFC 样式生效"）描述的技术栈与实现不符，会误导构建配置。
**Migration**: 由同 change 新增的 `Tailwind 扫描覆盖 React TSX` requirement 取代；构建配置（`frontend/tailwind.config.js` 的 `content: ["./index.html", "./src/**/*.{ts,tsx}"]`）已符合新要求，无需代码迁移。

## ADDED Requirements

### Requirement: Tailwind 扫描覆盖 React TSX

系统 SHALL 使 Tailwind content 扫描覆盖 React 组件源码（`frontend/src` 下的 `.ts`/`.tsx` 文件），确保组件内使用的工具类进入构建产物 CSS。本项目为 React + Vite + Tailwind v4；`frontend/src` 中 MUST NOT 存在 `.vue` 单文件组件，构建配置 MUST NOT 依赖 Vue SFC 扫描。

#### Scenario: 产物包含工具类

- **WHEN** 执行生产构建
- **THEN** 产物 CSS SHALL 包含组件使用的关键工具类（如 `.bg-panel`、`.flex`、`.h-screen`）

#### Scenario: TSX 组件样式生效

- **WHEN** 在浏览器中打开应用
- **THEN** 组件 SHALL 呈现预期的布局、高度与配色（非无样式裸布局）

#### Scenario: 配置扫描 TSX 而非 Vue

- **WHEN** 检查 Tailwind content 配置
- **THEN** 其 glob SHALL 覆盖 `./src/**/*.{ts,tsx}`，MUST NOT 依赖 `.vue` 文件
