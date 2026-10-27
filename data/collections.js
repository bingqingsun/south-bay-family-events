/* Editorial Collection metadata.
 *
 * Keep only stable/editorial facts here. Runtime facts such as current count,
 * current date range, current cities and lifecycle state are computed by
 * collection-runtime.js from the event database.
 */
(() => {
  window.SBFF_COLLECTIONS = Object.freeze([
    Object.freeze({
      slug: 'weekend-picks',
      year: 2026,
      title: "This Weekend's Picks",
      landingTitle: "This Weekend's Family Finds",
      landingPath: 'weekend-picks/',
      coverImage: 'https://images.pexels.com/photos/35005849/pexels-photo-35005849.jpeg?auto=compress&cs=tinysrgb&w=1800',
      homeLabelActive: 'This weekend',
      homeLabelLastChance: 'This weekend',
      homeDescription: "12 curated South Bay family activities · Oct 30–Nov 1",
      homeTags: ["Editor's picks","Oct 30–Nov 1","South Bay"],
      homeCta: 'See the picks',
      landingDescription: "12 selected family activities for Oct 30–Nov 1, with verified organizer event details.",
      translations: Object.freeze({
        zh: Object.freeze({
          title: '本周末精选',
          landingTitle: '本周末 Family Finds',
          homeLabelActive: '本周末',
          homeLabelLastChance: '本周末',
          homeDescription: "南湾本周末 12 个精选亲子活动 · 10月30日周五–11月1日周日",
          homeTags: ["编辑精选","10月30日周五–11月1日周日","南湾"],
          homeCta: '查看本周精选',
          landingDescription: "精选 10月30日周五–11月1日周日南湾亲子活动，涵盖万圣节、亲子演出、花艺、体育和亡灵节文化庆祝，详情以主办方为准。",
          archiveEyebrow: '本周末精选已结束',
          archiveTitle: '本期周末精选已结束',
          archiveDescription: '本期精选活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '本周末精选暂时不可用',
          unavailableTitle: '本周末精选暂时不可用',
          unavailableDescription: '我们正在更新本周末的活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: "2026-10-27T15:41:08.346Z",
      lastChanceThreshold: 0,
      selectedEventRefs: [
        {"id":"filoli-546ede82db7e6eeb","title":"Nightfall","url":"https://filoli.org/whats-on/events/nightfall/"},
        {"id":"filoli-4f17e2f674cccccd","title":"Autumn Days at Filoli","url":"https://filoli.org/whats-on/events/autumn-days/"},
        {"id":"wix-301e5304d362edd6","title":"365 Night Market at Grand Century Mall, San Jose","url":"https://www.365nightmarket.com/event-details/365-night-market-at-grand-century-mall-san-jose-2026-10-30-16-00"},
        {"id":"series-b4ca46c81e59fc6d","title":"The Great Big BOO!","url":"https://www.gilroygardens.org/halloween/"},
        {"id":"series-3d214ccc6c86c0a6","title":"Bluey’s Big Play","url":"https://www.sanjose.org/theaters/events/blueys-big-play"},
        {"id":"calendar-25497","title":"Family Fun with Flowers","url":"https://www.gamblegarden.org/event/family-fun-with-flowers/"},
        {"id":"thetech-ca28f2a8b6e388d3","title":"Tech or Treat","url":"https://www.thetech.org/techortreat"},
        {"id":"nhl-2026020222","title":"San Jose Sharks vs Ottawa Senators","url":"https://www.nhl.com/gamecenter/ott-vs-sjs/2026/10/31/2026020222"},
        {"id":"curated-7a8b718d2671e135","title":"Día de los Muertos","url":"https://www.cdm.org/event/dia-de-los-muertos/"},
        {"id":"santana-6666c41d4ab6fbfc","title":"Día de Los Muertos Celebration","url":"https://santanarow.com/event/dia-de-los-muertos-celebration/"},
        {"id":"montalvo-0d7c8ed71446ccd7","title":"4th Lowrider Art Showcase – Celebrating Dia de los Muertos","url":"https://montalvoarts.org/experience/lowrider-art-showcase-2026/"},
        {"id":"bayfc-44057bc336846e65","title":"Bay FC vs San Diego Wave FC","url":"https://bayfc.com/match/2026-match-30/"},
      ],
      quickPickIds: [],
      archiveEyebrow: 'THIS WEEKEND HAS ENDED',
      archiveTitle: 'This Weekend’s Picks have ended',
      archiveDescription: 'These picks have passed, but there are plenty of family activities happening across the South Bay.',
      unavailableEyebrow: 'WEEKEND PICKS TEMPORARILY UNAVAILABLE',
      unavailableTitle: 'Weekend Picks are temporarily unavailable',
      unavailableDescription: 'We are refreshing this weekend’s picks. Explore current South Bay family activities in the meantime.'
    }),
    Object.freeze({
      slug: 'halloween',
      year: 2026,
      title: '2026 South Bay Halloween',
      landingTitle: '2026 Halloween Family Guide',
      landingPath: 'collections/halloween/',
      coverImage: 'https://santanarow.com/wp-content/uploads/2025/08/Trick-Or-treat-The-Row-Website-Pic-Copy-scaled.jpg',
      homeLabelActive: 'Halloween Guide',
      homeLabelLastChance: 'Last chance',
      homeDescription: 'Trick-or-treating, not-too-spooky nights, costumes & family fun across the South Bay',
      homeTags: ['Trick-or-treat', 'Family-friendly', 'Oct'],
      homeCta: 'Explore Halloween',
      landingDescription: 'Family-friendly Halloween events across the South Bay, from trick-or-treating and community festivals to not-too-spooky nights, crafts, shows, and seasonal outings.',
      translations: Object.freeze({
        zh: Object.freeze({
          title: '2026 南湾万圣节亲子活动',
          landingTitle: '2026 南湾万圣节亲子活动指南',
          homeLabelActive: '万圣节指南',
          homeLabelLastChance: '即将结束',
          homeDescription: 'Trick-or-treat、低惊吓夜间活动、装扮与南湾亲子万圣节体验',
          homeTags: ['Trick-or-treat', '亲子友好', '10月'],
          homeCta: '查看万圣节专题',
          landingDescription: '精选南湾适合家庭参与的万圣节活动，包括 trick-or-treat、社区庆典、低惊吓夜间活动、手工、演出和季节性体验。',
          archiveEyebrow: '2026 万圣节活动已结束',
          archiveTitle: '本季万圣节活动已结束',
          archiveDescription: '2026 年万圣节专题活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '万圣节指南暂时不可用',
          unavailableTitle: '万圣节指南暂时不可用',
          unavailableDescription: '我们正在更新万圣节活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: '2026-09-28T00:00:00',
      activeUntil: '2026-11-02T00:00:00',
      lastChanceThreshold: 3,
      selectedEventRefs: [
        { id: 'series-e312633de924366b', url: 'https://www.gilroygardens.org/halloween/' },
        'curated-f364c82c4ac30523',
        { id: 'santana-3e0678c8161a52e9', url: 'https://santanarow.com/event/trick-or-treat-the-row-halloween-family-festival/' },
        { id: 'curated-d185004a710de571', url: 'https://www.menlopark.gov/Citywide-calendar/Community-events/20261028-Trunk-or-Treat' },
        { id: 'editorial-32d6b7102984722f', url: 'https://www.thetech.org/upcomingevents' },
        { id: 'filoli-546ede82db7e6eeb', url: 'https://filoli.org/whats-on/events/nightfall/' },
        { id: 'santana-104fc08c96737ad5', url: 'https://santanarow.com/event/glass-pumpkin-festival/' },
      ],
      quickPickIds: [
        'series-e312633de924366b',
        'santana-3e0678c8161a52e9',
        'editorial-32d6b7102984722f',
        'filoli-546ede82db7e6eeb'
      ],
      archiveEyebrow: '2026 HALLOWEEN SEASON ENDED',
      archiveTitle: 'This Halloween season has ended',
      archiveDescription: 'These 2026 Halloween events have passed, but there are plenty of family activities happening across the South Bay.',
      unavailableEyebrow: 'HALLOWEEN GUIDE TEMPORARILY UNAVAILABLE',
      unavailableTitle: 'This Halloween guide is temporarily unavailable',
      unavailableDescription: 'We are refreshing the event details for this guide. Explore current South Bay family activities in the meantime.'
    }),
    Object.freeze({
      slug: 'mid-autumn-festival',
      year: 2026,
      title: '2026 Mid-Autumn Festival Guide',
      landingTitle: 'South Bay Mid-Autumn Festival Guide',
      landingPath: 'collections/mid-autumn-festival/',
      coverImage: 'assets/collections/mid-autumn-hero.webp',
      homeLabelActive: 'Featured guide',
      homeLabelLastChance: 'Last chance',
      homeDescription: 'Lanterns, mooncakes, lion dances & family celebrations across the South Bay',
      homeTags: ['Lanterns', 'Mooncakes', 'Lion dances'],
      homeCta: 'Explore the guide',
      landingDescription: 'Celebrate with lanterns, mooncakes, lion dances, cultural performances, crafts, and family activities across the South Bay.',
      translations: Object.freeze({
        zh: Object.freeze({
          title: '2026 南湾中秋节亲子活动指南',
          landingTitle: '南湾中秋节亲子活动指南',
          homeLabelActive: '精选专题',
          homeLabelLastChance: '即将结束',
          homeDescription: '灯笼、月饼、舞狮和南湾各地的家庭庆祝活动',
          homeTags: ['灯笼', '月饼', '舞狮'],
          homeCta: '查看专题',
          landingDescription: '在南湾寻找适合全家的中秋庆祝活动，包括灯笼、月饼、舞狮、文化表演、手工和亲子体验。',
          archiveEyebrow: '2026 中秋活动已结束',
          archiveTitle: '本季活动已结束',
          archiveDescription: '2026 年中秋活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '指南暂时不可用',
          unavailableTitle: '该指南暂时不可用',
          unavailableDescription: '我们正在更新这份指南的活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: '2026-09-01T00:00:00',
      lastChanceThreshold: 2,
      selectedEventRefs: [
        'curated-2ef8db4c6c34be78',
        'lahm-50332644c3a62b5d',
        'rss-6a8f6bb3aafa6100295f6779',
        {
          id: 'curated-261f4bd1519605e7',
          url: 'https://paloalto.bibliocommons.com/events/6a6cdceee30fe4845965ed72'
        },
        'rss-6a7fa742d4b10d0030069349',
        'civic-70e54d8492ed1a97',
        'curated-f1d6a411a90a62b1',
        'curated-3dc3446a01d92775',
        'squarespace-86e397631a011714'
      ],
      quickPickIds: [
        'curated-2ef8db4c6c34be78',
        'lahm-50332644c3a62b5d',
        'curated-3dc3446a01d92775'
      ],
      archiveEyebrow: '2026 SEASON ENDED',
      archiveTitle: 'This season has ended',
      archiveDescription: 'These 2026 Mid-Autumn events have passed, but there are plenty of family activities happening across the South Bay.',
      unavailableEyebrow: 'GUIDE TEMPORARILY UNAVAILABLE',
      unavailableTitle: 'This guide is temporarily unavailable',
      unavailableDescription: 'We are refreshing this guide’s event details. Explore current South Bay family activities in the meantime.'
    })
  ]);
})();
