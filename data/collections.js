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
      homeDescription: '14 handpicked family activities across the South Bay · Oct 23–25',
      homeTags: ["Editor's picks", 'Oct 23–25', 'South Bay'],
      homeCta: 'See the picks',
      landingDescription: '14 handpicked South Bay family activities for Oct 23–25, with organizer details and official links.',
      translations: Object.freeze({
        zh: Object.freeze({
          title: '本周末精选',
          landingTitle: '本周末 Family Finds',
          homeLabelActive: '本周末',
          homeLabelLastChance: '本周末',
          homeDescription: '南湾本周末 14 个精选亲子活动 · 10月23日周五–10月25日周日',
          homeTags: ['编辑精选', '10月23日周五–10月25日周日', '南湾'],
          homeCta: '查看本周精选',
          landingDescription: '精选 10月23日周五–10月25日周日南湾亲子活动，包括节庆、文化艺术、现场演出、天文馆与动手科学，详情以主办方为准。',
          archiveEyebrow: '本周末精选已结束',
          archiveTitle: '本期周末精选已结束',
          archiveDescription: '本期精选活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '本周末精选暂时不可用',
          unavailableTitle: '本周末精选暂时不可用',
          unavailableDescription: '我们正在更新本周末的活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: '2026-10-19T05:00:00',
      lastChanceThreshold: 0,
      selectedEventRefs: [
        {"id":"filoli-546ede82db7e6eeb","title":"Nightfall","url":"https://filoli.org/whats-on/events/nightfall/"},
        {"id":"series-bd3c83f4163c1417","title":"Disney On Ice","url":"https://www.sapcenter.com/events/detail/disney-on-ice-4"},
        {"id":"curated-f364c82c4ac30523","title":"Monster Bash","url":"https://www.mountainview.gov/our-city/departments/community-services/special-events/monster-bash"},
        {"id":"santana-8e02371ec72aec44","title":"Farmer Mike Pumpkin Carving","url":"https://santanarow.com/event/farmer-mike-pumpkin-carving/"},
        {"id":"curated-fd7d4676fae949fe","title":"Community Day: Día de Los Muertos","url":"https://sjmusart.org/programs-at-sjma/community-days/dia-de-los-muertos"},
        {"id":"curated-89a240ca6e3b7fc7","title":"Children’s SpooktaClara","url":"https://www.santaclaraca.gov/our-city/departments-g-z/parks-recreation/special-events/children-s-halloween-party"},
        {"id":"paloalto-c6831448873a5045","title":"Teen Halloween Roller Derby!","url":"https://www.paloalto.gov/Events-Directory/Library/Teen-Halloween-Roller-Derby"},
        {"id":"rss-6aca96a59d27a0004550067b","title":"Voices of Pasifika: Samoan Weaving for Kids","url":"https://sccl.bibliocommons.com/events/6aca96a59d27a0004550067b"},
        {"id":"series-9f09211a666c4efb","title":"Magic Tree House","url":"https://daweb2.deanza.edu/events/event.html?id=191544836"},
        {"id":"series-fc478c8b04edff13","title":"Symphonic Spooktacular","url":"https://www.symphonysanjose.org/attend/2026-2027-season/concerts/symphonic-spooktacular/"},
        {"id":"filoli-7e4830eaace5eac0","title":"Dia de Los Muertos","url":"https://filoli.org/whats-on/events/dia-de-los-muertos/"},
        {"id":"paloalto-4ffaa6fa302eb82a","title":"Halloween Costume Party @ Magical Bridge","url":"https://www.paloalto.gov/Events-Directory/Community-Services/Halloween-Costume-Party-Magical-Bridge"},
        {"id":"montalvo-d1b9714ec6b1e859","title":"Goblins in the Garden","url":"https://my.montalvoarts.org/3257/3258"},
        {"id":"rss-6aa97ca786d8450031164ecb","title":"Student-Led Astronomy Workshop for Tweens","url":"https://sccl.bibliocommons.com/events/6aa97ca786d8450031164ecb"},
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
        { id: 'rss-6abc4d747c8c150075767bd5', title: 'Fratello Marionettes: Spooktacular', url: 'https://sccl.bibliocommons.com/events/6abc4d747c8c150075767bd5' },
        'curated-308477d1807c9d4c',
        'curated-f364c82c4ac30523',
        { id: 'calendar-24500', url: 'https://www.gamblegarden.org/event/halloween/' },
        'curated-89a240ca6e3b7fc7',
        { id: 'chcp-df1761c0a01542cf', url: 'https://www.chcp.org/event-6856658' },
        { id: 'cupertino-f11efb5ab0b93776', url: 'https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash' },
        { id: 'series-83c1d125bf40ee84', url: 'https://daweb2.deanza.edu/events/event.html?id=185122379' },
        { id: 'santana-3e0678c8161a52e9', url: 'https://santanarow.com/event/trick-or-treat-the-row-halloween-family-festival/' },
        { id: 'rss-6a9c6702aafa61002961d5e9', url: 'https://sccl.bibliocommons.com/events/6a9c6702aafa61002961d5e9' },
        { id: 'curated-d185004a710de571', url: 'https://www.menlopark.gov/Citywide-calendar/Community-events/20261028-Trunk-or-Treat' },
        { id: 'editorial-32d6b7102984722f', url: 'https://www.thetech.org/upcomingevents' },
        { id: 'filoli-546ede82db7e6eeb', url: 'https://filoli.org/whats-on/events/nightfall/' },
        { id: 'santana-104fc08c96737ad5', url: 'https://santanarow.com/event/glass-pumpkin-festival/' },
        { id: 'santana-8e02371ec72aec44', url: 'https://santanarow.com/event/farmer-mike-pumpkin-carving/' }
      ],
      quickPickIds: [
        'series-e312633de924366b',
        'curated-f364c82c4ac30523',
        'curated-89a240ca6e3b7fc7',
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
