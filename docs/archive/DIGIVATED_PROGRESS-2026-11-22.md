# Digivated progress

## Phase 1: Technical SEO (2026-11-22) — audit done, fixes on branch `seo-phase-1` (not merged, not deployed)

### Verified findings
1. **Homepage, /discover and /categories are client-rendered.** Static HTML has "Loading launches…" / "JavaScript is needed to browse projects." No crawlable links to projects, creators or categories from any indexable page. Project pages are reachable only via sitemap. Highest-impact issue.
2. **Project-page JSON-LD** (`server/launch-pages.mjs`) strips the template's Organization/WebSite graph and emits a bare WebPage whose `isPartOf` points to `https://digivated.com/#website`, which no longer exists in that document. No breadcrumb, no dates.
3. **/toolkit** ("My saved work", browser-local shell) is in the sitemap and has no noindex. `tests/sitemap.test.mjs` asserts it is listed.
4. Sitemap otherwise sound (dynamic, lastmod validated, private paths blocked). 72 projects, 3 creators, 25 static pages. Creator profiles use `/creator?id=` only; no per-category or launch-archive URLs exist.
5. Fine as-is: robots.txt, canonicals, homepage title/description/OG/Twitter, redirects.

### Changes on seo-phase-1
- Project JSON-LD via `server/launch-schema.mjs` (wired into `server/launch-pages.mjs`).
- `/toolkit` removed from `staticPublicPages` (`server/sitemap.mjs`, test updated) and noindex added in `src/layouts/Shell.astro`.
- Tests: new `launch-schema.test.mjs` 3/3 pass; `node --check` OK. Existing suite could NOT run locally (deps not installable offline). Verify via Vercel preview / CI before merging.

### Original fix notes
- New `server/launch-schema.mjs` + `tests/launch-schema.test.mjs`.
- Wire-in (only change to `launch-pages.mjs`, in `renderLaunch`):
  - after the draft script-strip line, before the ld+json strip: `const templateSchema = shell.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';`
  - replace the `const schema=...` block with: `const schema=draft?'':launchSchemaScript({ item, canonical, description:metaDescription(item.description), templateSchema });`
  - add `import { launchSchemaScript } from './launch-schema.mjs';`
- Not yet run: full `npm test` (needs repo checkout).

### Still open
- Server-render a crawlable project list (links to `/projects/...`) on /discover and /categories, plus per-category pages. Needs a data source at request time (API handler like `api/project-page.js`), not the static Astro build.
- Review `/access`, `/library`, `/fixes`, `/builder`, `/workflows`, `/checklists`, `/learn` for thin/gated content.

### Remaining phases
2 AEO, 3 scans/emails, 4 performance, 5 verification/deploy.

## Phase 2: AEO / AI discoverability — branch `seo-phase-2` (stacked on seo-phase-1; not merged, not deployed)
### Finding
Most AI crawlers do not run JavaScript. Homepage, /discover, /categories and creator-page project lists are filled in the browser, so those crawlers see no product names or links. Existing `llms.txt` is fine to keep but is not evidence of better ranking or citations.

### Change
- New server-rendered **/projects**: every published project as plain links grouped by category (name, maker, 180-char description), CollectionPage + ItemList JSON-LD, short shared cache (s-maxage 300), 503 + noindex on failure. Uses only the existing public projection (`projectPublic`), so nothing unpublished appears.
- Same template pattern as /creator: `src/pages/projects.astro` -> `server/generated/projects.html` -> served by `server/project-index.mjs` through the existing public router (no new serverless function). `vercel.json` rewrite for `/projects` and `/projects/`.
- Linked from footer "Explore" (all pages), sitemap and llms.txt.
- Tests: `tests/project-index.test.mjs` + `launch-schema.test.mjs`, 7/7 pass. NOT run locally: `astro build`, existing suite, browser check (deps not installable offline). Verify on the Vercel preview: /projects renders with site chrome, no console errors, /discover and /creator unchanged.

### Not done (ideas, need decision)
- Per-category pages (`/categories/<name>`) with their own copy; weekly launch archive pages (`/launches/<week>`); render project lists inside creator profiles server-side. Each needs the same server-render pattern.

