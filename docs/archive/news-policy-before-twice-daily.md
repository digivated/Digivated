> Historical policy. Current behavior is documented in `docs/NEWS.md`.

# Digivated News

`/news` displays public headlines, original source links and original/site publication times. Verified members (or authenticated owner sessions) receive summaries from `/api/news`. Membership is checked on the server; responses are private/no-store and public searches do not search locked summaries.

## Automatic checks

Vercel Pro runs `/api/news-ingest` every five minutes with the existing `CRON_SECRET`. `NEWS_AUTO_PUBLISH_ENABLED=true` enables publication. `NEWS_INITIAL_RUN_ID` runs one source check during the first production build for that identifier. No new paid news API is needed. Existing X jobs stay disabled.

The fixed official feeds are Federal Reserve, SEC, OpenAI, Google and Microsoft Security. Feeds and articles have bounded responses/timeouts and cannot redirect outside the allowlist. Exact original publication time, matching article headline and a supported extract are required. Candidates older than 48 hours are excluded; Breaking expires after six hours. Conservative significance rules publish qualifying developments automatically; uncertain claims, importance or verification go to review. Summaries use concise source-supported extracts rather than invented reporting. Coverage is limited to these sources and rules; there is no guarantee every breaking story is detected.

Redis provides a run lease, atomic URL/event deduplication, optimistic editing, and independent public/private records. A failed source check preserves existing stories and dated market observations. The private run report records source health. Source evidence, original values, summary and publication timestamps remain with each story; the last 50 audit entries are retained. Records have a rolling one-year retention. Market observations refresh hourly and are separate from editorial content: government Treasury yields and broad dollar index, with their original observation dates, never fabricated live prices.

## Owner workflow

Sign in at `/admin`, then open **News desk** (`/admin/news`). Review pending stories, open their source, correct headline/summary/category/original timestamp, confirm verification and record a note before publishing. Removing a story withdraws its public projection and retains its private source/audit record. Concurrent edits require reloading. Pause/resume checks or run a manual check from the desk. These mutations require the existing owner session, same origin and CSRF token. Public visitors cannot trigger ingestion.

## Verification

`npm test` runs source/policy/API/Markets tests. With a dedicated loopback Redis, `DIGIVATED_TEST_REDIS_PORT=6389 node --test tests/news*.test.mjs` also exercises real Lua atomic deduplication, automatic publication, verification fallback, corrections, revision conflicts and withdrawal. Browser coverage: `tests/browser/news-paused.spec.ts` (retained filename replaces the former paused-section checks).

## Reviewed starter collection (9 November 2026)

`NEWS_STARTER_RUN_ID=reviewed-20261109-v1` enables one idempotent production-build import of ten individually reviewed Reuters and TechCrunch briefs. Every original article must still be within 48 hours. A direct article recheck verifies original date, source headline and a supporting extract; publishers that deny direct automated retrieval can use the recorded fresh Firecrawl live-capture review for at most 30 minutes. Capture ID, verification time, original publication time and content hash are retained in private evidence. A failed verification goes to review; an expired article is skipped. All starter briefs are Updates and use attributed editorial summaries. This does not broaden or relax the five-feed automatic breaking-news policy. Existing source URL deduplication prevents repeat imports and removed stories remain removed.

## Broader coverage

The automatic source list also includes GitHub’s official changelog, TechCrunch, BleepingComputer, PR Newswire’s earnings feed and GlobeNewswire company announcements. Verified product releases, developer features, patches and practical security guidance can publish as Updates. Security guidance never receives a Breaking label. Rumors, unsupported claims, old stories, promotional investor alerts and uncertain content remain excluded or queued for review.

Issuer releases require explicit source ticker notation and qualifying financial/company news, regardless of company size. They are labeled Company announcement and summarized with that attribution; they are not presented as independently confirmed financial performance. Ticker symbols are extracted only from explicit exchange notation in the verified article and can be searched with or without a leading `$`. No market-cap threshold or investment recommendation is applied. Already recorded URLs are skipped during feed collection so new entries progress beyond the first three items without repeatedly fetching the same articles.
