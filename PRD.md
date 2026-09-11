# Insurance God's Eye View — Product Requirements Document

## Product

**Working name:** ClaimTrace

**Repository:** `Naha1981/insurance-god-eye-view`

**Technology foundation:** God’s Eye View-style browser geospatial intelligence using Vite + Cesium + modular data layers.

## Problem

Motor insurers, claims administrators, loss adjusters and forensic investigators often receive fragmented evidence after a disputed incident: claimant statements, photographs, dashcam footage, telematics, police records, road geometry, weather and third-party reports. The expensive operational problem is reconstructing a defensible event timeline quickly enough to resolve the claim, detect contradictions, identify missing evidence and avoid unnecessary investigation cost.

## Product thesis

ClaimTrace is an **AI-assisted physical-world evidence reconstruction workspace**. It does not claim to visually observe a crash when no source video exists. It fuses supplied and legally accessible evidence into a time-and-location model and presents the result on a 3D geospatial investigation surface.

## MVP outcome

Given a claim with:
- incident coordinates or address
- incident date/time window
- claimant/third-party statements
- photographs and optional dashcam/CCTV video
- optional GPS/telematics data
- optional police/adjuster documents

ClaimTrace produces:
1. incident map and scene context
2. evidence timeline
3. vehicle/actor trajectories where data supports them
4. source provenance for every material finding
5. claim-version comparison: supported / contradicted / not established
6. missing-evidence checklist
7. confidence and data-quality indicators
8. investigator-ready report structure

## Non-goals

- Do not manufacture or imply actual crash footage when none exists.
- Do not make automated legal liability determinations.
- Do not scrape private CCTV or protected data without authorization.
- Do not market generated 3D scenes as recordings of real events.
- Do not rely on God’s Eye View public feeds as the sole evidence for a claim.

## Core architecture

```text
Claim / Evidence Intake
        ↓
Evidence Normalization
        ↓
Temporal + Geospatial Evidence Graph
        ↓
Reconstruction Engine
        ↓
Claim Contradiction / Consistency Analysis
        ↓
Cesium Investigation Cockpit
        ↓
Evidence Pack / Investigator Report
```

## Initial vertical

South African motor insurance claims, starting with disputed road collisions and progressively extending to prior-damage verification, storm/flood property claims and cargo/transport claims.

## Commercial wedge

Start as investigation-as-a-service for a small batch of disputed claims. Measure investigation time saved, recoverable leakage/fraud signals, missing evidence discovered and claims resolved faster before productizing enterprise workflows.

## Trust requirements

Every conclusion must retain:
- source identifier
- acquisition timestamp
- original-file hash where applicable
- transformation/processing history
- model/version identifier where AI is used
- confidence/data-quality status

Human investigator review remains the final decision point.

## Success metrics

- time to reconstruct a claim
- percentage of evidence automatically linked to timeline
- contradictions surfaced per claim
- missing evidence identified per claim
- investigator hours saved
- cycle time to claim resolution
- recoverable/disputable amount identified

## Phase 1 build

1. Cesium-based South Africa investigation globe.
2. Claim intake JSON model.
3. Synthetic collision case for development/demo.
4. Timeline panel linked to spatial entities.
5. Evidence cards with provenance.
6. Claim A vs Claim B comparison.
7. Reconstruction disclaimer and confidence indicators.
8. Clean interfaces ready for later FastAPI ingestion/API integration.
