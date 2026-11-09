# Digivated

Digivated is a home for independent projects and the people building them. Visitors can discover projects and AI tools, give feedback, explore rankings, and read sourced news. Creators can submit projects, maintain a profile, post updates, and message one another. The public site is [digivated.com](https://digivated.com).

## Project structure

| Path | Purpose |
| --- | --- |
| `src/pages`, `src/components`, `src/styles`, `src/scripts` | Astro pages and browser UI |
| `api`, `server` | Vercel functions and server-side logic |
| `src/data` | Public content and navigation definitions |
| `supabase` | Database migrations and Edge Functions |
| `tests` | API, policy, and browser checks |
| `docs` | Feature and operations guides, including dated historical notes in `docs/archive` |
| `marketing-exports`, `media` | Editable marketing source and exported assets |

The site is built as static Astro pages with Vercel functions for account, project, membership, news, and administrative flows. Upstash Redis stores site content and activity. Supabase supports account identity and media storage. Gumroad handles the one-time Digivated Membership checkout. Access checks happen on the server.

## Local development

Use Node.js 24.

```sh
npm ci
npm run dev
```

The Astro dev server serves the pages; Vercel functions need the Vercel runtime or a dedicated test fixture. Do not put production secrets in browser code or commit `.env` files.

```sh
npm run build
npm test
npm run check:syntax
```

`npm run verify:content` is an additional private-content check that requires the ignored owner key. It is not part of ordinary local setup.

## Operations

- [Admin dashboard](docs/DIGIVATED-ADMIN.md): submissions, publishing, and owner workflows.
- [News](docs/NEWS.md): source rules, automatic publication, corrections, and member access.
- [Account email setup](docs/account-email-setup.md): transactional email configuration.
- [Monitoring](docs/monitoring.md): deployment and error monitoring.
- [Latest operations audit](docs/operations-audit-2026-11-09.md): verified platform state and follow-up findings.
- [Gumroad checkout history](gumroad/README.md): the one-time membership remap and storefront notes.

`main` is connected to the Digivated Vercel project. Check the build and production URL after changes. Preserve the existing Gumroad, Redis, and Supabase configuration when editing deployment settings. Historical launch notes are retained in `docs/archive` and other dated documents for reference; they are not current setup instructions.
