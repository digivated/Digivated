# Free project badge and launch cycle

1. A signed-in creator saves a complete free project. The response includes its badge HTML and the creator's chosen launch date: a Monday at 9:00 AM Eastern, picked on the submit form from the next eight (`launchAt`, validated server-side against `freeLaunchOptions`; omitted means the soonest Monday).
2. The creator adds the badge as HTML on the saved public project URL, publishes that page, then chooses Verify website badge in Your Projects.
3. Verification checks project ownership and the exact listing link/project ID. Comments, scripts, inert markup and directly hidden anchors do not qualify. Normal apex/www redirects are allowed; redirects to another site and private-network destinations are refused.
4. Verification atomically saves the badge timestamp and inserts the project into the scheduled Redis queue. Future listings stay private.
5. `/api/launch-queue` runs every Monday at 14:00 UTC (9:00 AM Eastern in winter, 10:00 AM during daylight time). Pending, verified free projects publish once their launch date arrives. Publication atomically updates the public listing/index and removes the queue entry. Repeated runs cannot publish a stale revision again.

The verification endpoint retains its existing 35-second runtime. The shared endpoint that handles the cycle has a 120-second budget for processing due projects. `CRON_SECRET` protects scheduled runs; production was checked for the presence of the credential without reading its value. Production jobs are not invoked as test fixtures.

## Verification

Run `DIGIVATED_TEST_REDIS_PORT=<isolated-loopback-port> node --test tests/launch-workflow.test.mjs tests/project-account.test.mjs tests/launch-calendar.test.mjs` against a dedicated local Redis instance. Database 12 is cleared by the workflow fixture; never point tests at production.

The 27 focused checks pass, including the authenticated submission-handler badge action, real Redis queue persistence, pre-date privacy, scheduled publication, public projection/index, queue removal, repeat-run safety, concurrent revision protection, owner isolation and redirect validation. The production build passes.

The full suite has three pre-existing failures, reproduced on unmodified commit `edebcac`: two tests expect 15 API files but the repository now has 16; one still expects the earlier anti-framing route pattern. These are unrelated to the badge-cycle changes.

## What creators see (November 16, 2026)

The cycle is shown in plain language on the submit page (four-step guide and progress bar), on the post-save screen, and in the dashboard launch tracker: Saved → Badge verified → Launch day → Live. Each project card shows its current step and the exact next action (copy badge, paste it into the submitted URL, publish, press “Check my website”), troubleshooting tips, and the launch time in UTC and local time. Verifying a badge sends a “launch scheduled” notification. `src/scripts/launch-tracker.js` holds the shared status model.
