# Digivated analytics workspace

Use one GA4 property for `digivated.com`. The production site sends page views and the product events below. Keep the reporting timezone consistent with the property timezone, and use a 28-day default comparison with the preceding 28 days. Exclude internal traffic in GA4 before judging acquisition or conversion trends.

## Reports Library

Create four collections in this order. Each report should show its date range, comparison period, and a plain-language title.

| Collection | Summary cards | Primary detail |
| --- | --- | --- |
| Audience | Active users, new users, sessions, engagement rate | Landing page; session source/medium; device category |
| Projects | Project opens, external site visits, feedback opens, submissions | Event count by project category; project directory landing page |
| Membership | Checkout clicks, verified access | `/membership` landing page, source/medium, checkout-click trend |
| News & creators | News category selections, creator posts, replies | News and creator page engagement; event count by category and media type |

Add the standard **Pages and screens**, **Landing page**, **Traffic acquisition**, and **User acquisition** reports to the relevant collections. Do not add custom cards that merely repeat the same page-view total. For membership, label `membership_checkout` as **checkout clicks**, not purchases; `membership_verified` is an existing purchase being verified and is not revenue.

## Event definitions

| Event | Trigger | Allowed detail |
| --- | --- | --- |
| `project_open` | Reader opens a project from the directory | `project_category` |
| `project_site_visit` | Reader chooses Visit website in a project view | `project_category` |
| `project_feedback_open` | Reader opens project feedback | `project_category` |
| `project_submit` | A project submission succeeds | `project_category` |
| `membership_checkout` | Reader opens the Gumroad checkout link | none |
| `membership_verified` | Site confirms a member's existing purchase | none |
| `news_category_select` | Reader selects a News category | `news_category` |
| `creator_post_publish` | A new creator post succeeds | `media_type` |
| `creator_reply_publish` | A creator reply succeeds | none |

Register event-scoped custom dimensions named **Project category** (`project_category`), **News category** (`news_category`), and **Media type** (`media_type`) in GA4 Admin → Custom definitions before using them as report breakdowns. GA4 does not backfill custom-dimension values. No event sends a search query, email, license, user ID, post ID, or destination URL. Leave purchase and revenue metrics out until Gumroad's verified server notification can supply actual transaction data.

## Verification after deployment

Use GA4 DebugView or Realtime on the production domain to confirm one event per successful action. Verify that checkout clicks are counted only when the verified Gumroad link is available and that membership verification does not count as a new purchase. Compare project-open events against the site’s project-view counters for direction only: the counters and GA4 use different collection rules, so exact totals need not match.

The existing service account has read-only reporting scope in Digivated's visitor counter. It cannot configure the GA4 Reports Library from this repository. A GA4 property Editor must create or edit those collections and custom dimensions in the Google Analytics interface.
