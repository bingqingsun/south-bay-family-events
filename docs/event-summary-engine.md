# Event Summary Engine

South Bay Family Finds uses one shared event-summary engine for every source.

## Product invariant

The site may make official event information easier to read, but it must never
claim an activity fact that is not supported by an official source.

A reported bad card is treated as a regression example for a general rule.
Do not add event-title-specific summary exceptions to fix one activity.

## Architecture

### 1. Source adapters: capture facts only

`scripts/update-events.mjs` source adapters may:

- fetch an official event page, feed, API, or registration record;
- parse official title, time, venue, audience, cost, availability, image, and
  full activity description;
- reject stale or mismatched source content;
- pass official structured fields to a structured summary builder.

Source adapters must not:

- write a parent-facing summary based on an event title;
- maintain their own sentence scorer;
- infer an activity from category, image, venue, or similar events;
- truncate a selected sentence into stored ellipsis;
- use search snippets as activity evidence.

### 2. Event Summary Engine: one summary policy

`scripts/event-summary-engine.mjs` owns:

- sentence segmentation and abbreviation handling;
- fragment detection;
- logistics / accessibility / biography filtering;
- concrete-activity ranking;
- multi-activity bundle extraction;
- readability validation;
- extractive grounding;
- structured sports/movie summary builders;
- summary status, method, quality, evidence, hash, version, and verification
  metadata.

The canonical adapter-to-engine boundary is `buildSummaryRecord()`.

For a source adapter that needs to know whether official text can produce a
usable card before constructing the event, use `hasPublishableSummary()`.
Do not duplicate the engine logic in the adapter.

### 3. Publication gate

`scripts/test-summary-output.mjs` audits every generated event before the
refresh can commit data.

For extractive summaries:

- `parentSummary` must be an exact excerpt of `sourceDescriptionRaw`;
- `summaryEvidence` must equal `parentSummary`;
- the summary must pass the readability gate;
- ingest-time ellipsis is not allowed.

For structured summaries:

- the summary must include `summaryEvidenceData`;
- required source fields must exist, such as home team + opponent for sports or
  rating for a movie screening.

For all summaries:

- `description === parentSummary` during the v2 migration;
- source hash, status, method, quality, evidence, version, and verified time are
  required.

## Summary statuses

- `extractive`: verbatim text selected from the official source.
- `official_structured`: deterministic wording composed only from official
  structured fields.
- `manual_verified`: a human-verified transitional record when an official
  page does not expose reliable machine-readable activity copy.
- `needs_review`: not publishable.

## How to fix a summary bug

Do not patch the event.

1. Save the official source text that reproduced the issue as a regression
   fixture.
2. Identify the general failure class: segmentation, fragment detection,
   logistics selection, background-over-action ranking, stale source, etc.
3. Change the shared engine rule.
4. Prove the original case and generic neighboring cases pass.
5. Run the full refresh and output provenance audit.
6. Review the Preview before merge.

Examples such as a bird-feeder program, sensory notes, or a sentence containing
`p.m.` exist only as regression fixtures. Production behavior must not depend
on those event titles.

## Adding a new source adapter

A new adapter is acceptable only when:

1. it fetches first-party/official data;
2. it preserves the fullest reliable source description available;
3. it calls the shared engine instead of defining summary logic;
4. its output passes the full provenance audit;
5. no unsupported activity detail is introduced.

## Current engine version

`event-summary-v2-p3`
