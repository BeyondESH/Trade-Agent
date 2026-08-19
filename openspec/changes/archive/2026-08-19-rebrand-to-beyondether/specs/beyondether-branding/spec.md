# beyondether-branding Specification

## ADDED Requirements

### Requirement: 界面品牌标识替换

系统 SHALL 不在任何用户可见界面文本中使用 "TradingView"/"Tradingview" 品牌字样及品牌徽标缩写 "TV"，统一替换为自身品牌 **BeyondEther**；品牌缩写场景 SHALL 使用 "BE"。

#### Scenario: 标题栏品牌化

- **WHEN** 用户查看桌面标题栏
- **THEN** 菜单标题 SHALL 显示 BeyondEther，徽标 SHALL 显示 BE，版本区 SHALL 显示 "BeyondEther Desktop Pro"（不含版本号）

#### Scenario: 云端与账户文案

- **WHEN** 界面提示云端自动保存或账户相关功能
- **THEN** 文案中的 "TradingView Cloud"/"TradingView account" SHALL 分别替换为 "BeyondEther Cloud"/"BeyondEther account"

#### Scenario: 中文界面品牌原名

- **WHEN** 界面语言为中文且涉及品牌名称
- **THEN** SHALL 直接显示 "BeyondEther" 品牌原名而非翻译词

### Requirement: i18n 文案品牌化

系统 SHALL 在 i18n 字典中将所有 TradingView 相关 key 改名为 BeyondEther 命名，中文值同步替换品牌字样，且所有 `t()` 调用处 SHALL 更新为新 key。

#### Scenario: i18n key 与调用同步

- **WHEN** 检索代码中的 `t('TradingView` 调用与 i18n 字典
- **THEN** 字典与调用处 SHALL 均无 "TradingView" 命名的 key，且渲染结果显示 BeyondEther

#### Scenario: 无引用 key 保留改名

- **WHEN** 处理无组件引用的 "Verified TradingView Broker Integrations" key
- **THEN** SHALL 改名为 "Verified BeyondEther Broker Integrations" 并保留

### Requirement: 券商目录品牌化

系统 SHALL 将 `BROKERS_CATALOG` 中自身模拟券商条目的名称、logo 缩写、描述与 id 品牌化为 BeyondEther/BE。

#### Scenario: 模拟券商条目

- **WHEN** 查看 `BROKERS_CATALOG` 中的纸面交易券商条目
- **THEN** `name` SHALL 为 "BeyondEther Paper Trading"，`logo` SHALL 为 "BE"，`id` SHALL 为 "paper-be"，description SHALL 引用 BeyondEther

### Requirement: 注释与 DOM id 清理

系统 SHALL 清理代码注释与 DOM id 中的 TradingView/TV 品牌痕迹，替换为 BeyondEther/BE。

#### Scenario: 注释与 DOM id

- **WHEN** 检索源码中的 "TradingView" 与作为品牌徽标的 "TV"
- **THEN** 注释 SHALL 引用 BeyondEther，"tradingview-desktop-titlebar" DOM id SHALL 改为 "beyondether-desktop-titlebar"，CSS 注释中的 "TV density" SHALL 改为 "BE density"
