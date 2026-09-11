# ClaimTrace Build Plan

## Phase 0 — Foundation
- [x] Create empty product repository
- [x] Add PRD
- [ ] Add application shell
- [ ] Add Cesium globe and South Africa default camera
- [ ] Add synthetic incident dataset
- [ ] Add evidence/timeline data model
- [ ] Add investigation UI

## Phase 1 — Working vertical slice
- [ ] Render a synthetic collision in a real South African road context
- [ ] Show Vehicle A/B trajectories
- [ ] Show incident point and timeline events
- [ ] Switch between map / terrain / evidence views
- [ ] Surface evidence provenance and confidence
- [ ] Compare Claim A and Claim B
- [ ] Clearly label reconstruction vs source footage

## Phase 2 — Real evidence ingestion
- [ ] Dashcam/video metadata intake
- [ ] Photograph intake and EXIF extraction
- [ ] GPS/telematics CSV/JSON intake
- [ ] PDF/police-report intake
- [ ] Evidence hashing and immutable provenance records
- [ ] Weather and road-context adapters

## Phase 3 — Reconstruction engine
- [ ] Normalize timestamps to UTC + local display timezone
- [ ] Geospatial coordinate normalization
- [ ] Trajectory interpolation with uncertainty
- [ ] Event correlation
- [ ] Claim consistency checks
- [ ] Missing evidence detection

## Phase 4 — Commercial pilot
- [ ] Investigator case workspace
- [ ] Exportable investigation report
- [ ] Secure case sharing
- [ ] Audit log
- [ ] Tenant isolation
- [ ] POPIA/privacy review

## Phase 5 — Insurance platform
- [ ] Claims-system API
- [ ] FNOL evidence intake
- [ ] Prior-damage comparison
- [ ] Fraud signals
- [ ] CAT/property event reconstruction
- [ ] Portfolio-level claims intelligence

## Engineering rules

- Do not clone God’s Eye View branding or pretend this is the original project.
- Reuse compatible open-source architectural patterns and dependencies only where licensing permits.
- Keep provider/data licenses explicit in `DATA_SOURCES.md`.
- Never present synthetic reconstruction as actual event footage.
- Every material finding must be traceable to source evidence or clearly marked as an inference.
- Prefer deterministic rules before probabilistic AI for evidence calculations.
