# ClaimTrace Automated Quality Loop

ClaimTrace is designed so the founder should not need to manually test every change.

## What runs automatically

1. **Static product checks** — verifies required safety/disclaimer/product elements remain present.
2. **Build check** — Vite production build must succeed.
3. **Browser smoke** — launches the real app in Chromium with Puppeteer and checks:
   - Cesium canvas renders.
   - case ID appears.
   - evidence timeline renders.
   - claim tests render.
   - timeline interaction works.
   - Fit Scene control responds.
   - no browser console errors occur.
   - no uncaveated wording claims synthetic footage is actual footage.
4. **Cross-version CI** — Node 24 and Node 26 run in parallel.
5. **Windows smoke** — verifies the app starts and works on Windows, the target development environment.
6. **Failure evidence** — browser screenshots and failure text are uploaded as CI artifacts.

## Autonomous-testing principle

Every new feature should add a machine-checkable acceptance rule before it is considered complete.

For later AI-powered investigation features, add a second evaluator layer that checks:

- every finding has source provenance;
- unsupported conclusions are marked `NOT ESTABLISHED`;
- synthetic reconstructions are never represented as original footage;
- confidence falls when evidence conflicts;
- the model cannot silently invent a sensor/source;
- reports contain missing-evidence and uncertainty sections.

AI evaluation should be an additional gate, not a replacement for deterministic tests.

## Founder workflow

The intended workflow is:

**Change code → push → GitHub Actions → build → unit checks → real browser smoke → artifact capture → green/red result.**

Manual testing should be reserved for product acceptance, not routine regression checking.
