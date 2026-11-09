# Digivated — Notebook

## Chosen reference
The user's hand-drawn Refero search leads to Tally Forms. The primary visual reference is [Tally's reference screenshot](https://images.refero.design/styles/refero.design/image/2e807183-d98d-4c6f-941f-5ccc3f17c484.jpg); the technical reference is its [Refero DESIGN.md](https://styles.refero.design/style/4e3aa524-b146-416c-907f-382c079ea80c).

## Measured contract
Use Inter Variable, self-hosted from Fontsource 5.3.0 with its OFL license; no runtime font service. Display 64px, approximately 780 weight, tight tracking, centered; section heading 36–40px; subheading 22–28px; body 16–18px; labels 12–14px. Desktop content maximum 1200px. Use an 8px spacing scale, 64px section intervals, 24px card padding, 7px controls, and 10px surfaces.

The reference's centered hero, single prominent action, restrained line illustration, and white browser-style product surface are the structural base. The product panel is a working directory using existing project APIs and search/filter behavior. It contains no invented project data.

## Digivated-specific adaptations
The user's latest site-wide dark liquid-glass request supersedes the earlier light palette. Canvas #020304, panels #080b10, ink #edf3fc, copy #b7c5d8, muted #8c9db3, restrained cyan highlights and translucent cool borders. Preserve the current Digivated logo. Increase contrast where the reference's muted values would impair readability.

Original generated illustration: monochrome editorial pen drawing of a curious maker examining a browser window at a laptop; transparent background, no words, logos, emojis, color, or decorative sparkles. Built-in image generation; WebP delivery asset is optimized for its small rendered size. Original PNG retained separately from the repository.

## Supporting references
[Navbar Gallery: Supaste](https://www.navbar.gallery/navbar/supaste): small wordmark, quiet text navigation, distinguishable account action. [60fps: Circle menu interaction](https://60fps.design/shots/circle-menu-dropdown-morph-interaction): short scale/fade entrance, anchored to the trigger; honor reduced motion. [CTA Gallery](https://www.cta.gallery/): one explicit primary action and a subordinate helper line. [Posts.design](https://posts.design/): retain clear heading, product, and supporting-copy hierarchy; do not place social graphics or other brands' assets into the site.

## Verification and boundaries
Keep account, submission, moderation, feedback, likes, saves, views, notifications, and email logic intact. Existing script hooks remain unchanged. Verify search, collection filters, menu opening, feedback panels, 390px layout, build, and existing automated checks. Use only temporary public catalogue snapshots for local visual QA; exclude fixtures and review wrappers from commits.

## Navigation implementation
[Twenty desktop/mobile menus on Navbar Gallery](https://www.navbar.gallery/navbar/twenty) are the actual flyout reference: icon-led destination rows, separated secondary pane, pale featured action, and large mobile destinations. Digivated uses its own links and notebook colors. Mobile opens a viewport-height panel beneath the header with independent scrolling. Products and pricing remain accessible in a subordinate disclosure. Account-link IDs remain intact for session updates. The 60fps Circle reference informs an anchored 220ms scale/fade entrance, small item stagger, and a 140ms exit; reduced motion disables these. Escape, outside click, focus leaving the panel, ArrowDown entry, native keyboard toggling, and focus restoration are supported.

## Current homepage and search contract — November 8, 2026

The user explicitly requested centered presentation and a more professional search experience after reviewing laptop screenshots. `src/styles/search-and-alignment.css` owns the shared geometry and search component styling. Header navigation is centered independently of the unequal logo/account widths. The homepage hero, body copy, action group, visitor counters and project-directory container share a centered axis. Keep form fields, search rows and reading copy left-aligned inside their centered containers. Preserve the Inter font, logo, project data and centered geometry; use the shared dark liquid-glass palette.

Search is a compact dialog with a fixed header, input, scope controls and footer; only the results area scrolls. The blank All scope suggests at most three real projects, rather than dumping every navigation destination. Typed queries show up to five ranked matches with accurate total counts; page destinations remain searchable. Use real same-origin project thumbnails with a safe fallback, semantic SVG icons, one-line descriptions and restrained metadata. Deliver project results independently of slower guide requests. Keep Escape, arrow navigation, Enter, focus restoration, clear/reset, scope filtering, partial-error handling and same-page project links working.

Public references inspected: [Refero Styles](https://styles.refero.design), [TypeUI](https://typeui.sh), [designmd.supply](https://designmd.supply), and [Design.md Store](https://designmd-store.com). The detailed [TypeUI Atlas overview](https://www.typeui.sh/design-skills/atlas) and [Linear design guide](https://www.designmd.supply/guides/linear.app) informed compact Inter typography, consistent spacing, hairline borders and restrained elevation. Digivated keeps its own palette and rounded controls; the user's centered layout preference takes precedence over reference layouts. These were read as public reference material; no third-party package or skill installer was executed.

## Single project reel — November 8, 2026

Replace the former top Featured and bottom All Projects tickers with one Project Reel per page. The homepage places it after the compact featured strip; the Projects page places it before the directory. Keep the header clean. The reel reads every page of the public catalogue, deduplicates IDs, includes approved and featured projects, and retains a project if its image fails. Project cards open their Digivated detail pages.

The visual treatment is a restrained charcoal gallery: actual project artwork, soft edge fades, slight card rotation and independent float, maker attribution, and a quiet illuminated title. The rail moves with a fractional position accumulator, so high-refresh displays do not lose subpixel movement. Measure the group width for seamless looping; cloned cards are omitted from keyboard order and accessibility navigation. Only the original published set contributes to the displayed count.

Pause the rail and card animation on hover or keyboard focus. Provide explicit pause/play and previous/next controls; touch dragging pauses automatic movement until resumed. Honor reduced-motion preferences with a static, manually scrollable rail. Stop frame scheduling when offscreen or the document is hidden. Keep manual keyboard browsing available. No third-party animation library or backend write is involved.

## Compact homepage featured projects — November 8, 2026

Homepage order is introduction, stationary featured strip, all-project reel, footer. Replace the former full-size homepage wall with a small centered row of cards matching the reel artwork, category, project name and maker treatment. Keep search, pagination, upvotes, views and feedback in the Projects directory and project details. The homepage strip links to those existing detail pages and the featured directory; it does not duplicate those controls.

Read the public featured feed with pagination, deduplicate IDs and require featured status. Show all current featured picks; never fill the strip with ordinary approved projects or fake cards. On phones allow native horizontal browsing. Keep the strip stationary even while the separate reel animates, preserve image-error fallbacks, and show an honest error or hide a truly empty section. `project-showcase-card.js` supplies the same safe card markup to both presentations.

## Site-wide dark liquid glass — November 8, 2026

`public/dark-glass.css` owns shared paint across Platform, Shell and Admin, including generated project pages. Use near-black canvas, subtle code-grid texture, blue-gray translucent panels, gentle edge highlights and glass controls. Keep text contrast clear, images in their original colors and typography restrained. Avoid blur on repeated cards and on headers: a filtered header changes the containing block of fixed mobile navigation. Preserve responsive geometry, selectors, script hooks, authentication, moderation and payment flows. Honor reduced motion and native dark form controls.

The refined black-glass palette uses cyan and violet ambient pools in the homepage hero, an ice-to-lilac headline accent, luminous primary actions and hover edges. Keep glow static, concentrated and subordinate to readable content. No extra animation loops, overlays or layout changes.

## Motion experience — November 8, 2026

References read: [Scrolltide](https://www.scrolltide.co/), [ScrollShaders](https://scrollshaders.com/) and [Footer.design](https://www.footer.design/), via the supplied Himanshu post. Original native CSS and Web Animations implementations; no third-party source copied or new runtime dependencies. One-shot hero light arrival (4.5s), small content entrances, fine-pointer glass highlights, short dialog entry, CTA arrow feedback and legible cyan active-tab indicators. Keep the reel's existing controls, focus and reduced-motion behavior. No scroll hijacking, tilt on moving cards, content hidden pending JS, or delayed dialog closing. Pointer light clears on exit, hidden tabs and preference changes; entrances cancel on focus, hidden tabs or reduced motion.

## Black and purple refinement — November 8, 2026

Latest user direction supersedes the earlier cyan/glass motion treatment. Reference: [dark.design](https://www.dark.design/), including the gallery's Railway example. Use #050505 canvas, #101014 cards, neutral white/gray text, #c3a0ff link/focus accents, and a saturated purple primary action. Keep a single static purple hero glow, crisp hairlines and restrained elevation. Keep centered geometry and actual project artwork.

Performance takes priority over decorative motion: disable backdrop filters across all three layouts, remove per-card reel float animations, omit the duplicate studio/pointer-light scripts from the public layout, and render hero text immediately. Retain the single controlled reel, native scrolling, keyboard controls, and short dialog/section entrances. No new dependencies or changes to auth, moderation, payment, or project data. See `docs/black-purple-performance.md` for the controlled before/after sample.

## Single membership offer — November 8, 2026

The owner clarified the offer as **$5 USD once**, overriding the initial subscription wording. One public offer: one reviewed project spotlight and full News access when News launches. News is explicitly coming soon. The canonical page is `/membership`; former shop, products, promotion and founding URLs share that offer. Previous-purchase access remains available, but standalone products are no longer advertised for sale. Existing verified purchase logic and atomic one-feature claims remain intact.

`src/data/membership.mjs` is the public source of truth. Keep `checkoutReady: false` until the seller-side Gumroad metadata, branding, price, storefront and product visibility have been verified. Authenticated Gumroad access is currently missing; the staged site must not send buyers to the mismatched old listing. Prepared seller materials and the remap script are documented in `gumroad/README.md`. The matching page and Gumroad storefront use the black/purple palette, native fonts, static surfaces and no animation loops.

Owner-only Gumroad setup is available at `/admin#gumroad-setup`: a masked API-key input uses the existing authenticated session, origin and CSRF checks. No seller key is persisted or logged. The operation applies the prepared remap and writes checkout readiness only after verifying the buyer-facing $5 one-time offer; the public page then enables checkout through a small read-only status request. Failed or unconfigured status keeps checkout paused. Native Gumroad checkout remains provider-managed.

### Compact navigation
The shared menu uses five plain destination links, followed by compact account and utility rows. Keep its opaque black surface, restrained purple states, single-line labels, and mobile touch targets. Avoid promotional cards, repeated actions, nested offer lists, and per-link icon boxes. Native disclosure, keyboard dismissal, focus return, account hooks, and the separate search remain intact.

### Site identity and directory consistency
Use `/digivated-logo.webp` for the approved white/purple portal mark (5.3 KB). Its original dark colors must not be inverted. Browser and Apple icons use the same mark. UI icons come from `src/lib/card-icons.mjs` for Astro and client components, with consistent strokes and familiar action symbols.

Project cards show a category without positional numbering. Pagination uses Previous/Next only when needed, with page context reserved for screen readers. Keep controls separated and never apply the global button surface to an entire project card. Project category filters use published categories only.

`src/lib/project-taxonomy.mjs` records a review of all 57 published project descriptions. Category corrections apply only when the source category still matches the reviewed value; later owner category edits take precedence. Source submissions, status, URLs, views, votes, and purchases are not mutated. Education covers learning/exam tools; Developer Tools covers coding utilities; Business covers commerce, marketing, and business operations; Creator Tools covers publishing and content workflows; Design covers visual editing; Productivity covers personal/team work. AI topic placement is reviewed for existing projects and conservative for new ones. Directories get their own topic; Other AI tools is a fallback rather than a duplicate of every tool.

### Project submission workspace — November 8, 2026

The submission page uses the current Obsidian tokens for every fieldset, account status, upload preview and review panel. Keep the four named sections, existing native controls and all submission/authentication hooks. Readable 14px labels, 13px helper text and 16px inputs replace the earlier compact light-theme styling. Float fieldset legends into the content flow so headings do not straddle section boundaries. The live public listing preview stays beside the form on desktop and below it on phones; explicitly show this aside to avoid the shared mobile sidebar rule. No new dependencies, backend changes or real submissions are needed for verification.
### Live counter motion
View and site-activity totals use one 420 ms upward settle and brief purple emphasis only when their numeric value changes. Do not animate initial loading, unchanged totals, offscreen counters, or reduced-motion sessions. `count-motion.js` observes content changes without changing text or React ownership; it adds no polling or API requests. Effects cancel on pagehide and reduced-motion changes, and remain compatible with back/forward cache restoration.

### Navigation and destination cleanup — November 9, 2026

`site-navigation.mjs` owns the canonical header and footer destinations. The footer has Explore, Your workspace, Digivated (including legal links), and Connect groups; the paused social community is not advertised as an active feature. Preserve all distinct account, collection, submission and purchase routes. Membership aliases `/shop`, `/products`, `/promote`, and `/founding-members` redirect to `/membership` in production and share its canonical metadata. Existing purchase access remains available.

Directory collection controls have independent 44px hit areas, a 12px gap, an explicit active border and no active shadow that can bleed into adjacent controls. The toolbar wraps whole controls at narrow widths. About describes the current project directory, community upvotes, AI tools and submissions; News remains coming soon. Prompt Packet pages keep the shared Obsidian theme and current logo, with route-specific canonical metadata and current legal links.

### Community rankings — November 9, 2026

`src/styles/rankings.css` is scoped to `.rankings-directory`; the shared AI directory retains its original presentation. The rankings hero uses existing Inter typography and Obsidian black/violet tokens, with a two-line heading and a direct submission link. The first three entries in the same ordered list have larger, contained project artwork and positional badges; subsequent entries use compact rows. These positions follow the existing vote/date/ID sort, including when all period totals are zero. No winner, trend or movement is invented.

Period buttons have separate 44px targets. Category chips scroll within their own row on narrow screens. Project count and upvote summary reflect the complete filtered result, not only the loaded display limit; voting reloads authoritative totals through the existing API. Timing and historical-vote information lives in a native disclosure. Failed images retain an initial fallback and the project link. UI arrows use the shared SVG icon set.

Source evidence: live `/rankings` screenshot and source inspected November 9; Firecrawl branding extraction confirmed the existing dark scheme, Inter, black canvas, and violet accents. New layout choices are implementation judgement within that system; no external product precedent is claimed. Voting, filtering, authoritative reorder, pagination, errors, narrow layouts, and the shared AI tools flow are covered by browser checks.

### Minimal shared header — November 9, 2026

Use a single horizontal row with the approved logo, plain desktop destination links, icon search, account text, one restrained Membership outline, and a three-line menu icon. Remove the surrounding navigation capsule and utility button shadows. Active desktop destinations use a thin violet underline and readable mixed-case labels. Keep native menu disclosure and its open/close accessible labels, Escape/outside dismissal, keyboard entry, account hooks, and all destinations.

At tablet widths the primary destinations live in the menu. On phones account links remain in that menu, while Membership, search and the menu stay visible; at the narrowest width use the approved brand mark without the wordmark to fit whole controls. The header follows existing black/violet tokens and supports reduced motion. Browser checks cover 320, 390, 768, 1024 and 1440px, menu bounds, separate targets, keyboard focus, search, active destination, and existing footer/access/collection flows.
