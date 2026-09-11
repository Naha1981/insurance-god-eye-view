# ClaimTrace Build Plan

## Phase 0 — Foundation
- [x] Create product repository
- [x] Add PRD
- [x] Add application shell
- [x] Add Cesium globe and South Africa default scene
- [x] Add synthetic incident dataset
- [x] Add evidence/timeline data model
- [x] Add investigation UI

## Phase 1 — Working vertical slice
- [x] Render a synthetic collision scenario in a South African scene
- [x] Show Vehicle A/B trajectories
- [x] Show incident point and timeline events
- [x] Surface evidence provenance and confidence
- [x] Compare claim statements with supported / contradicted / not-established states
- [x] Clearly label reconstruction vs source footage
- [x] Add deterministic unit and browser acceptance tests

## Phase 2 — Real evidence ingestion
- [x] Evidence hashing and immutable provenance-record contract
- [x] Browser evidence intake for pilot/demo workflow
- [x] Server-side SHA-256 verification and duplicate detection
- [x] Database-backed pilot case/evidence registry
- [x] Server-side multipart evidence upload with persisted original bytes for pilot deployments
- [x] Frontend API adapter for case/evidence operations
- [x] Authenticated API session support
- [x] Tenant-scoped case/evidence access
- [x] Audit events for authentication, case creation and evidence access
- [x] Render backend/static-site deployment blueprint
- [ ] Dashcam/video metadata intake
- [ ] Photograph EXIF extraction
- [~] GPS/telematics JSON ingestion and normalized persistence — implemented, CI verification pending
- [ ] GPS/telematics CSV intake
- [ ] PDF/police-report intake
- [ ] Weather and road-context adapters
- [ ] Dedicated immutable object storage for production evidence media

## Phase 3 — Reconstruction engine
- [x] Deterministic evidence normalization
- [x] Event correlation
- [x] Claim consistency checks
- [x] Missing evidence detection
- [~] Normalize telemetry timestamps to UTC + local display timezone — implemented, CI verification pending
- [~] Geospatial coordinate normalization — implemented, CI verification pending
- [~] Derive telemetry segment distance and speed — implemented, CI verification pending
- [~] Trajectory segment reconstruction with quality and uncertainty estimates — implemented, CI verification pending
- [~] Gap interpolation primitives with explicit interpolation flags — implemented, CI verification pending
- [~] Integrate trajectory assessment into case engine — implemented, CI verification pending
- [ ] Confidence/data-quality model backed by source evidence

## Phase 4 — Commercial pilot
- [x] Investigator evidence register
- [x] FastAPI case/evidence service
- [x] API-backed investigator workspace mode
- [~] Tenant-scoped case listing and case switching — implemented, CI verification pending
- [~] Exportable investigator HTML report — implemented, CI verification pending
- [ ] Secure case sharing
- [x] Audit log
- [x] Tenant isolation
- [ ] POPIA/privacy review
- [ ] Dedicated immutable object storage
- [ ] Pilot dataset and acceptance criteria
- [ ] Production deployment verification on Render

## Phase 5 — Insurance platform
- [ ] Claims-system API
- [ ] FNOL evidence intake
- [ ] Prior-damage comparison
- [ ] Fraud signals
- [ ] CAT/property event reconstruction
- [ ] Portfolio-level claims intelligence

## Engineering rules

- Do not clone God's Eye View branding or pretend this is the original project.
- Reuse compatible open-source architectural patterns and dependencies only where licensing permits.
- Keep provider/data licenses explicit in `DATA_SOURCES.md`.
- Never present synthetic reconstruction as actual event footage.
- Every material finding must be traceable to source evidence or clearly marked as an inference.
- Prefer deterministic rules before probabilistic AI for evidence calculations.
- Keep the investigation workspace functional when WebGL/Cesium is unavailable.
- Never expose filesystem paths or secrets to browser clients.
- Authenticate API access in deployed mode and scope all case/evidence queries to a tenant.
- Treat Postgres-stored evidence bytes as pilot storage only; production media belongs in dedicated immutable object storage.
- Do not mark a feature complete until code exists and CI exercises it.
