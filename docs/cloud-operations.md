# Cloud operations

South Bay Family Finds is designed so routine maintenance can run without the owner's Mac being online.

## Cloud workflow

1. Start a cloud task from ChatGPT or Codex on a phone.
2. Work against `bingqingsun/south-bay-family-events` and create a focused branch.
3. Run `npm test` before proposing changes.
4. Open a pull request and let the `Validate South Bay Family Finds` workflow finish.
5. Review and merge the pull request from the phone.
6. GitHub Pages publishes the merged site; the existing refresh workflow continues to update event data on weekdays.

Cloud tasks should not require access to the local `output/`, `outputs/`, `assets/social/`, or `node_modules/` directories. Those contain generated or machine-specific files and are intentionally excluded from Git.

## Commands

```bash
npm test
npm run refresh
```

`npm run refresh` uses free direct sources by default when `INCLUDE_SERPAPI=false`. Scheduled GitHub Actions may also use the optional `SERPAPI_KEY` secret according to `.github/workflows/daily-events.yml`.

## Secrets

- Store `SERPAPI_KEY` only in GitHub Actions secrets.
- Never put API keys, session cookies, personal email addresses, or private account data in the repository or task prompt.
- Cloud tasks may edit the repository without access to Cloudflare, Google Search Console, or other signed-in dashboards. Dashboard changes require a separately connected app or explicit user confirmation.

## Safe task pattern

Use a pull request for code, source, ranking, classification, and display changes. Direct pushes to `main` should be reserved for the automated event refresh workflow.

Example phone prompt:

> In the South Bay Family Finds repository, diagnose why the named event is missing. Prefer an official recurring source over a one-off hard-coded event, update tests, run the full test suite, and open a pull request. Do not change unrelated files.

## Generated social assets

Finished social images and campaign documents belong in the designated Google Drive folder. Do not commit large exports to the website repository. Commit a reusable renderer only when it is platform-independent, documented, and needed by future cloud tasks.
