# Digivated QA monitoring

This monitor is read only. It checks 29 public routes at mobile and desktop sizes, the live sitemap, visible images, same-origin assets, browser errors, horizontal overflow, key public interactions, and screenshot drift against the committed baseline. Failed Playwright tests retry in a new browser page before they can create a deduplicated GitHub issue. The existing Checkly uptime check and Sentry integration remain separate.

Run locally:

```bash
npm ci
npx playwright install chromium
npx playwright test --config=qa/playwright.config.ts
```

Set `QA_BASE_URL` to check a specific deployment. For protected previews, the workflow accepts an existing `VERCEL_AUTOMATION_BYPASS_SECRET`; a Vercel sign-in page fails the test. The monitor never prints or stores the secret. Do not turn off Vercel protection for this test.

The first protected-preview run for [PR #111](https://github.com/digivated/Digivated/pull/111) exposed [issue #112](https://github.com/digivated/Digivated/issues/112): the preview project API returns an empty directory, while production returns public listings. Preview checks must stay blocking until this is resolved or a reviewed, safe preview fixture is provided.

Screenshots are stored in `qa/monitor.spec.ts-snapshots/`. Only update them after checking an intentional visual change, using `npx playwright test --config=qa/playwright.config.ts --update-snapshots`. The run artifact includes the actual screenshots and is retained for seven days. The baseline stays in Git.

## Activation and controls

`qa-monitor.yml` is gated by the GitHub repository variable `DIGIVATED_QA_MODE`. It stays inactive until that variable is `ACTIVE`. The `Digivated QA control` workflow accepts `STOP`, `PAUSE`, or `RESUME`. STOP and PAUSE disable the monitor workflow and cancel queued or running runs. RESUME sets the gate to `ACTIVE` and enables it. The control workflow stays available when the monitor is disabled. The control script verifies the resulting workflow state and fails if GitHub rejects the operation.

This gate must be activated and the live STOP path verified in GitHub before calling the scheduled system operational. GitHub's hourly schedule can run late; it does not guarantee execution at an exact minute. The preview check requires authorized access to protected Vercel previews. Repository settings must require the preview check before it can block merges. Those settings and the bypass secret are outside this code change.

The monitor can create issues for reproduced failures, but it does not change application code, merge PRs, roll back deployments, or send user messages. Autonomous fixes would require a separately authorized agent runner with GitHub and Vercel permissions plus the protected-system approval gates in the request. For now, the workflow fails and leaves evidence for review. The [bug log](BUG_LOG.md) describes the issue record.
