# 周末去哪儿 · 南湾亲子活动

一个可直接部署到 GitHub Pages、Netlify 或 Vercel 的静态网站原型。打开 `index.html` 即可预览。

## 工作日自动更新

页面只从 `data/events.json` 读取已核验活动。每日更新脚本（`scripts/update-events.mjs`）会搜索 `data/sources.json` 中预先批准的官方南湾来源，且只发布活动标题与主办方页面 Event 数据匹配、并能读到开始日期的条目。不能验证的搜索结果不会发布。

这表示系统确认链接属于已批准的主办方域名，且该活动的标题与该页面的结构化活动数据相符、开始日期仍在未来；它不表示人工确认过票务余量或临时取消状态。出发前仍应查看主办方详情页。

目前来源清单有 22 个机构，其中 3 个图书馆 RSS 与 1 个官方亲子日历已直接接入，每个工作日刷新且不消耗 SerpApi 额度。其余 18 个来源的 SerpApi 兜底搜索固定在每周二、周四执行，不在周末运行；约每月 144 次查询，适配 250 次免费额度。

手动运行 Actions 时，SerpApi 兜底搜索默认关闭，只刷新免费官方日历；只有勾选 include_serpapi 后才会额外消耗约 18 次查询额度。

- Santa Clara County Parks、Midpeninsula Regional Open Space District
- Palo Alto / San José / Mountain View 图书馆
- The Tech Interactive、San José Museum of Art、Children's Discovery Museum
- Foothill College Physics Show 等季节性活动来源
- Eventbrite 与各城市官方活动日历

推荐工作流：每个工作日运行一次抓取 → 根据标题、日期、地点去重 → 将活动按年龄、类别与来源链接补齐 → 自动发布静态网站。每一条活动必须保留主办方原始链接，并在页面说明“以主办方信息为准”。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加 `SERPAPI_KEY`，随后启用 Actions；网站每个工作日会自动刷新并提交活动列表，GitHub Pages / Netlify / Vercel 会随之重新部署。每一条活动仍会保留其原始链接，方便家庭确认最新安排。

## 语言

目前网站固定显示中文界面，活动标题和简述保留主办方原文。自动翻译功能已暂停：更新工作流不会调用任何翻译服务，也不需要翻译 API 密钥。
