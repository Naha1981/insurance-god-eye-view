# ClaimTrace — Insurance Evidence Reconstruction

**ClaimTrace** is an insurance physical-world evidence reconstruction cockpit.

It uses a God’s Eye View-style geospatial architecture — browser-based Cesium globe, modular spatial layers and time-aware investigation — but the product is purpose-built for insurance claims.

## What it solves

Claims teams often have evidence scattered across statements, photos, video, GPS/telematics, reports, weather and scene context. ClaimTrace is designed to assemble that evidence into a defensible timeline and spatial reconstruction so investigators can resolve disputed claims faster.

## Current working slice

The repository now contains:

- Cesium-based South African reconstruction scene
- deterministic evidence normalization and claim-consistency logic
- browser evidence hashing
- FastAPI evidence API
- persistent SQLite for local development
- Postgres-compatible persistence for Render deployments
- server-side SHA-256 verification and duplicate detection
- persisted original evidence bytes for pilot deployments
- tenant-scoped authenticated sessions
- audit events for authentication, case creation and evidence access
- API-backed investigator mode
- Render Blueprint for frontend + backend + Postgres
- deterministic unit, browser, backend and Windows CI coverage

The visible collision scenario remains **synthetic** and exists only for development and demonstration. The product never presents a synthetic reconstruction as actual crash footage.

## Deployment architecture

For this project the deployment target is the same pattern used successfully for the previous application:

```text
Render Static Site
        │
        │ HTTPS / Bearer session
        ▼
Render FastAPI Web Service
        │
        ▼
Render Postgres
```

The repository contains [`render.yaml`](./render.yaml) so the three resources can be provisioned as one Blueprint. Render documents Static Sites as CDN-backed frontend hosting and FastAPI as a supported Web Service runtime. urlRender Static Sites documentationhttps://render.com/docs/static-sites urlRender FastAPI deployment documentationhttps://render.com/docs/deploy-fastapi

For pilot validation, the Blueprint uses Render's free instances. Render documents those free services as suitable for testing/preview rather than production; free web-service filesystems are ephemeral, so ClaimTrace stores pilot evidence bytes in Postgres rather than relying on local disk. A production insurer deployment should move original evidence media to dedicated immutable object storage and upgrade the database/compute tier. urlRender free deployment limitationshttps://render.com/docs/free

## Run locally

Requires Node.js 24.14+ or Node.js 26.x.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

For the backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Local development defaults to SQLite. Set `DATABASE_URL` to a PostgreSQL connection string to exercise the deployment database path.

## Product direction

```text
Evidence intake
    ↓
Evidence normalization
    ↓
Temporal + geospatial evidence graph
    ↓
Event reconstruction
    ↓
Claim consistency analysis
    ↓
Investigator cockpit
    ↓
Evidence / investigation report
```

## Evidence integrity rule

ClaimTrace must never make synthetic 3D reconstruction look like actual crash footage. When a real source video exists and is legally supplied, the product can align the original recording with the reconstruction. Without source footage, the visualization remains an inference/model, not a recording.

Every material finding must remain traceable to source evidence or clearly marked as an inference, and the investigator remains the final decision maker.

## Roadmap

See [`PRD.md`](./PRD.md) and [`plan.md`](./plan.md).
