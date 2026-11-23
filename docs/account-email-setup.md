# Account email delivery

All Digivated email is sent through **one Resend account** with `digivated.com` verified. Each sender uses its own send-only key restricted to `digivated.com`, so any one key can be rotated without touching the others.

| Sends | From | Key |
| --- | --- | --- |
| Launch, reply, follow, message, feedback and upvote alerts; project status and award emails | `Digivated <updates@digivated.com>` | Vercel `RESEND_API_KEY` + `ACCOUNT_EMAIL_FROM` |
| Sign-up codes, badge reminders and the weekly digest | `Digivated <accounts@digivated.com>` | Vercel `SIGNUP_RESEND_API_KEY` + `SIGNUP_EMAIL_FROM` |
| Supabase sign-in links, password resets and email changes | `Digivated <accounts@digivated.com>` | Supabase → Authentication → Emails → SMTP Settings (`smtp.resend.com`, port 465, user `resend`, password = its own key) |

All Vercel variables are **production** only and stored as secrets. Redeploy after changing any of them. Keep Supabase email confirmations enabled; Supabase's built-in mail service is not a production sender.

## Fallback

If Resend rejects a send from the updates key or sender (401, 403, 422, 429 or 5xx), `sendEmail` in `server/email-layout.mjs` retries once through the sign-up key and sender, with its own idempotency key, and logs `Email provider rejected send` with the status. A malformed message (400) is not retried.

## Rotating a key

1. In Resend → API Keys, create a **Sending access** key restricted to `digivated.com`. Copy the whole token; it is shown once.
2. Replace the matching Vercel variable (or the Supabase SMTP password) and redeploy.
3. Send one test (a password reset to your own account, or a footer digest sign-up) and confirm it shows as delivered in Resend → Emails.
4. Delete the old key in Resend.

## Behavior

The owner dashboard emails verified account holders when a project's status or private feedback changes. Messages link to the site; feedback text stays on the site. Saves still succeed if mail delivery fails, and the dashboard reports that the creator was not emailed. Only submissions tied to a verified account receive these alerts. Changes to a cover image, launch page or project copy alone do not send an email.

Resend's free plan allows 100 emails a day and 3,000 a month across the whole account. Activity alerts are capped at 20 a day site-wide and 6 per member.
