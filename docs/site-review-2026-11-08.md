# Public site review — November 8, 2026

Reviewed 16 public routes at 1440px and 390px: home, projects, rankings, AI tools, news, shop, submit, login, account, saved, promote, about, privacy, terms, resources and carousels. All 48 distinct internal page destinations found in those pages returned 200 after redirects. The baseline pages had no uncaught browser errors or horizontal overflow at those two widths. Library view refreshes consistently returned 503; an additional tablet check exposed footer overflow between the phone and desktop layouts.

## Changes

- Correct the low-contrast active Projects navigation state. Expose News in desktop navigation and keep search visible on phones.
- Position the mobile menu below the actual header, including the project ticker. Preserve Escape, outside-click and focus return behavior.
- Search now includes key site pages and builder names, opens project results within Digivated, retries incomplete content loading when reopened, and returns focus to a visible trigger. The advertised slash shortcut works without intercepting typing; Escape closes search even when the search field contains text. Correct legacy resource search paths.
- Honor featured-directory URLs; keep the URL in sync when switching collections. Project deep links remain able to open approved projects. Skip disabled controls when looping keyboard focus inside project details.
- Give the homepage one primary heading and use the existing SVG arrow icons on prominent home, shop and project-card actions.
- Make the 404 page part of the main site, with links to projects, home and search.
- Route password-reset requests to the active account page. Recognize recovery callbacks and offer an authenticated password form with confirmation. Existing sign-in, registration and ownership verification remain in place. No real email was sent and no real account password changed during testing.
- Validate carousel publication inside Redis before reading view counts. Previously a library MGET downloaded all slide images and exceeded the REST response size; the endpoint now returns only aggregates. Publication checks and stored totals remain intact.
- Use three footer columns on tablets to avoid forcing the six-column desktop layout beyond the viewport.

## Validation

Build and syntax checks pass. The Node test suite passes (179 passing, 5 optional fixture tests skipped); the affected activity and resource-view suites also pass separately against a dedicated local Redis instance (7 tests, no skips). The library test stores 14 guides with over 11 MB of slide payloads and verifies aggregate reads, publication rejection and unchanged counters.

All 9 focused browser tests pass. The suite covers 320px, 390px, 768px and 1440px, navigation/menu placement, keyboard search, builder search and project deep links, featured filtering, modal focus, 404 search, and simulated password recovery. See `tests/browser/public-cleanup.spec.ts`. Existing older browser suites include assertions for superseded page designs; this review uses tests for the current public UI rather than rewriting unrelated legacy suites.

Private administration and real purchases were not exercised. The changes do not modify stored project data, prices, purchases, publication decisions, database schema or authentication configuration.
