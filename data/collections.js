/* Editorial Collection metadata.
 *
 * Keep only stable/editorial facts here. Runtime facts such as current count,
 * current date range, current cities and lifecycle state are computed by
 * collection-runtime.js from the event database.
 */
(() => {
  window.SBFF_COLLECTIONS = Object.freeze([
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
      unavailableDescription: 'We are refreshing the event details for this guide. Explore current South Bay family activities in the meantime.'
    })
  ]);
})();
