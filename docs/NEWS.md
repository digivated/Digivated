# Digivated News

`/news` publishes sourced updates in AI & Tech, Markets, and Security. Public readers see headlines, labels, original source links, and the source and Digivated publication times. Verified members and the owner can read full summaries. Member access is checked server-side; locked summaries do not enter the public search response.

## Automatic publication

Vercel checks sources at **08:00 and 20:00 UTC** (`/api/news-ingest`, authenticated by `CRON_SECRET`). `NEWS_AUTO_PUBLISH_ENABLED=true` enables the worker. The owner can also run an extra check or pause it from `/admin/news`.

The source list includes official publishers and independent reporting: Federal Reserve, SEC, OpenAI, Google, Microsoft Security, GitHub, TechCrunch, Ars Technica, The Verge, BleepingComputer, SecurityWeek, The Register, MarketWatch, Nasdaq, PR Newswire, and GlobeNewswire. Source hosts and feed URLs are fixed in `server/news-sources.mjs`; article links cannot expand that list. Feeds and articles have bounded response sizes and timeouts.

An article must be no more than **seven days old**, have a matching original headline, source-supported summary text, and a publication time confirmed by the article. A feed time can differ by up to six hours from article metadata; the article's original time is used on Digivated. Unverified, uncertain, stale, promotional, and duplicate candidates are **skipped**, not queued for approval. Each published record retains its source, original time, verification evidence, summary, Digivated publication time, and correction history.

Significant official developments within six hours can be labeled **Breaking**. Independent reporting and older qualifying stories are labeled **Update**. Issuer releases are identified as company announcements. A source link is available on every story. These rules support prompt automated coverage but do not guarantee that every event is detected.

The market snapshot is separate from editorial articles. Its observations retain their source dates and refresh during the twice-daily checks; unavailable data leaves the prior dated snapshot in place.

## Starter backfill

A one-time production build task checks up to fifteen recent items per source, for up to three passes, while the published collection is under forty stories. It uses the same source verification and publication rules as scheduled checks. It never invents articles or publishes unsupported claims to reach the target. The task is idempotent across builds and does not fail the site deployment if a source is unavailable.

## Owner workflow

The News desk shows published and removed stories, source evidence, check status, and correction history. There is no approval queue. Owners can correct or remove published stories; corrections leave an audit trail. A removed story leaves the public feed but keeps its private record. The former manual-review workflow is retained only in [historical notes](archive/news-policy-before-twice-daily.md).

`npm test` covers source parsing, verification, publication policy, and the public API. With an isolated local Redis, `DIGIVATED_TEST_REDIS_PORT=6389 node --test tests/news*.test.mjs` also covers atomic deduplication, corrections, and removal.
