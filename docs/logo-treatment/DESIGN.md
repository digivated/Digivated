# Project logo treatment

Reference: https://www.whatdidyoumake.com/ (Firecrawl screenshot and rendered HTML inspected on 2026-11-28). Scope: project logo tiles only.

The reference's launch rows use a 44px square (`size-11`), 12px rounded corners (`rounded-xl`), white fill, and a subtle black outline (`ring-black/[0.08]`). Its images use `object-cover`; most supplied images are already square icons. The screenshot confirms a consistent tile size and alignment across the board.

Digivated uses the same 44px row size and 12px corner radius. The shared logo component uses white fill, a 1px #10182814 outline, centered images, and `object-fit: contain` so an official mark cannot be cropped. Smaller related/rising contexts retain their existing tile dimensions. Missing images use the same tile with legible initials. Brand colors remain in the original asset.

Reviewed replacements are original PNG, SVG or ICO files from the maker's own site, stored under content-hashed filenames. SVGs must contain no scripts, event handlers, embedded HTML, external resources or imports. Source URLs and the fingerprints of the reviewed uploads are in `server/project-logo-overrides.json`. A replacement applies only while the exact original upload is current, protecting future maker updates. Raw image endpoints also use an image-content version in their URLs to prevent stale logos after an update.

The complete visible inventory at review time contains 76 public projects and three upcoming launches. Twenty-one assets were replaced; five previously empty logo presentations now have official icons. Focus City, agent-atlas and SkillLens AI have no verified project-specific icon available in their current public sources and retain consistent initials. A GitHub service favicon is not a substitute for a project's own identity.

This change does not alter launch dates, publication status, ranking, voting, links or account data. Validation covers all 79 visible entries, mobile/desktop layout, image failures, versioned URLs, original-upload protection, and the existing functional tests.
