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

X's current programmatic-reply rule requires an explicit author summon: the original author must @mention @digivatedx or quote one of its posts. A general connection/product-link invitation is not enough. The publisher rechecks mention entities and quoted-post authors before attempting a send; other opportunities stay manual drafts. Reference: https://docs.x.com/x-api/posts/manage-tweets/introduction

Validation: `node tests/x-publisher.test.mjs`, `node tests/x-research.test.mjs`, and `node tests/x-connect.test.mjs`. The unit tests mock X and Redis; live operation still depends on the connected account's API permissions, credits, eligible posts and platform enforcement.

Project-link invitations can be drafted with one relevant Digivated introduction containing exactly `https://digivated.com`. General connection invitations cannot receive links. The writer, reviewer and publisher share deterministic invitation/link rules; the publisher independently re-fetches exact source text and age before sending. No guaranteed traffic or guaranteed repost claims are allowed.

Live validation on November 9, 2026 verified the connected @digivatedx account and saved five fresh, verified drafts. An invited-product reply without an explicit summon was rejected by X with HTTP 403 (reply not permitted), and the publisher halted with zero replies sent. Publishing remains paused. The author-summon check now prevents that blocked path. Temporary maintenance access was removed after diagnostics.
