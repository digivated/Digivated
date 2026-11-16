# In-app notifications

Digivated's notification center lives at `/notifications`. It is available to signed-in accounts. Project approval notices appear automatically for manual approval, paid instant publication, and scheduled free launches. Optional social activity is off by default. The feed does not request browser permission or subscribe anyone to email. Members can enable it, choose replies, followers, messages, and project feedback individually, mark activity read, or clear their history.

Notifications use the existing server-side Redis store. Each record contains a fixed activity type, safe internal link, timestamp, and recipient ID. Message and feedback bodies, email addresses, and account tokens are never copied into notification records. Up to 100 recent records are retained; records expire after 90 days, and clearing history deletes the indexed records. Unread badges refresh on navigation, when a tab becomes visible, and every 90 seconds while a signed-in member is viewing the site.

`/api/notifications` verifies the Supabase account token through the existing account helper, returns only that account's records, and requires a same-origin JSON request to update settings or read state. Notification writes are best effort after the primary reply, follow, message, or feedback action succeeds, so an activity-store outage cannot interrupt those actions. Anonymous project feedback produces a generic notice only when the project belongs to an opted-in account.

Approval notices are atomically deduplicated by account, project, and saved revision, retained for 90 days, and link to the private account page. Featuring an already approved project and ordinary copy edits do not repeat the approval notice. Existing verified-account project emails remain separate.

## Defaults (November 16, 2026)

Social activity alerts (replies, followers, messages, project feedback) are on by default for members who have never changed the setting. Anyone who saved a choice keeps it, and an explicit opt-out is always respected. Weekly-email announcements still require an explicit, saved opt-in (`server/return-emails.mjs` reads the stored preference, not the default).

## Launch-scheduled notice

When `verifyProjectBadge` saves a newly verified badge and the launch date is still in the future, `notifyLaunchScheduled` writes one `scheduled` notice per project, deduplicated with the same atomic marker script as approvals. It links to `/account#project-<id>`, where the dashboard shows the launch tracker. If verification publishes the project immediately because the launch date is due, the approval notice is sent instead.

## Feed layout

The page leads with the feed (All and Unread filter, New and Earlier groups, Mark all read, Clear history), then the member's live projects, then settings. The header account menu shows unread counts for notifications and the inbox.
