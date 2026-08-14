## MODIFIED Requirements

### Requirement: 前端工程与构建

系统 SHALL 提供 Vite + React + TypeScript 前端工程,dev 代理到本地 API,并可通过类型检查与生产构建。

#### Scenario: 类型检查通过

- **WHEN** 运行 `tsc --noEmit`(typecheck)
- **THEN** SHALL 无类型错误

#### Scenario: 生产构建成功

- **WHEN** 运行 `vite build`
- **THEN** SHALL 产出静态构建产物且无错误
