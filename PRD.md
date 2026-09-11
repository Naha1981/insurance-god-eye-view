# Insurance God's Eye View — Product Requirements Document

## Product

**Working name:** ClaimTrace

**Repository:** `Naha1981/insurance-god-eye-view`

**Technology foundation:** God's Eye View-style browser geospatial intelligence using Vite + Cesium + modular data layers, with a FastAPI evidence service for pilot deployments.

## Problem

Motor insurers, claims administrators, loss adjusters and forensic investigators receive fragmented evidence after disputed incidents: claimant statements, photographs, dashcam footage, telematics, police records, road geometry, weather and third-party reports. The operational problem is reconstructing a defensible event timeline quickly, surfacing contradictions and missing evidence, and preserving provenance while keeping a human investigator in control.

## Product thesis

ClaimTrace is an **AI-assisted physical-world evidence reconstruction workspace**. It does not claim to visually observe a crash when no source video exists. It fuses supplied and legally accessible evidence into a time-and-location model and presents the result on a 3D geospatial investigation surface.

## MVP outcome

Given a claim with incident coordinates or address, incident date/time window, statements, photographs, optional dashcam/CCTV video, optional GPS/telematics data, and optional police/adjuster documents, ClaimTrace produces:

1. incident map and scene context
2. evidence timeline
3. vehicle/actor trajectories where data supports them
4. source provenance for every material finding
5. claim-version comparison: supported / contradicted / not established
6. missing-evidence checklist
7. confidence and data-quality indicators
8. investigator-ready report structure

## Evidence intake contract

Every registered evidence item must retain a stable ID, case ID, type, source, source reference, SHA-256 where the original artifact is available, capture/ingestion timestamps, media metadata and custody events. Original bytes must be preserved outside the browser prototype in immutable object storage in production.

## Non-goals

- Do not manufacture or imply actual crash footage when none exists.
- Do not make automated legal liability determinations.
- Do not scrape private CCTV or protected data without authorization.
- Do not market generated 3D scenes as recordings of real events.
- Do not rely on public geospatial feeds as sole evidence for a claim.

## Core architecture

```text
Claim / Evidence Intake
        ↓
Immutable Evidence Identity + Hash
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

## Pilot API

FastAPI service owns case and evidence registry contracts. Storage is intentionally replaceable in the first pilot so the workflow can be demonstrated without prematurely coupling the product to a particular database or object store.

## Initial vertical

South African motor insurance claims, starting with disputed road collisions and progressively extending to prior-damage verification, storm/flood property claims and cargo/transport claims.

## Commercial wedge

Start as investigation-as-a-service for a small batch of disputed claims. Measure investigation time saved, recoverable leakage/fraud signals, missing evidence discovered and claims resolved faster before productizing enterprise workflows.

## Trust requirements

Every conclusion must retain source identifier, acquisition timestamp, original-file hash where applicable, transformation/processing history, model/version identifier where AI is used, and confidence/data-quality status. Human investigator review remains the final decision point.

## Success metrics

- time to reconstruct a claim
- percentage of evidence automatically linked to timeline
- contradictions surfaced per claim
- missing evidence identified per claim
- investigator hours saved
- cycle time to claim resolution
- recoverable/disputable amount identified

## Current build

- Cesium-based South Africa investigation globe
- deterministic evidence correlation and claim assessment engine
- provenance-aware evidence register
- browser evidence intake with SHA-256 hashing
- immutable evidence-record contract and custody events
- FastAPI case/evidence service contract
- autonomous browser and unit acceptance tests
