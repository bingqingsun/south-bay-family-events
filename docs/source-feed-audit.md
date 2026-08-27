# 官方活动来源 RSS / ICS 审计

审计日期：2026-08-27  
标准：只有能返回有效 RSS XML 或 iCalendar（text/calendar / BEGIN:VCALENDAR）的**全量可订阅 feed**，才可标记为已确认。

## 结论

当前 22 个来源中，**3 个已确认的 RSS feed 与 1 个官方亲子日历 API**。

这不是“不支持”的结论。部分机构会提供单场次“加入日历”按钮，或把活动数据放在网页应用／接口中；这些不等于可被稳定订阅的全量 feed。本轮未把它们计为 RSS / ICS。

| 来源 | 当前状态 | 说明 |
| --- | --- | --- |
| Palo Alto City Library | 已确认 RSS | gateway.bibliocommons.com/v2/libraries/paloalto/rss/events 返回有效 RSS。 |
| San José Public Library | 已确认 RSS | gateway.bibliocommons.com/v2/libraries/sjpl/rss/events 返回有效 RSS。 |
| Santa Clara County Library District | 已确认 RSS | gateway.bibliocommons.com/v2/libraries/sccl/rss/events 返回有效 RSS。 |
| Santa Clara County Parks | 受访问限制 | 活动页对自动访问返回限制响应。 |
| Midpeninsula Regional Open Space District | 待对接 | 活动页面可访问，但常见 ICS 入口返回 HTML。 |
| The Tech Interactive | 待定位日历 | 常见活动路径未返回 feed。 |
| City of Palo Alto | 待定位日历 | 常见 ICS 入口未返回 feed。 |
| Palo Alto Junior Museum & Zoo | 待定位日历 | 使用 Palo Alto 市域名，需单独定位活动页。 |
| City of San José | 受访问限制 | 常见活动入口对自动访问返回限制响应。 |
| City of Sunnyvale | 受访问限制 | 常见活动入口对自动访问返回限制响应。 |
| City of Mountain View | 受访问限制 | 常见活动入口对自动访问返回限制响应。 |
| City of Cupertino | 待定位日历 | 常见 ICS 入口返回 HTML。 |
| City of Santa Clara | 受访问限制 | 常见活动入口对自动访问返回限制响应。 |
| Computer History Museum | 待定位日历 | 常见 ICS 入口返回 HTML。 |
| Cantor Arts Center | 待定位日历 | 常见活动路径未返回 feed。 |
| Happy Hollow Park & Zoo | 待定位日历 | 常见 ICS 入口返回 HTML。 |
| Gilroy Gardens | 待定位日历 | 常见活动路径未返回 feed。 |

## 后续策略

1. 三个 BiblioCommons RSS 已接入每日工作日刷新；只发布未来、未取消且面向儿童／青少年／家庭的条目。
2. 对市政与公园来源定位真实日历供应商；若自动访问受限，不绕过限制，而是寻找公开 feed、开放 API 或人工允许的接入方式。
3. 只有通过以上验证的来源才能替代 SerpApi；未确认的来源继续使用每周二、周四的受限搜索兜底。
