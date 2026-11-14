# Free project badge and launch cycle

1. A signed-in creator saves a complete free project. The response includes its badge HTML and a Monday UTC launch date, 7–14 days away.
2. The creator adds the badge as HTML on the saved public project URL, publishes that page, then chooses Verify website badge in Your Projects.
3. Verification checks project ownership and the exact listing link/project ID. Comments, scripts, inert markup and directly hidden anchors do not qualify. Normal apex/www redirects are allowed; redirects to another site and private-network destinations are refused.
4. Verification atomically saves the badge timestamp and inserts the project into the scheduled Redis queue. Future listings stay private.
5. `/api/launch-queue` runs daily at 00:10 UTC. Pending, verified free projects publish once their launch date arrives. Publication atomically updates the public listing/index and removes the queue entry. Repeated runs cannot publish a stale revision again.

The verification endpoint retains its existing 35-second runtime. The shared endpoint that handles the cycle has a 120-second budget for processing due projects. `CRON_SECRET` protects scheduled runs; production was checked for the presence of the credential without reading its value. Production jobs are not invoked as test fixtures.

## Verification

Run `DIGIVATED_TEST_REDIS_PORT=<isolated-loopback-port> node --test tests/launch-workflow.test.mjs tests/project-account.test.mjs tests/launch-calendar.test.mjs` against a dedicated local Redis instance. Database 12 is cleared by the workflow fixture; never point tests at production.

The 27 focused checks pass, including the authenticated submission-handler badge action, real Redis queue persistence, pre-date privacy, scheduled publication, public projection/index, queue removal, repeat-run safety, concurrent revision protection, owner isolation and redirect validation. The production build passes.

The full suite has three pre-existing failures, reproduced on unmodified commit `edebcac`: two tests expect 15 API files but the repository now has 16; one still expects the earlier anti-framing route pattern. These are unrelated to the badge-cycle changes.
