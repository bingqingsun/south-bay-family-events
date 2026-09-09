# Recommendation policy

The Recommended sort helps a parent find a realistic next plan. It is not a popularity ranking and must not imply paid placement.

## Ranking priorities

1. Upcoming usefulness: today, tomorrow, this weekend, then the next 30 days.
2. Distance: used only after the visitor grants location access; precise location is not stored or sent to analytics.
3. Decision readiness: an official link, a date, an actionable location, a meaningful description, and organizer-supported audience information.
4. Family appeal and event distinctiveness.
5. Variety across venue, organizer, category, and experience. Variety may gently reorder the first ten results but may never remove an activity.

Missing age, address, description, or official links reduce recommendation confidence. Cancelled events and closure notices receive no useful recommendation position; sold-out and waitlist-only events are strongly down-ranked.

## Editorial picks

An editorial pick must set all of the following fields:

- `editorPick: true`
- `editorPickUntil: YYYY-MM-DD`
- `editorPickReason`: a short internal reason grounded in family usefulness

Use editorial picks only for timely, verified activities with complete participation details. Never use the flag for sponsorship unless the card and destination clearly disclose the commercial relationship. Expired picks stop receiving a boost automatically.

Review active picks whenever event data refreshes. Recommendation changes must pass `scripts/recommendation.test.mjs` before release.
