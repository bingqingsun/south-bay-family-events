# Event Card v1：共享组件契约

## 唯一组件

`event-card.js` 是活动卡片结构的唯一来源。首页与 Collection 页面都必须先加载该文件，并使用：

```js
window.SBFFEventCard.render({ eventId, entryPoint })
```

不得在页面 HTML 中复制 `#cardTemplate` 或维护第二套卡片骨架。

## 稳定结构

组件固定提供以下槽位，供各页面只填充已验证的活动数据：

- 图片、类别、收藏动作
- 标题与年龄／评级／费用／报名状态
- 简介及展开按钮
- 时间、地点、地址与导航
- 多场次列表
- 主办方与“View details”链接

## 页面职责

- **共享组件**：DOM 结构、类名、可访问性基线与页面识别数据。
- **首页适配器**：搜索／筛选状态、距离、双语文案、推荐排序与首页埋点。
- **Collection 适配器**：策展顺序、英文文案与 Collection 埋点。

视觉样式继续由全局 `.event-card` 规则统一控制；Collection 不得为该组件重建独立卡片样式。
