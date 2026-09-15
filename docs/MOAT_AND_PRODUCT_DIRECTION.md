# NahaLabs Claims & Recovery Intelligence — Moat and Product Direction

## Strategic position

The repository is no longer positioned as a generic "God's Eye View" visualization. The 3D geospatial cockpit is an investigation surface inside a broader claims evidence and recovery-intelligence product.

**Product:** NahaLabs Claims & Recovery Intelligence

**Core commercial question:**

> What happened, what can we prove, what value is recoverable, and what should the insurer do next?

## What remains infrastructure

- Cesium 3D geospatial visualization
- FastAPI evidence service
- evidence hashing and provenance
- telemetry/GPS ingestion
- tenant-scoped authentication
- audit events
- PostgreSQL-compatible persistence
- investigator report generation

These are enabling technologies, not the moat by themselves.

## What is deliberately not the product moat

- generic aircraft/ship/satellite tracking
- a "spy satellite" visual effect
- generic 3D globe functionality
- generic LLM summarisation
- standalone photo damage estimation
- generic fraud scoring
- a replacement core claims-management system

## Moat architecture

```text
Claim
  ↓
Evidence Graph
  ↓
Temporal + Geospatial Reconstruction
  ↓
Consistency / Contradiction / Missing Evidence
  ↓
Recovery Intelligence
  ↓
Expected Net Recovery
  ↓
Action Routing
  ├── Recover
  ├── Human Review
  ├── Request Evidence
  ├── SIU
  └── Close
  ↓
Actual Outcome
  ↓
Proprietary Outcome Dataset / Learning Flywheel
```

## First vertical slice delivered in this repository

The recovery engine is deterministic and explainable. It calculates:

`expected gross recovery = recoverable quantum × liability confidence × recovery probability`

`expected net recovery = expected gross recovery − investigation cost − legal cost`

It then routes the case based on evidence sufficiency, suspicious indicators and economic viability.

This is decision support, not legal liability adjudication. Human investigators remain the final decision makers.

## Long-term defensibility

The strategic moat grows from repeated insurer outcomes:

`evidence → model/rules → investigator decision → recovery action → actual recovery → calibration`

The proprietary asset is the accumulated South African claim/evidence/recovery outcome dataset and the insurer-specific decision intelligence derived from it.

## Next engineering milestones

1. Persist recovery assessments and decision history.
2. Build the Claim Evidence Graph data model.
3. Automatically derive recovery inputs from registered evidence and telemetry.
4. Add claim-level contradictions and missing-evidence scoring.
5. Add recovery opportunity queues and portfolio-level dashboards.
6. Add governed integrations for insurer claims systems and authorised third-party data providers.
7. Calibrate probabilities from real closed-claim outcomes.
