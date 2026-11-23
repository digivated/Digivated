# Digivated QA monitoring

This monitor is read only. It checks 29 public routes at mobile and desktop sizes, the live sitemap, visible images, same-origin assets, browser errors, horizontal overflow, key public interactions, and screenshot drift against the committed baseline. Failed Playwright tests retry in a new browser page before they can create a deduplicated GitHub issue. The existing Checkly uptime check and Sentry integration remain separate.

Run locally:

```bash
npm ci
npx playwright install chromium
npx playwright test --config=qa/playwright.config.ts
```

Set `QA_BASE_URL` to check a specific deployment. For protected previews, the workflow accepts an existing `VERCEL_AUTOMATION_BYPASS_SECRET`; a Vercel sign-in page fails the test. The monitor never prints or stores the secret. Do not turn off Vercel protection for this test.

Preview Redis configuration was corrected in #112. Issue #113 exposed a separate preview-access problem: the public membership readiness fetch used `credentials: 'omit'`, dropping Vercel's same-origin access cookie. It now uses `same-origin`; checkout validation, prices, product IDs, and payment settings are unchanged. A browser regression test verifies that readiness requests preserve the access cookie.

The monitor reads `qa/mode.json` on `main` as its switch. The previous repository-variable implementation failed with HTTP 403 because `GITHUB_TOKEN` cannot edit repository variables. The workflow is disabled while this correction is verified.

Screenshots are stored in `qa/monitor.spec.ts-snapshots/`. Only update them after checking an intentional visual change, using `npx playwright test --config=qa/playwright.config.ts --update-snapshots`. The run artifact includes the actual screenshots and is retained for seven days. The baseline stays in Git.

## Activation and controls

The `Digivated QA control` workflow accepts `STOP`, `PAUSE`, or `RESUME`. It commits the mode to `qa/mode.json` on `main` with `contents: write`. STOP and PAUSE close that gate before canceling running and queued checks with `actions: write`; RESUME reopens it. Every monitor run reads the current gate from `main`, even when testing a preview branch. No repository-variable permission or personal token is required. GitHub's workflow token cannot edit repository variables or enable/disable workflows in this repository, so those APIs are deliberately avoided. Control runs are serialized.

Keep the monitor workflow enabled in GitHub; the committed mode controls whether browser checks execute. An owner can still disable the workflow as an emergency override. Exercise STOP and RESUME in GitHub before calling scheduling operational. GitHub's hourly schedule can run late. Protected preview checks need `VERCEL_AUTOMATION_BYPASS_SECRET` or an authorized local `QA_STORAGE_STATE` session. Never commit or upload that session. Repository settings must require the preview check before it can block merges.

The monitor can create issues for reproduced failures, but it does not change application code, merge PRs, roll back deployments, or send user messages. Autonomous fixes would require a separately authorized agent runner with GitHub and Vercel permissions plus the protected-system approval gates in the request. For now, the workflow fails and leaves evidence for review. The [bug log](BUG_LOG.md) describes the issue record.

## Screenshot comparison scope

Preview deployments skip only the screenshot comparison; status codes, browser errors, overflow, assets, images and interactions are still checked. Production and the hourly schedule compare against the committed baseline. To refresh a stale baseline after an intentional redesign, run the `Digivated QA baseline refresh` workflow, review the pull request it opens, then merge.
