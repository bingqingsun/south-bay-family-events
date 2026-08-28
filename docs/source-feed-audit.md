# 官方活动来源逐个审计

审计日期：2026-08-27  
审计范围：网站当前配置的 22 个来源。
实现状态更新：The Tech Interactive 与 Foothill College 已于本轮改为直接读取官方活动页面，不再消耗 SerpApi 额度。

## 判定标准

- **已接入（直接）**：已实际读取、解析并发布的官方 RSS 或官方活动 API；不消耗搜索额度。
- **可直接接入候选**：已发现官方批量 API／日历入口，但尚未完成“亲子或 K–12”筛选、稳定性和本地测试；在完成前不视为已接入。
- **官方网页日历**：官方页面有真实活动和日期，但本轮没有找到可验证的批量 RSS／ICS／API；网页抓取需另行开发和测试。
- **单场 iCalendar**：每个活动可单独下载 `.ics`，但不能作为整站自动更新源。
- **搜索兜底**：在未完成直接接入前，通过 SerpApi 每周二、周四查询；它仍是官方页面链接的发现方式，不把搜索摘要当成活动事实。

“有活动页面”不等于“已经自动接入”；“可加入日历”也不等于“有全量可订阅日历”。

## 已接入：6 个（不消耗搜索额度）

| 来源 | 类型 | 已验证的入口 | 当前处理 |
| --- | --- | --- | --- |
| Palo Alto City Library | RSS | `https://gateway.bibliocommons.com/v2/libraries/paloalto/rss/events` | 已读取官方 RSS，按受众和未来日期筛选。 |
| San José Public Library | RSS | `https://gateway.bibliocommons.com/v2/libraries/sjpl/rss/events` | 已读取官方 RSS，按受众和未来日期筛选。 |
| Santa Clara County Library District | RSS | `https://gateway.bibliocommons.com/v2/libraries/sccl/rss/events` | 已读取官方 RSS，按受众和未来日期筛选。 |
| Gamble Garden | 官方活动 API | `https://www.gamblegarden.org/wp-json/tribe/events/v1/events?per_page=50&categories=kids` | 已读取官方 Family & Kids 日历 API；有准确开始日期与活动页。 |
| The Tech Interactive | 官方网页日历 | `https://www.thetech.org/explore/upcoming-events` | 直接读取官方活动卡片的日期、地点、摘要、图片与链接；排除会员专属和非亲子/学习活动。 |
| Foothill College | 官方网页活动区 | `https://foothill.edu/` | 直接读取官方首页活动区；目前已收录 Physics Show 的明确场次，排除校园关闭等非亲子条目。 |

## 逐个审计：其余来源与本轮转为直接接入的来源

