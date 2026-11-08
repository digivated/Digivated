# Digivated — Notebook

## Chosen reference
The user's hand-drawn Refero search leads to Tally Forms. The primary visual reference is [Tally's reference screenshot](https://images.refero.design/styles/refero.design/image/2e807183-d98d-4c6f-941f-5ccc3f17c484.jpg); the technical reference is its [Refero DESIGN.md](https://styles.refero.design/style/4e3aa524-b146-416c-907f-382c079ea80c).

## Measured contract
Use Inter Variable, self-hosted from Fontsource 5.3.0 with its OFL license; no runtime font service. Display 64px, approximately 780 weight, tight tracking, centered; section heading 36–40px; subheading 22–28px; body 16–18px; labels 12–14px. Desktop content maximum 1200px. Use an 8px spacing scale, 64px section intervals, 24px card padding, 7px controls, and 10px surfaces.

The reference's centered hero, single prominent action, restrained line illustration, and white browser-style product surface are the structural base. The product panel is a working directory using existing project APIs and search/filter behavior. It contains no invented project data.

## Digivated-specific adaptations
Honor the user's white/gray requirement: charcoal actions replace Tally's blue, gray underline replaces magenta. Canvas #fafaf9, white panels, ink #37352f, body #5c5b57, muted #696863, lines #dededb. Preserve the current Digivated logo. Increase contrast where the reference's muted values would impair readability.

Original generated illustration: monochrome editorial pen drawing of a curious maker examining a browser window at a laptop; transparent background, no words, logos, emojis, color, or decorative sparkles. Built-in image generation; WebP delivery asset is optimized for its small rendered size. Original PNG retained separately from the repository.

## Supporting references
[Navbar Gallery: Supaste](https://www.navbar.gallery/navbar/supaste): small wordmark, quiet text navigation, distinguishable account action. [60fps: Circle menu interaction](https://60fps.design/shots/circle-menu-dropdown-morph-interaction): short scale/fade entrance, anchored to the trigger; honor reduced motion. [CTA Gallery](https://www.cta.gallery/): one explicit primary action and a subordinate helper line. [Posts.design](https://posts.design/): retain clear heading, product, and supporting-copy hierarchy; do not place social graphics or other brands' assets into the site.

## Verification and boundaries
Keep account, submission, moderation, feedback, likes, saves, views, notifications, and email logic intact. Existing script hooks remain unchanged. Verify search, collection filters, menu opening, feedback panels, 390px layout, build, and existing automated checks. Use only temporary public catalogue snapshots for local visual QA; exclude fixtures and review wrappers from commits.

## Navigation implementation
[Twenty desktop/mobile menus on Navbar Gallery](https://www.navbar.gallery/navbar/twenty) are the actual flyout reference: icon-led destination rows, separated secondary pane, pale featured action, and large mobile destinations. Digivated uses its own links and notebook colors. Mobile opens a viewport-height panel beneath the header with independent scrolling. Products and pricing remain accessible in a subordinate disclosure. Account-link IDs remain intact for session updates. The 60fps Circle reference informs an anchored 220ms scale/fade entrance, small item stagger, and a 140ms exit; reduced motion disables these. Escape, outside click, focus leaving the panel, ArrowDown entry, native keyboard toggling, and focus restoration are supported.

## Current homepage and search contract — November 8, 2026

The user explicitly requested centered presentation and a more professional search experience after reviewing laptop screenshots. `src/styles/search-and-alignment.css` owns the shared geometry and search component styling. Header navigation is centered independently of the unequal logo/account widths. The homepage hero, body copy, action group, visitor counters and project-directory container share a centered axis. Keep form fields, search rows and reading copy left-aligned inside their centered containers. Preserve the existing light gray palette, Inter font, logo and project data.

Search is a compact dialog with a fixed header, input, scope controls and footer; only the results area scrolls. The blank All scope suggests at most three real projects, rather than dumping every navigation destination. Typed queries show up to five ranked matches with accurate total counts; page destinations remain searchable. Use real same-origin project thumbnails with a safe fallback, semantic SVG icons, one-line descriptions and restrained metadata. Deliver project results independently of slower guide requests. Keep Escape, arrow navigation, Enter, focus restoration, clear/reset, scope filtering, partial-error handling and same-page project links working.

Public references inspected: [Refero Styles](https://styles.refero.design), [TypeUI](https://typeui.sh), [designmd.supply](https://designmd.supply), and [Design.md Store](https://designmd-store.com). The detailed [TypeUI Atlas overview](https://www.typeui.sh/design-skills/atlas) and [Linear design guide](https://www.designmd.supply/guides/linear.app) informed compact Inter typography, consistent spacing, hairline borders and restrained elevation. Digivated keeps its own palette and rounded controls; the user's centered layout preference takes precedence over reference layouts. These were read as public reference material; no third-party package or skill installer was executed.

## Single project reel — November 8, 2026

Replace the former top Featured and bottom All Projects tickers with one Project Reel per page. The homepage places it after the compact featured strip; the Projects page places it before the directory. Keep the header clean. The reel reads every page of the public catalogue, deduplicates IDs, includes approved and featured projects, and retains a project if its image fails. Project cards open their Digivated detail pages.

The visual treatment is a restrained charcoal gallery: actual project artwork, soft edge fades, slight card rotation and independent float, maker attribution, and a quiet illuminated title. The rail moves with a fractional position accumulator, so high-refresh displays do not lose subpixel movement. Measure the group width for seamless looping; cloned cards are omitted from keyboard order and accessibility navigation. Only the original published set contributes to the displayed count.

Pause the rail and card animation on hover or keyboard focus. Provide explicit pause/play and previous/next controls; touch dragging pauses automatic movement until resumed. Honor reduced-motion preferences with a static, manually scrollable rail. Stop frame scheduling when offscreen or the document is hidden. Keep manual keyboard browsing available. No third-party animation library or backend write is involved.

## Compact homepage featured projects — November 8, 2026

Homepage order is introduction, stationary featured strip, all-project reel, footer. Replace the former full-size homepage wall with a small centered row of cards matching the reel artwork, category, project name and maker treatment. Keep search, pagination, upvotes, views and feedback in the Projects directory and project details. The homepage strip links to those existing detail pages and the featured directory; it does not duplicate those controls.

Read the public featured feed with pagination, deduplicate IDs and require featured status. Show all current featured picks; never fill the strip with ordinary approved projects or fake cards. On phones allow native horizontal browsing. Keep the strip stationary even while the separate reel animates, preserve image-error fallbacks, and show an honest error or hide a truly empty section. `project-showcase-card.js` supplies the same safe card markup to both presentations.
