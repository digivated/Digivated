# Email templates

All automatic emails share one look from `server/email-layout.mjs` (dark,
`[ DIGIVATED / … ]` label, one button, plain-text version).

The `supabase-*.html` files are the same look for Supabase Auth's own emails.
Paste each into Supabase → Authentication → Email Templates:

| File | Supabase template |
| --- | --- |
| `supabase-confirm-signup.html` | Confirm signup |
| `supabase-magic-link.html` | Magic Link |
| `supabase-reset-password.html` | Reset Password |
| `supabase-change-email.html` | Change Email Address |

Regenerate them after changing the layout with `node scripts/render-auth-emails.mjs`.

`digivated-builder-introduction.html` is a one-off outreach email.
