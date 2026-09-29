# fix-global-news-masonry-thrash

修复全域快讯瀑布流卡片在滚动加载更多与切换分类时的显示拥挤/抖动：useMasonry 列迁移振荡导致 React 无限更新循环；同时稳定 useGlobalNewsStream 返回的方法标识。
