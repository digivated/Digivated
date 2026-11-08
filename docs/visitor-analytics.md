# Monthly visitors

The home page card reads `/api/visitors`. It shows unique users for the last 30 complete days and a daily unique-user trend. The total is requested separately to avoid double-counting repeat visitors across days. Reports use the property's timezone and are cached for one hour. Missing dates in a successful report are displayed as zero; missing configuration or failed reports never produce invented counts or a decorative trend.

To connect real data:

1. Use the Digivated Google Analytics 4 property. The production site now loads measurement ID `G-BRXWQ313J5` through `public/analytics.js`.
2. Enable Google Analytics Data API in the service account's Google Cloud project.
3. Grant that service account Viewer access in GA4 Property Access Management.
4. Add `GA4_PROPERTY_ID` (numeric property ID), `GA4_CLIENT_EMAIL`, and `GA4_PRIVATE_KEY` to the production Vercel environment and redeploy. The PEM key accepts real newlines or escaped `\n` characters.

The API returns aggregate counts only. Credentials stay on the server. Tracking is installed on the public production hostname only. The tag strips URL query strings and fragments from page locations and referrers, and disables Google Signals and advertising personalization. The site CSP allows the Google tag and Analytics collection endpoints. Report display still requires the separate read-only credentials above. Until configuration is supplied, the card displays an em dash and “Visitor analytics coming soon.” Google reporting may lag; it is not a realtime counter.

## Homepage activity counters

The homepage shows “Visited this site” (recorded page visits, including repeat visits) and “On the site now” (approximate active browsers). Every public Platform page sends a same-origin heartbeat to `/api/site-activity` every 30 seconds while visible. A browser is considered active for 90 seconds. Multiple tabs on the same network and browser type share a daily rotating HMAC identity; no raw addresses, user agents, cookies or local-storage identifiers are stored. Shared networks can undercount, and tracking blockers can exclude visits. This is not a lifetime unique-people count or an exact concurrent-person count.

The durable Redis total starts with the 3,317 production pageviews returned by Vercel Web Analytics on 2026-11-08 before rollout (available history beginning 2026-10-03). This is recorded history, not a reconstruction of untracked traffic. There can be a small collection gap between the historical snapshot and deployment; traffic before the existing analytics history cannot be recovered. The baseline is initialized with SET NX, never added again on redeploy. Future page visits increment atomically; per-document random request IDs deduplicate retries for 24 hours. Heartbeats do not increment the total. Known crawlers and preview deployments do not add visits. Inactive identities are pruned and the live sorted set expires; the total never expires. A per-identity request ceiling limits write abuse. Redis uses the existing server-only submissions credentials. No credentials reach the browser. On failure the UI shows an em dash rather than invented numbers.

Run the activity tests with `node --test tests/site-activity.test.mjs`. For atomic concurrency, duplicate-tab, retry and expiry tests against a dedicated loopback Redis fixture, set `DIGIVATED_TEST_REDIS_PORT`; tests use database 13 and clear only that test database.
