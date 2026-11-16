# Continue with Google

The login page shows **Continue with Google** only when the Vercel environment variable `COMMUNITY_GOOGLE_ENABLED` is `true`. Email and password accounts keep working either way.

## Turning it on

1. In Google Cloud Console, create an OAuth client (type: Web application). Add the authorized redirect URI shown in Supabase under Authentication → Providers → Google (it ends in `/auth/v1/callback`).
2. In Supabase (Digivated project), enable the Google provider and paste the client ID and secret.
3. In Supabase Authentication → URL Configuration, add `https://digivated.com/login` to Redirect URLs.
4. In Vercel (project `digivated`, Production), set `COMMUNITY_GOOGLE_ENABLED=true` and redeploy.

## How accounts match

Supabase links a Google sign-in to an existing account with the same verified email, so existing members keep their projects. The server accepts an OAuth session only when the user has a Google identity whose verified email matches the account email; such sessions count as mailbox-verified (like an emailed link). See `verifiedAccount` in `server/project-account.mjs` and its test in `tests/project-account.test.mjs`.
