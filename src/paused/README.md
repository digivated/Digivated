# Temporarily paused pages

News was paused at the owner's request on November 8, 2026. `news.astro` retains the original page and its existing guide data remains untouched.

To restore it, move `news.astro` back to `src/pages/`, remove its temporary redirects from `astro.config.mjs` and `vercel.json`, and restore its navigation and search entries. The pause does not disable Resources or Carousels.