| # | 来源 | 审计结果 | 可靠入口／证据 | 当前结论与下一步 |
| --- | --- | --- | --- | --- |
| 1 | Santa Clara County Parks | 官方网页日历 | [活动日历](https://parks.santaclaracounty.gov/events/)列出自然教育、导览和亲子活动。 | 官方内容很适合；自动访问曾被站点限制。本轮未发现公开批量 feed，保留搜索兜底，后续仅在获得稳定公开读取方式后做网页接入。 |
| 2 | Midpeninsula Regional Open Space District | 官方网页日历 | [Events & Activities Calendar](https://www.openspace.org/calendar)；机构说明每年有 300+ 场导览等活动。 | 很有价值，尤其自然教育／青少年活动；未找到可验证的全量 RSS/ICS/API。 |
| 3 | The Tech Interactive | **已直接接入：官方网页解析** | [Upcoming Events](https://www.thetech.org/explore/upcoming-events)含具体日期、图片及 STEM/家庭项目。 | 已读取官方活动卡片并以官方日期、链接发布；不使用 SerpApi。 |
| 4 | City of Palo Alto | 官方网页日历 | [City Calendar](https://www.paloalto.gov/Home/Calendar)含 Community / City Sponsored Events。 | 有真实亲子条目；未发现全量 feed。市图书馆已由单独 RSS 覆盖，避免重复发布。 |
| 5 | Palo Alto Junior Museum & Zoo | 官方网页日历 | [JMZ 首页及活动日历入口](https://www.paloaltozoo.org/Home)明确说明其活动面向各种能力与学习方式的儿童。 | 适合度很高；独立于市政府日历，未找到公开批量 feed，需单独定位和测试其日历实现。 |
| 6 | City of San José | 单场 iCalendar | [官方市政活动示例](https://www.sanjoseca.gov/Home/Components/Calendar/Event/6752/5114)提供 Outlook/iCalendar。 | 有官方城市／文化活动日历，但找到的是每场下载而非全量订阅；不应伪装成 RSS。 |
| 7 | City of Sunnyvale | 单场 iCalendar | [官方活动示例](https://www.sunnyvale.ca.gov/Home/Components/Calendar/Event/12306/19)提供 Outlook/iCalendar。 | 有儿童活动条目；另发现的公开 ICS 是市政会议日历，不适合亲子活动，不能接入。 |
| 8 | City of Mountain View | 单场 iCalendar | [官方活动示例](https://www.mountainview.gov/Home/Components/Calendar/Event/3482/1029)提供 Outlook/iCalendar，并明确为 family-friendly。 | 有可靠活动页和日期；尚未发现全量 feed。 |
| 9 | City of Cupertino | 官方网页日历 | [Parks & Recreation Event Calendar](https://www.cupertino.gov/Parks-Recreation/Events/Parks-and-Recreation-Event-Calendar)含 Kids & family 分类。 | 官方日历可用；未验证全量 RSS/ICS/API。 |
| 10 | City of Santa Clara | 单场 iCalendar | [官方 Community Calendar](https://calendar.santaclaraca.gov/santaclaraca/260194458)含 Family & Kids Activities 及单场 iCal。 | 受众字段清楚，价值高；还没有可验证的全量订阅链接。 |
| 11 | Computer History Museum | 官方网页日历 | [CHM 首页当前活动](https://computerhistory.org/)及其 [活动页](https://computerhistory.org/events/)；有面向家庭的 TechFest 等项目。 | 可作为 STEM 补充；旧活动页虽有 “Add to Calendar”，本轮未验证现在可用的全量 feed，不能直接接入。 |
| 12 | Cantor Arts Center | 官方网页日历 | [Cantor 活动日历](https://www.cantorcenter.com/events-calendar/)；也同步出现在 [Stanford Events](https://events.stanford.edu/department/cantor_arts_center)。 | 有明确的 all-ages/family workshop；不能双重采集。优先在 Stanford API 做安全受众筛选后统一接入。 |
| 13 | Happy Hollow Park & Zoo | 官方网页日历 | [Events](https://happyhollow.org/events/)与 [会员／项目说明](https://happyhollow.org/membership/)。 | 机构本身面向儿童和家庭，但当前活动页没有可解析的公开活动清单或批量 feed；暂不自动收录，以免把会员／募款误当亲子活动。 |
| 14 | Gilroy Gardens | 官方互动日历 | [Calendar & Hours](https://www.gilroygardens.org/calendar-hours/)列出营业日、时段和季节活动。 | 官方日历真实可用，但多为互动购票界面；未发现公开批量订阅接口。后续需单独判断“营业时间”与“特别活动”，不能全部当活动发布。 |
| 15 | Foothill College | **已直接接入：官方网页解析** | [Physics](https://foothill.edu/physics/)说明 Physics Show 于秋冬举办；[首页活动区](https://foothill.edu/)列出具体场次。 | **已收录你提到的 Physics Show。** 直接读取官方日期、时间、地点和详情链接；排除校园关闭等非亲子条目。 |
| 16 | De Anza College Planetarium | 官方网页日历 | [Planetarium](https://www.deanza.edu/planetarium/index.html)说明公众天文秀通常在 10–5 月的周六，并提供 Public Show Calendar。 | 极适合家庭／学生；尚未验证批量 feed。 |
| 17 | SLAC National Accelerator Laboratory | 官方网页日历 | [官方活动页](https://www6.slac.stanford.edu/news-and-events/events)及[公开参观](https://www6.slac.stanford.edu/news-and-events/events/public-tours)。 | 有 STEM Community Day、公开参观等；参观通常 12+，所以不能一概标 K–12。未发现批量 feed。 |
| 18 | Stanford Events | 可直接接入候选 | [官方 RSS/ICS 说明](https://events-help.stanford.edu/connect-events-calendar/rss-and-calendar-feeds)；公开 [Localist API](https://events.stanford.edu/api/2/events?pp=5&days=365)返回活动 JSON。 | **不消耗 SerpApi 的技术路径已经存在**，但 API 是全校活动，直接读取会混入成人讲座／内部活动。必须先实现并验证保守的公开、家庭／K–12 受众筛选，才可接入。 |

## 最终数量与搜索影响

- 当前直接来源：**6** 个。
- 尚在搜索兜底的来源：**16** 个；按每周二、周四运行，约为 **128 次／4 周**（或 5 周月份约 160 次）SerpApi 查询。
- 已发现但尚未安全接入的免费官方路径：**Stanford Events API**；其余 17 个没有在本轮验证到可稳定使用的全量订阅入口。

## 接入顺序（不牺牲真实性）

1. Stanford Events：先实现严格的“公开 + 明确 family/youth/kids/student program”规则，并加入抽样复核，防止混入成人学术活动。
2. The Tech、Midpen、Palo Alto JMZ、Cupertino、Santa Clara：逐站做网页读取器，先本地跑通、核对日期／链接／受众，再启用定时更新。
3. Foothill／De Anza／SLAC：以官方特定项目页做低频、可复核的专门接入；不把泛校历或过期项目混进列表。
4. 无法稳定公开读取的来源继续采用每周两次搜索兜底，并在发布时保留官方详情链接和核验状态。
