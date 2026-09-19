# 发布与预览策略

## 权威渠道

- **正式站：GitHub Pages。**只有合并到 `main` 的内容会发布为 [southbayfamilyfinds.com](https://southbayfamilyfinds.com/)。
- **Vercel：仅按需 Preview。**Vercel 不承担正式站发布，也不会因创建 PR 或更新分支而自动部署。

## 日常协作流程

1. 在功能分支完成改动并通过检查，创建 PR。
2. 默认不生成 Vercel Preview。
3. 只有产品负责人明确要求“给我 Preview”时，才为该 PR 的已检查提交创建一次 Preview Deployment。
4. 产品、设计、运营在该 Preview 验收。
5. 验收通过后，以 PR 合并至 `main`；GitHub Pages 随 `main` 更新正式站。

## 边界与注意事项

- 不要把 Vercel 链接当作正式站链接，也不要把自定义正式域名绑定到 Vercel。
- Vercel 的 Git 自动部署已关闭，避免日常活动刷新和普通 PR 消耗 Preview 配额。
- 需要 Preview 时，应使用一次性手动部署／受控验收流程，而不是重新打开所有分支的自动部署。
- 日常活动数据刷新会提交到 `main`；其正式发布同样由 GitHub Pages 完成。
- 一次合并若紧接着触发活动数据刷新，GitHub Pages 可能取消针对前一个提交的构建，并自动部署刷新后的提交。只要最新的 `pages build and deployment` 为绿色成功，即视为已上线；被后续提交取消的旧构建不是故障。
