# Operations audit — 9 November 2026

Scope: repository naming and copy, Vercel production status, and the connected Digivated Supabase project. This audit did not change production credentials, database schema, authentication settings, or routing.

## Verified

- The Vercel project is `digivated` (`prj_SfARXMeiaJ6y6EIvhwtedHdN1ZJ1`). Its production deployment was ready at audit time; `/`, `/discover`, `/creators`, `/news`, `/membership`, and `/admin` returned HTTP 200. Vercel reported no runtime errors in the previous 24 hours.
- The Digivated Supabase project (`cglkjclolglwizwepvmy`) was `ACTIVE_HEALTHY`. All listed `public` tables had row-level security enabled. Health advisors returned no findings.
- The local Astro build, syntax check, and 255-test suite completed successfully (247 passed, 8 skipped).

## Cleanup completed

- Replaced the obsolete Prompt Package README with a concise Digivated overview and current entry points. Preserved the prior README and historical checkpoints under `docs/archive`.
- Renamed the npm package metadata to `digivated`. This is package metadata only; it does not change the site URL or deployment project.
- Reorganized `.env.example` by current service and removed an old concrete product ID. The file contains names and placeholders only; no Vercel variables were changed.
- Simplified the footer's X label and the admin empty-state wording.

## Findings to handle separately

- Supabase's security advisor flags leaked-password protection as disabled. Enabling it affects future sign-ups, so it should be tested with the account flow as a focused auth change.
- Four foreign-key indexes are suggested by the performance advisor. The affected community and paper-trading tables currently have no rows. Add indexes when those features begin using those queries; avoid dropping existing indexes merely because the advisor currently calls them unused.
- Fourteen server-managed tables have RLS enabled without client policies. This is consistent with private server access; review a table's intended client access before adding any policy.
- Vercel still lists `digitalpromptpackage.vercel.app` as a legacy domain. Existing redirects protect historical links. Remove it only after checking inbound usage and links.
- The Supabase project includes community and beat-desk/paper-trading tables. Their schema and names were preserved because they may support separate workflows; a database rename or deletion would need its own dependency review.
