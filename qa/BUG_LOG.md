# Digivated QA bug log

The [GitHub issues titled `[QA …]`](https://github.com/digivated/Digivated/issues?q=is%3Aissue+%22%5BQA%22) are the permanent, deduplicated record for confirmed monitor failures. Each issue links to the workflow run and its screenshots. A failure must occur twice in isolated browser runs before an issue is created.

For each fix, record the root cause, regression test, pull request, deployment, and production verification in that issue. Reopen and escalate a returning issue to P1. After a feature fails three times, add a structural improvement proposal.

## Baseline · 2026-11-15

- 95 public sitemap URLs returned HTTP 200.
- 29 main routes passed at 390px and 1440px, with no page errors, failed site assets, horizontal overflow, or usability over four seconds.
- Public discovery, rankings, news, and creator content loaded. No confirmed P0 or P1 bug was found in this baseline pass.
- Screenshots in `qa/monitor.spec.ts-snapshots/` are the known-good visual baseline. Update them only with a reviewed visual change.

No account changes, purchases, submissions, votes, or real emails are part of these checks.
