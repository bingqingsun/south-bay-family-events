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
      homeDescription: "14 curated South Bay family activities · Nov 13–15",
      homeTags: ["Editor's picks","Nov 13–15","South Bay"],
      homeCta: 'See the picks',
      landingDescription: "14 handpicked South Bay family activities for Nov 13–15, with official organizer event details.",
      translations: Object.freeze({
        zh: Object.freeze({
          title: '本周末精选',
          landingTitle: '本周末 Family Finds',
          homeLabelActive: '本周末',
          homeLabelLastChance: '本周末',
          homeDescription: "南湾本周末 14 个精选亲子活动 · 11月13日周五–11月15日周日",
          homeTags: ["编辑精选","11月13日周五–11月15日周日","南湾"],
          homeCta: '查看本周精选',
          landingDescription: "精选 11月13日周五–11月15日周日 14 个南湾亲子活动：节日庄园、舞台演出、天文馆、户外徒步和 STEM 活动，详情以官方主办方为准。",
          archiveEyebrow: '本周末精选已结束',
          archiveTitle: '本期周末精选已结束',
          archiveDescription: '本期精选活动已经结束，你仍可以继续浏览南湾正在进行的亲子活动。',
          unavailableEyebrow: '本周末精选暂时不可用',
          unavailableTitle: '本周末精选暂时不可用',
          unavailableDescription: '我们正在更新本周末的活动信息，你可以先浏览当前的南湾亲子活动。'
        })
      }),
      published: true,
      publishAt: "2026-11-09T22:42:55.689Z",
      lastChanceThreshold: 0,
      selectedEventRefs: [
        {"id":"google-visitor-6dd100c73b7e8338","title":"The Ultimate Honey Harvest Workshop with Planet Bee","url":"https://rsvp.withgoogle.com/events/the-ultimate-honey-harvest-workshop-with-planet-bee?psv=1"},
        {"id":"rss-6ad66508035faf0033ddafc3","title":"LEGO SPIKE Robots!","url":"https://sjpl.bibliocommons.com/events/6ad66508035faf0033ddafc3"},
        {"id":"series-e316d64452d1c306","title":"Matilda The Musical","url":"https://www.cmtsj.org/matilda-the-musical/"},
        {"id":"filoli-0ce504a215422600","title":"Holiday Daytime","url":"https://filoli.org/whats-on/events/holiday-daytime/"},
        {"id":"midpen-c20df77ae679a18f","title":"Giving Thanks","url":"https://www.openspace.org/events/guided-activities/giving-thanks"},
        {"id":"rss-6acea9ef9dbc2b002c8e679d","title":"Indian Classical Dance Program","url":"https://sccl.bibliocommons.com/events/6acea9ef9dbc2b002c8e679d"},
        {"id":"series-74ab2daae4c44084","title":"The Wizard of Oz","url":"https://pytnet.org/shows/the-wizard-of-oz/"},
        {"id":"series-121c0a8cfdf78921","title":"Big Bird's Adventure | One World, One Sky","url":"https://daweb2.deanza.edu/events/event.html?id=191549246"},
        {"id":"rss-6a59165ec7e02e3d00698bc6","title":"Celebrate Native American Heritage Month! Story and Craft","url":"https://paloalto.bibliocommons.com/events/6a59165ec7e02e3d00698bc6"},
        {"id":"timely-0-0","title":"Nutcracker! Magical Christmas Ballet","url":"https://www.sanjose.org/theaters/events/nutcracker-magical-christmas-ballet"},
        {"id":"deanza-0511f7d0d7296696","title":"Laser K-POP Demon Hunters","url":"https://daweb2.deanza.edu/events/event.html?id=191546769"},
        {"id":"midpen-bdae0d522b01b50d","title":"Tidal Marsh Appreciation","url":"https://www.openspace.org/events/guided-activities/tidal-marsh-appreciation"},
        {"id":"series-32a3b09e53dc18f2","title":"Neurosphere: Neuroscience and More! Grades 3-8","url":"https://paloalto.bibliocommons.com/events/6a384108c134422d50e9a7b2"},
        {"id":"nhl-2026020330","title":"San Jose Sharks vs Nashville Predators","url":"https://www.nhl.com/gamecenter/nsh-vs-sjs/2026/11/15/2026020330"},
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
