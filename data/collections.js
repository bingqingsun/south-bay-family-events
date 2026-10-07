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
      homeDescription: '12 handpicked family activities across the South Bay · Oct 9–11',
      homeTags: ["Editor's picks", 'Oct 9–11', 'South Bay'],
      homeCta: 'See the picks',
      landingDescription: 'Handpicked South Bay family activities for Oct 9–11, with verified event details and official sources.',
      translations: Object.freeze({
        zh: Object.freeze({
          title: '本周末精选',
          landingTitle: '本周末 Family Finds',
          homeLabelActive: '本周末',
          homeLabelLastChance: '本周末',
          homeDescription: '南湾本周末 12 个精选亲子活动 · 10月9日周五–10月11日周日',
          homeTags: ['编辑精选', '10月9日周五–10月11日周日', '南湾'],
          homeCta: '查看本周精选',
          landingDescription: '精选 10月9日周五–10月11日周日南湾值得带孩子去的活动，活动信息均依据官方来源核验。',
          archiveEyebrow: '本周末精选已结束',
          archiveTitle: '本期周末精选已结束',
          archiveDescription: '本期精选活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '本周末精选暂时不可用',
          unavailableTitle: '本周末精选暂时不可用',
          unavailableDescription: '我们正在更新本周末的活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: '2026-10-07T14:56:00',
      lastChanceThreshold: 0,
      selectedEventRefs: [
        { id: 'santana-72acfe73ee338c31', title: "Makers Market's Local Artist Street Fair", url: 'https://santanarow.com/event/makers-market-in-the-park/' },
        { id: 'stanford-a12f75946cd76d83', title: 'Art for All Family Day, Fall 2026', url: 'https://events.stanford.edu/event/sold-out-art-for-all-family-day-fall-2026' },
        { id: 'deanza-3dad4b06740adb05', title: 'We Are Stars', url: 'https://daweb2.deanza.edu/events/event.html?id=191550390' },
        { id: 'deanza-72211aa990ec1447', title: 'Cosmic Journey', url: 'https://daweb2.deanza.edu/events/event.html?id=191547180' },
        { id: 'curated-781a33c73d1cc21e', title: 'Pumpkins in the Park', url: 'https://grpg.org/pumpkins-in-the-park/' },
        { id: 'series-f56a3276be64e36c', title: 'Bay Area Card Show', url: 'https://www.thefairgrounds.org/events/bay-area-card-show/' },
        { id: 'series-fa91b5c1b92ad279', title: 'Ardenwood Harvest Festival', url: 'https://www.ebparks.org/calendar?terms=Ardenwood+Harvest+Festival' },
        { id: 'series-69778c0ce0068b1e', title: 'Creepy Carrots!', url: 'https://pytnet.org/stories-on-stage/creepy-carrots/' },
        { id: 'midpen-4b88138695a8498c', title: 'Evening Explorations at Alpine Pond', url: 'https://www.openspace.org/events/guided-activities/evening-explorations-alpine-pond' },
        { id: 'series-bf2c8a59c45b87b2', title: 'The Great Big BOO!', url: 'https://www.gilroygardens.org/halloween/' },
        { id: 'series-3ba73f7f41073d10', title: 'Alebrijes: A Día de Muertos Tale', url: 'https://www.teatrovision.org/alebrijes' },
        { id: 'curated-a689f28e5831fe8b', title: 'Echoes of the Silk Road', url: 'https://events.sjsu.edu/event/silkroad-art-preservation-collective-presents-echoes-of-the-silk-road-5th-year-gala' }
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
        { id: 'series-bf2c8a59c45b87b2', url: 'https://www.gilroygardens.org/halloween/' },
        'rss-6a9c66e53b6c71003e5e111d',
        'curated-4c0727d8deda8c4d',
        { id: 'rss-6abc4d747c8c150075767bd5', title: 'Fratello Marionettes: Spooktacular', url: 'https://sccl.bibliocommons.com/events/6abc4d747c8c150075767bd5' },
        { id: 'rss-6aa334094b3b06003082e767', url: 'https://sccl.bibliocommons.com/events/6aa334094b3b06003082e767' },
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
        'rss-6a9c8d4c442d35226f66ef71',
        { id: 'santana-8e02371ec72aec44', url: 'https://santanarow.com/event/farmer-mike-pumpkin-carving/' }
      ],
      quickPickIds: [
        'series-bf2c8a59c45b87b2',
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
