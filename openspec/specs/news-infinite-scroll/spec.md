# news-infinite-scroll Specification

## Purpose
TBD - created by archiving change news-feed-infinite-scroll-and-cleanup. Update Purpose after archive.
## Requirements
### Requirement: 新闻分页获取

系统 SHALL 支持按 `page`/`size` 分页获取新闻，并返回当前页与是否还有更多；`size` 满页时 SHALL 视为可能还有更多，返回空列表时 SHALL 视为已到末尾。

#### Scenario: 指定分页参数获取

- **WHEN** 调用方以 `page=2, size=20` 请求新闻
- **THEN** 返回第 2 页的新闻列表、页码 2 及 `hasMore` 标志

#### Scenario: 满页判定有更多

- **WHEN** 某页返回的新闻条数等于请求的 `size`
- **THEN** `hasMore` SHALL 为 true

#### Scenario: 空页判定结束

- **WHEN** 某页返回的新闻条数为 0
- **THEN** `hasMore` SHALL 为 false

### Requirement: 新闻无限滚动

系统 SHALL 在新闻界面滚动到列表底部附近时自动加载下一页并追加到现有列表；追加时 SHALL 按新闻 id 去重；切换新闻分类时 SHALL 重置列表并重新加载；所有页加载完毕后 SHALL 停止继续请求。

#### Scenario: 滚动加载下一页

- **WHEN** 用户将新闻列表滚动到底部附近且仍有更多数据
- **THEN** 系统 SHALL 自动请求下一页并追加渲染

#### Scenario: 追加去重

- **WHEN** 新加载的新闻与已有列表存在相同 id
- **THEN** 相同 id 的新闻 SHALL 只保留一条

#### Scenario: 切换分类重置

- **WHEN** 用户切换到另一个新闻分类
- **THEN** 列表 SHALL 清空并重置到第一页重新加载

#### Scenario: 加载完成停止

- **WHEN** 已加载到末尾（`hasMore=false`）
- **THEN** 滚动到底部 SHALL 不再发起新请求

#### Scenario: 加载中避免并发

- **WHEN** 上一页仍在加载中
- **THEN** 滚动到底部 SHALL 不发起重复请求

