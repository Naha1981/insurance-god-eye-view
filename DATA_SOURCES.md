# Data Sources and Evidence Policy

ClaimTrace will treat data-source licensing and evidence provenance as first-class product requirements.

## Source classes

### Customer-supplied evidence

- dashcam video
- CCTV/video supplied under authorization
- telematics/GPS exports
- photographs
- claims documents
- police/incident reports

These become case evidence and must retain source metadata, acquisition time and integrity hashes where technically possible.

### Public geospatial context

Potential sources include OpenStreetMap-derived road geometry, public weather observations, public satellite imagery and other openly licensed contextual datasets. Each adapter must record its license and permitted commercial use before production use.

### Third-party live feeds

Flight, vessel, camera, map, imagery and other feeds may impose non-commercial, attribution, rate-limit, caching or redistribution restrictions. A source is not commercially approved merely because its data is technically accessible.

## Evidence classification

Every dataset or file should be classified as:

- **SOURCE** — direct evidence supplied or lawfully obtained.
- **CONTEXT** — environmental/geospatial information surrounding the event.
- **DERIVED** — calculated from one or more sources.
- **INFERENCE** — model-produced interpretation.
- **UNVERIFIED** — requires investigator review.

## Production rule

A material claim finding must expose its supporting evidence and classification. Missing data should produce an explicit unknown state rather than a fabricated answer.

## Upstream project note

God’s Eye View itself documents a broad range of public/open-source feeds and warns that third-party datasets can have separate licenses. ClaimTrace therefore does not assume that all upstream data connectors are commercially usable. Review the upstream source-license inventory before importing any connector into a paid deployment.
