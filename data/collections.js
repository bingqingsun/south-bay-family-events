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
      homeDescription: "14 curated South Bay family activities · Nov 20–Nov 22",
      homeTags: ["Editor's picks","Nov 20–Nov 22","South Bay"],
      homeCta: 'See the picks',
      landingDescription: "14 South Bay family activities for Nov 20–Nov 22, with official event links.",
      translations: Object.freeze({
        zh: Object.freeze({
          title: '本周末精选',
          landingTitle: '本周末 Family Finds',
          homeLabelActive: '本周末',
          homeLabelLastChance: '本周末',
          homeDescription: "南湾本周末 14 个亲子活动 · 11月20日周五–11月22日周日",
          homeTags: ["编辑精选","11月20日周五–11月22日周日","南湾"],
          homeCta: '查看本周精选',
          landingDescription: "精选 11月20日周五–11月22日周日 南湾亲子活动，详情以主办方官方页面为准。",
          archiveEyebrow: '本周末精选已结束',
          archiveTitle: '本期周末精选已结束',
          archiveDescription: '本期精选活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '本周末精选暂时不可用',
          unavailableTitle: '本周末精选暂时不可用',
          unavailableDescription: '我们正在更新本周末的活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: "2026-11-16T13:45:11.386Z",
      lastChanceThreshold: 0,
      selectedEventRefs: [
        {"id":"midpen-d1efff7c2beb56ba","title":"Counting Banana Slugs!","url":"https://www.openspace.org/events/guided-activities/counting-banana-slugs-0"},
        {"id":"series-c52271eabbc94706","title":"Bay Area Games Day","url":"https://sccl.bibliocommons.com/events/6961562d8b29ea2800c880a8"},
        {"id":"rss-6a1f0f9643b41b3d006b10d6","title":"The Rhinoceros Project Sewing Circles","url":"https://paloalto.bibliocommons.com/events/6a1f0f9643b41b3d006b10d6"},
        {"id":"rss-6a08e108e13d3b4603b486f1","title":"Soul 4Kidz Performance at Community Hall","url":"https://sccl.bibliocommons.com/events/6a08e108e13d3b4603b486f1"},
        {"id":"cupertino-bc45b97893dbfffe","title":"Environmental Education Center Open House","url":"https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Environmental-Education-Center-Open-House"},
        {"id":"midpen-6b1eabe104ea662e","title":"Fall & Winter Berries","url":"https://www.openspace.org/events/guided-activities/fall-winter-berries"},
        {"id":"rss-69445123571fb4d550be6385","title":"Saturday Fun: Arts, Crafts, and More","url":"https://sjpl.bibliocommons.com/events/69445123571fb4d550be6385"},
        {"id":"series-f49752ef4651da8b","title":"North Pole Nights","url":"https://www.gilroygardens.org/holiday/"},
        {"id":"rss-693c7e827ed7c62f00aa31b4","title":"Saturday Crafternoons","url":"https://sjpl.bibliocommons.com/events/693c7e827ed7c62f00aa31b4"},
        {"id":"rss-6ad7bd6c901b02002cc3d710","title":"Learn About the Muwekma Ohlone Tribe","url":"https://paloalto.bibliocommons.com/events/6ad7bd6c901b02002cc3d710"},
        {"id":"nhl-2026020372","title":"San Jose Sharks vs Seattle Kraken","url":"https://www.nhl.com/gamecenter/sea-vs-sjs/2026/11/21/2026020372"},
        {"id":"santana-ea4b6be7f0eb3507","title":"Thanksgiving on The Row","url":"https://santanarow.com/event/thanksgiving-on-the-row/"},
        {"id":"google-visitor-f68f2e8859294d02","title":"Ceramic Dish Painting with Arely Cardenas and Local Color","url":"https://rsvp.withgoogle.com/events/ceramic-dish-painting-with-arely-cardenas-and-local-color?psv=1"},
        {"id":"pyt-7c6a039c7aafa772","title":"The Wizard of Oz","url":"https://pytnet.org/shows/the-wizard-of-oz/"},
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
        { id: 'editorial-32d6b7102984722f', url: 'https://www.thetech.org/upcomingevents' },
        { id: 'filoli-546ede82db7e6eeb', url: 'https://filoli.org/whats-on/events/nightfall/' },
        { id: 'santana-104fc08c96737ad5', url: 'https://santanarow.com/event/glass-pumpkin-festival/' },
      ],
      quickPickIds: [
        'series-e312633de924366b',
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
