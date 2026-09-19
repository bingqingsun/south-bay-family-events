# 发布与预览策略

## 权威渠道

- **正式站：GitHub Pages。**只有合并到 `main` 的内容会发布为 [southbayfamilyfinds.com](https://southbayfamilyfinds.com/)。
- **Vercel：仅 Preview。**Vercel 不承担正式站发布，也不作为正式环境验收依据。

## 日常协作流程

1. 在功能分支完成改动并通过本地/CI 检查。
2. 需要可点击预览时，把已检查的提交交给 `preview-acceptance`；Vercel 只为该分支生成 Preview Deployment。
3. 产品、设计、运营在该 Preview 验收。
4. 验收通过后，以 PR 合并至 `main`。GitHub Pages 随 `main` 更新正式站。

## 边界与注意事项

- 不要把 Vercel 链接当作正式站链接，也不要把自定义正式域名绑定到 Vercel。
- 不需要预览的分支不会触发 Vercel 构建，避免消耗 Preview 配额。
- 日常活动数据刷新会提交到 `main`；其正式发布同样由 GitHub Pages 完成。
