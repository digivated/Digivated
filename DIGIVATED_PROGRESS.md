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
