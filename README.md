# ClaimTrace — Insurance God's Eye View

**ClaimTrace** is an insurance physical-world evidence reconstruction cockpit.

It uses a God’s Eye View-style geospatial architecture — browser-based Cesium globe, modular spatial layers and time-aware investigation — but the product is purpose-built for insurance claims.

## What it solves

Claims teams often have evidence scattered across statements, photos, video, GPS/telematics, reports, weather and scene context. ClaimTrace is designed to assemble that evidence into a defensible timeline and spatial reconstruction so investigators can resolve disputed claims faster.

## Current prototype

The first vertical slice includes:

- Cesium globe centered on a South African investigation scene
- synthetic Vehicle A / Vehicle B trajectories
- estimated impact point
- evidence timeline
- confidence indicators
- Claim A vs Claim B consistency testing
- explicit reconstruction-vs-footage disclosure
- dark enterprise investigation cockpit

The current scenario is synthetic and exists only for software development and demonstration.

## Technology

- Vite
- JavaScript ES modules
- CesiumJS
- `vite-plugin-cesium`

The architecture is intentionally close to the technology style of [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view), whose repository documents a modular live geospatial intelligence application built with Cesium and Vite. We are building an independent insurance product in this repository. fileciteturn4file0

## Run locally

Requires Node.js 24.14+ (or Node.js 26.x), matching the technology baseline used by the upstream project. fileciteturn5file0

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

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

## Important evidence rule

ClaimTrace must never make synthetic 3D reconstruction look like actual crash footage. When a real source video exists and is legally supplied, the product can align the original recording with the reconstruction. Without source footage, the visualization remains an inference/model, not a recording.

## Roadmap

See [`PRD.md`](./PRD.md) and [`plan.md`](./plan.md).
