# 周末去哪儿 · 南湾亲子活动

一个可直接部署到 GitHub Pages、Netlify 或 Vercel 的静态网站原型。打开 `index.html` 即可预览。

## 每日自动更新

页面会从 `data/events.json` 读取活动；网络不可用时才显示内置示例。仓库已提供每日更新脚本（`scripts/update-events.mjs`）和 GitHub Actions 定时任务（`.github/workflows/daily-events.yml`）。它使用 SerpApi 的 Google Events 搜索结果，自动去重并写回 JSON。

- Santa Clara County Parks、Midpeninsula Regional Open Space District
- Palo Alto / San José / Mountain View 图书馆
- The Tech Interactive、San José Museum of Art、Children's Discovery Museum
- Foothill College Physics Show 等季节性活动来源
- Eventbrite 与各城市官方活动日历

推荐工作流：每天凌晨运行一次抓取 → 根据标题、日期、地点去重 → 将活动按年龄、类别与来源链接补齐 → 自动发布静态网站。每一条活动必须保留主办方原始链接，并在页面说明“以主办方信息为准”。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加 `SERPAPI_KEY`，随后启用 Actions；网站每晨会自动刷新并提交活动列表，GitHub Pages / Netlify / Vercel 会随之重新部署。每一条活动仍会保留其原始链接，方便家庭确认最新安排。
