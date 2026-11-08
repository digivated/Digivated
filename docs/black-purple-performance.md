# Black and purple performance check

November 8, 2026. Chromium on the same local Astro development server, phone viewport 390 × 900, 4× CPU slowdown, 57 mocked projects using the same local SVG image, fonts loaded. Each sample covers 3 seconds of animation frames after settling; no input. Both versions use the same catalogue and test script. These are controlled lab samples, not field Core Web Vitals or a guarantee for every device.

| Sample | Before | After |
| --- | ---: | ---: |
| Hero view: p95 frame interval | 66.7 ms | 16.7 ms |
| Reel view: p95 frame interval | 66.7 ms | 16.8 ms |
| Hero view: main-thread task duration | 3143.0 ms | 677.2 ms |
| Reel view: main-thread task duration | 3063.1 ms | 841.9 ms |
| Active CSS/Web Animations in both views | 114 | 0 |
| Elements with a backdrop filter | 150 | 0 |
| Hero view: long tasks | 16 | 0 |
| Reel view: long tasks | 26 | 2 |

The retained reel uses a requestAnimationFrame scroll loop with existing pause, keyboard, touch, reduced-motion, visibility and intersection controls. The animation count above excludes that loop. Results target the rendering cost of decorative effects, not API latency or external image downloads.

Regression coverage includes public navigation, search, featured projects, all-page reel pagination, pause/resume, reduced motion, native dialog focus, no-JavaScript content, account recovery, toolkit builder and mocked owner review editor.