## Phase 3: Scans and repeated emails — branch `seo-phase-3` (stacked; not merged)
### Findings (measured)
- App emails are already idempotent: weekly digest has per-recipient sent keys + Resend Idempotency-Key; badge/launch mails use `SET NX`. The 4 Vercel crons (hourly Monday digest, launch-queue, badge-check, news-ingest) are by design, not the loop. `promptcove-threads` hourly runs are all `skipped` (no email).
- **Repeated-email source: the `Digivated QA monitor` GitHub workflow.** Last 100 runs: 56 failed, 42 cancelled, 1 scheduled; the rest fire on `deployment_status` for every Preview and Production deployment (about 17 production deploys in 3 hours today).
- Failures are screenshot drift, not site outages: 28 confirmed mismatches per run, e.g. `home-mobile` 91% of pixels differ. The baseline predates today's redesign changes. Each failed run sends a GitHub failure email.
- Vercel "deployment failed" emails exist in the inbox (older); all 40 most recent deployments are READY, so no active build loop.
### Changes
- `qa/monitor.spec.ts`: screenshot comparison runs only against digivated.com; previews keep all functional checks.
- New manual workflow `qa-baseline.yml`: regenerates the baseline on CI and opens a PR for review (the baseline cannot be refreshed here; production screenshots need CI).
- `qa/README.md` documents both.
### To finish
- After merging, run "Digivated QA baseline refresh", review the PR images, merge. Until then production runs still fail on drift.
- Not verified locally: workflow YAML parses, spec change is a 3-line conditional; Playwright not runnable offline.

## Phase 4: Performance and cleanup — branch `seo-phase-4` (stacked; not merged)
### Verified and changed
- Removed two dependencies with zero references anywhere in the repo (src, server, api, scripts, tests, qa, public, configs): `three` and `@hugeicons/core-free-icons`. `package.json` and `package-lock.json` updated with `npm uninstall --package-lock-only` (both parse; no other lock entries changed). Runtime behaviour unchanged since nothing imported them; benefit is a smaller install and less supply-chain surface. `npm ci` / `npm run build` not run here (no network) — Vercel preview will confirm.
### Checked, left alone (no evidence of a problem)
- Analytics: GA4 loads async, only on digivated.com, minimal events, no ad signals. Nothing to trim.
- Weekly digest/launch/badge emails: idempotent (see Phase 3).
- Other deps (`react`, `react-dom`, `@base-ui/react`, `@liquefy-ui/core`, `jose`, Sentry, Supabase, `@vercel/firewall`, Playwright, Checkly) are all imported.
- Homepage pulls the full project list in 100-item pages with `cache: 'no-store'` on the client, while the server already sets a 10-minute CDN cache on that path. Changing client caching could show stale rankings/fair-start state, so not changed.
### Candidates needing measurement first (no numbers yet)
- ~226 KB of global stylesheets in `public/` (`clean.css` 67 KB, `dg-board.css` 50 KB, `ascii-flow.css` 46 KB, `ascii-silver.css` 33 KB, `daylight.css` 29 KB) plus many Astro bundles, all render-blocking and layered. Possible overlap with the older ASCII theme, but removing rules blind risks visual regressions.
- `public/media` is 2.1 MB; confirm which files pages actually load.
- Run Lighthouse / Vercel Speed Insights on the preview and production before changing anything: LCP, INP, CLS are unmeasured.

## Phase 5: Verification — draft PR #291 (seo-phase-4, stacked phases 1-4) — NOT merged, NOT deployed
- First CI run on #291 failed `launch-collections.test.mjs` (existing test expected flat JSON-LD). Cause: my Phase 1 change. Test updated to read the WebPage from `@graph` and assert Organization/WebSite/Breadcrumb exist. Re-run: **Verify "Tests and production build" passed**, plus admin, community, Vercel preview deploy.
- Second QA root cause found: Preview QA runs fail because `VERCEL_AUTOMATION_BYPASS_SECRET` is empty, so every preview lands on Vercel login. `qa-monitor.yml` now skips Preview runs with a notice while the secret is unset. Add the secret to turn them back on.
- Production QA still fails on stale screenshots until the baseline refresh workflow is run after merge.
- Not verified: browser check of /projects and project JSON-LD on a preview; production deployment (none done).
