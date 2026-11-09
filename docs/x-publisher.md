# Bounded automatic connection replies

Production research is scheduled daily at 12:00 UTC and considers up to seven posts. The authenticated owner can also run research manually, at most once per UTC hour. Four Grok requests at most per hour (96/day maximum), including failures, replace the previous daily schedule. API usage is billable and these request limits are not a dollar cap. Configure provider spending limits.

Production publishing is scheduled daily at 13:00 UTC. The owner can run a check manually from /research.html. It attempts at most one reply per invocation and seven attempts per rolling hour; this is a ceiling, not a target. It only considers drafts researched in the last two hours and posts from the last 48 hours explicitly inviting connections or project/product introductions in the configured niches. The publisher re-fetches the source and verifies author and exact text before sending. Edited, missing, sensitive and uncertain matches are skipped.

## Activation and controls

Requires an hourly-capable Vercel plan, the existing CRON_SECRET and connected @digivatedx OAuth account, plus `X_AUTO_REPLY_ENABLED=true` in production. It stays off unless that value is exactly true. Existing X client and encryption settings are used for automatic refresh. Secrets are never sent to browser code.

Owner controls live at /research.html after /admin sign-in. Pause replies stops future reservations; pausing research also stops future publishing. A request already sent to X cannot be recalled by pausing. Owner status displays whether publishing is enabled, paused or halted.

## Limits and failure handling

- A persistent rolling-hour counter reserves attempts atomically before posting.
- One author/post is contacted at most once in 90 days. Identical reply text is suppressed for 30 days. History covers this app, not manual X activity.
- A single publisher lease prevents overlapping workers. A source is marked attempted before sending. Unknown outcomes are never automatically retried.
- API restrictions, token failures, storage failures or ambiguous posting responses halt the worker. Inspect X before resuming through the owner page.
- Access tokens are refreshed and stored encrypted with compare-and-save to protect concurrent owner reconnections.
- Successful sends store a direct reply URL and source URL in private history. There are no likes, follows, DMs, multiple accounts, proxy rotation or retries around platform restrictions.

This feature does not guarantee compliance with X automation policies or avoid account enforcement. It does not treat generic connection invitations as consent to receive an AI bot; the account owner has explicitly chosen to proceed despite that limitation. Wording is tailored for relevance, not to bypass spam detection.

Validation: `node tests/x-publisher.test.mjs`, `node tests/x-research.test.mjs`, and `node tests/x-connect.test.mjs`. The unit tests mock X and Redis; live operation still depends on the connected account's API permissions, credits, eligible posts and platform enforcement.

Project-link invitations may receive one relevant Digivated introduction containing exactly `https://digivated.com`. General connection invitations cannot receive links. The writer, reviewer and publisher share deterministic invitation/link rules; the publisher independently re-fetches exact source text and age before sending. No guaranteed traffic or guaranteed repost claims are allowed.

Temporary operator maintenance uses a server-side token hash and a maximum two-hour expiry, with one-use research/publish/resume grants. It never exposes stored credentials, bypasses rate limits, or retries ambiguous sends. The capability fails closed when unset or expired.
