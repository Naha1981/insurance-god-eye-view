import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCaseAssessment, buildEvidenceQualityAssessment, buildTrajectoryAssessment, correlateEvents, findMissingEvidence, normalizeEvidence, provenanceScore } from '../src/evidence/engine.js';
import { evidenceQualityAssessment, trajectoryQualityAssessment } from '../src/evidence/quality.js';
import { appendCustodyEvent, buildEvidenceManifest, createEvidenceRecord, hashBytes, validateEvidenceRecord } from '../src/evidence/intake.js';
import { normalizeTelemetry, enrichTelemetry } from '../src/evidence/geospatial.js';
import { buildTrajectorySegments, summarizeTrajectory, interpolateTrajectory, interpolatePosition } from '../src/evidence/trajectory.js';
import { buildFrameEvidenceIndex, frameTimeSeconds, frameTimestamp, normalizeVideoSync, timelineFrameIndex } from '../src/evidence/video-sync.js';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const apiMode = await readFile(new URL('../src/evidence/api-mode.js', import.meta.url), 'utf8');
const apiClient = await readFile(new URL('../src/evidence/api.js', import.meta.url), 'utf8');
const frameCapture = await readFile(new URL('../src/evidence/frame-capture.js', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const videoSync = await readFile(new URL('../src/evidence/video-sync.js', import.meta.url), 'utf8');
const qualitySource = await readFile(new URL('../src/evidence/quality.js', import.meta.url), 'utf8');
const telemetryImport = await readFile(new URL('../backend/app/telemetry_import.py', import.meta.url), 'utf8');
const telemetryRoutes = await readFile(new URL('../backend/app/telemetry_routes.py', import.meta.url), 'utf8');
const frameRoutes = await readFile(new URL('../backend/app/frame_routes.py', import.meta.url), 'utf8');
const frameArtifacts = await readFile(new URL('../backend/app/frame_artifacts.py', import.meta.url), 'utf8');
const frameMigration = await readFile(new URL('../backend/alembic/versions/0003_frame_artifacts.py', import.meta.url), 'utf8');
const telemetryProvenance = await readFile(new URL('../backend/app/telemetry_provenance.py', import.meta.url), 'utf8');
const provenanceMigration = await readFile(new URL('../backend/alembic/versions/0002_telemetry_evidence_provenance.py', import.meta.url), 'utf8');
const migrationConfig = await readFile(new URL('../backend/alembic.ini', import.meta.url), 'utf8');
const migrationEnv = await readFile(new URL('../backend/alembic/env.py', import.meta.url), 'utf8');
const baselineMigration = await readFile(new URL('../backend/alembic/versions/0001_claimtrace_baseline.py', import.meta.url), 'utf8');
const migrationReadme = await readFile(new URL('../backend/alembic/README.md', import.meta.url), 'utf8');
const backendRequirements = await readFile(new URL('../backend/requirements.txt', import.meta.url), 'utf8');
const render = await readFile(new URL('../render.yaml', import.meta.url), 'utf8');
const prd = await readFile(new URL('../PRD.md', import.meta.url), 'utf8');

assert.match(source, /const EVIDENCE = \[/);
assert.match(source, /const CLAIMS = \[/);
assert.match(source, /id="timeline"/);
assert.match(source, /id="claims"/);
assert.match(source, /cesiumContainer/);
assert.match(source, /fitScene/);
assert.match(source, /RECONSTRUCTION — NOT ACTUAL CRASH FOOTAGE/);
assert.match(source, /claimtraceRenderTelemetry/);
assert.match(source, /Persisted telemetry/);
assert.match(source, /claimtraceSetSyntheticVisibility/);
assert.match(source, /setSyntheticSceneVisibility/);
assert.match(source, /synthetic reconstruction hidden/);
assert.doesNotMatch(source, /capturedAt: file\.lastModified/);
assert.match(source, /capture time not asserted/);
assert.match(apiMode, /ClaimTrace Investigator Access/);
assert.match(apiMode, /listCases\(\)/);
assert.match(apiMode, /caseSwitcherButton/);
assert.match(apiMode, /NEW CASE/);
assert.match(apiMode, /listTelemetry\(selectedCase\.id\)/);
assert.match(apiMode, /buildTrajectoryAssessment/);
assert.match(apiMode, /claimtraceRenderTelemetry/);
assert.match(apiMode, /claimtraceSetSyntheticVisibility/);
assert.match(apiMode, /telemetryPanel/);
assert.match(apiMode, /importTelemetryCsv/);
assert.match(apiMode, /Africa\/Johannesburg/);
assert.match(apiMode, /RAW GPS \/ TELEMATICS IMPORT/);
assert.match(apiMode, /listTelemetryProvenance/);
assert.match(apiMode, /videoSyncPanel/);
assert.match(apiMode, /getEvidenceArtifact/);
assert.match(apiMode, /getVideoMetadata/);
assert.match(apiMode, /buildFrameEvidenceIndex/);
assert.match(apiMode, /createFrameReference/);
assert.match(apiMode, /CREATE FRAME REFERENCE/);
assert.match(apiMode, /PERSISTED FRAME REF/);
assert.match(apiMode, /VIDEO CLOCK START/);
assert.match(apiMode, /const nextStatus = document\.querySelector\('#telemetryImportStatus'\)/);
assert.match(apiMode, /capture time not asserted from filesystem metadata/);
assert.doesNotMatch(apiMode, /capturedAt: file\.lastModified/);
assert.match(apiClient, /Authorization/);
assert.match(apiClient, /\/v1\/auth\/login/);
assert.match(apiClient, /\/v1\/cases/);
assert.match(apiClient, /\/telemetry/);
assert.match(apiClient, /importTelemetryCsv/);
assert.match(apiClient, /\/telemetry\/import/);
assert.match(apiClient, /listTelemetryProvenance/);
assert.match(apiClient, /registerVideoMetadata/);
assert.match(apiClient, /createFrameReference/);
assert.match(apiClient, /frame-reference/);
assert.match(apiClient, /createFrameArtifact/);
assert.match(apiClient, /\/frame-artifacts/);
assert.match(apiClient, /getVideoMetadata/);
assert.match(apiClient, /getEvidenceArtifact/);
assert.match(apiClient, /\/artifact/);
assert.match(apiClient, /BROWSER_MEDIA_ELEMENT/);
assert.match(apiClient, /readBrowserVideoMetadata/);
assert.match(frameCapture, /capturePng/);
assert.match(frameCapture, /toBlob/);
assert.match(frameCapture, /createFrameArtifact/);
assert.match(frameCapture, /stopImmediatePropagation/);
assert.match(indexHtml, /frame-capture\.js/);
assert.match(videoSync, /buildFrameEvidenceIndex/);
assert.match(videoSync, /timelineFrameIndex/);
assert.match(qualitySource, /evidenceQualityAssessment/);
assert.match(qualitySource, /trajectoryQualityAssessment/);
assert.match(telemetryImport, /parse_csv/);
assert.match(telemetryImport, /Telemetry CSV must be UTF-8 encoded/);
assert.match(telemetryRoutes, /\/v1\/cases\/{case_id}\/telemetry\/import/);
assert.match(telemetryRoutes, /\/v1\/cases\/{case_id}\/evidence\/{evidence_id}\/frame-reference/);
assert.match(telemetryRoutes, /FRAME_REFERENCE_CREATED/);
assert.match(frameRoutes, /\/v1\/cases\/{case_id}\/frame-artifacts/);
assert.match(frameRoutes, /PNG image/);
assert.match(frameRoutes, /SHA-256/);
assert.match(frameArtifacts, /frame_artifacts/);
assert.match(frameMigration, /0003_frame_artifacts/);
assert.match(frameMigration, /frame_artifacts/);
assert.match(telemetryProvenance, /telemetry_evidence_links/);
assert.match(provenanceMigration, /0002_telemetry_evidence_provenance/);
assert.match(provenanceMigration, /telemetry_evidence_links/);
assert.match(migrationConfig, /\[alembic\]/);
assert.match(migrationEnv, /target_metadata = metadata/);
assert.match(baselineMigration, /metadata\.create_all/);
assert.match(migrationReadme, /alembic upgrade head/);
assert.match(backendRequirements, /alembic==1\.16\.5/);
assert.match(render, /claimtrace-api/);
assert.match(render, /claimtrace-web/);
assert.match(render, /claimtrace-db/);
assert.match(prd, /ClaimTrace/);
assert.match(prd, /evidence/);
assert.match(prd, /human/i);

const evidence = normalizeEvidence([
  { id: 'e2', timestamp: '2026-08-18T12:31:50Z', type: 'CCTV', source: 'CCTV', confidence: 'HIGH', title: 'Collision visible' },
  { id: 'e1', timestamp: '2026-08-18T12:31:46Z', type: 'GPS', source: 'GPS', confidence: 'HIGH', title: 'Vehicle A braking' },
]);
assert.deepEqual(evidence.map((item) => item.id), ['e1', 'e2']);
assert.equal(provenanceScore(evidence[1]), 80);
assert.ok(evidence.every((item) => item.quality.score > 0));
assert.equal(evidence[0].quality.source, 'GPS');

const qualityWithProvenance = evidenceQualityAssessment({ source: 'CCTV', confidence: 'HIGH', accuracyMeters: 5, sha256: 'abc', sourceRef: 'camera.mp4' });
const qualityWithoutProvenance = evidenceQualityAssessment({ source: 'STATEMENT', confidence: 'LOW' });
assert.ok(qualityWithProvenance.score > qualityWithoutProvenance.score);
assert.equal(qualityWithProvenance.provenancePresent, true);
assert.equal(qualityWithoutProvenance.provenancePresent, false);
assert.match(qualityWithProvenance.reasons.join(' '), /source provenance present/);

const correlated = correlateEvents(evidence, 5);
assert.equal(correlated.length, 1);
assert.equal(correlated[0].evidenceCount, 2);
assert.equal(correlated[0].dominantSource, 'CCTV');

const trajectoryInput = [
  { id: 'a', timestamp: '2026-08-18T12:31:00Z', lat: -26.2466, lon: 28.0205, accuracyMeters: 5 },
  { id: 'b', timestamp: '2026-08-18T12:31:02Z', lat: -26.2467, lon: 28.0207, accuracyMeters: 5 },
  { id: 'c', timestamp: '2026-08-18T12:31:04Z', lat: -26.2468, lon: 28.0209, accuracyMeters: 10 },
];

const trajectory = buildTrajectorySegments(trajectoryInput);
assert.equal(trajectory.length, 2);
assert.equal(trajectory[0].quality, 'HIGH');
assert.equal(trajectory[0].interpolated, false);
assert.ok(trajectory[0].uncertaintyMeters >= 5);

const summary = summarizeTrajectory(trajectoryInput);
assert.equal(summary.pointCount, 3);
assert.equal(summary.segmentCount, 2);
assert.ok(summary.totalDistanceMeters > 0);
assert.equal(summary.durationSeconds, 4);

const integratedTrajectory = buildTrajectoryAssessment(trajectoryInput);
assert.equal(integratedTrajectory.telemetry.length, 3);
assert.equal(integratedTrajectory.segments.length, 2);
assert.equal(integratedTrajectory.summary.segmentCount, 2);
assert.ok(integratedTrajectory.quality.score > 0);
assert.equal(integratedTrajectory.quality.observedSegments, 2);

const interpolatedAssessment = trajectoryQualityAssessment([
  ...trajectory,
  { ...trajectory[0], id: 'INT-1', interpolated: true, quality: 'LOW', confidence: 0.2 },
]);
assert.equal(interpolatedAssessment.interpolatedSegments, 1);
assert.ok(interpolatedAssessment.score < integratedTrajectory.quality.score);

const assessment = buildCaseAssessment({
  evidence: [
    { id: 'e1', timestamp: '2026-08-18T12:31:46Z', type: 'GPS', source: 'GPS', confidence: 'HIGH', supportsClaim: 'claim-1' },
    { id: 'e2', timestamp: '2026-08-18T12:31:50Z', type: 'CCTV', source: 'CCTV', confidence: 'HIGH', supportsClaim: 'claim-1' },
    { id: 'e3', timestamp: '2026-08-18T12:31:51Z', type: 'STATEMENT', source: 'STATEMENT', confidence: 'LOW', contradictsClaim: 'claim-1' },
  ],
  claims: [{ id: 'claim-1', text: 'Vehicle A entered the intersection before impact.' }],
  requiredEvidence: ['GPS', 'CCTV', 'DASHCAM'],
  telemetry: trajectoryInput,
});

assert.equal(assessment.claims[0].result.status, 'CONFLICTING');
assert.deepEqual(findMissingEvidence(['GPS', 'DASHCAM'], assessment.evidence), ['DASHCAM']);
assert.ok(assessment.overallConfidence > 0);
assert.equal(assessment.trajectory.summary.segmentCount, 2);
assert.ok(assessment.evidenceQuality.score > 0);
assert.equal(assessment.evidenceQuality.evidenceCount, 3);
assert.equal(buildEvidenceQualityAssessment(assessment.evidence).score, assessment.evidenceQuality.score);

const normalizedTelemetry = normalizeTelemetry([
  { id: 'p2', timestamp: '2026-08-18T14:31:05', latitude: -26.2465, longitude: 28.0206, accuracy_m: 6 },
  { id: 'p1', timestamp: '2026-08-18T14:31:00', latitude: -26.2466, longitude: 28.0205, accuracy_m: 4 },
]);
assert.deepEqual(normalizedTelemetry.map((point) => point.id), ['p1', 'p2']);
assert.equal(normalizedTelemetry[0].assumedTimeZone, true);
assert.equal(normalizedTelemetry[0].sourceTimeZone, 'Africa/Johannesburg');
const enriched = enrichTelemetry(normalizedTelemetry);
assert.ok(enriched[1].segmentDistanceMeters > 0);
assert.ok(enriched[1].derivedSpeedKph > 0);

const midpoint = interpolatePosition({ lat: -26.2466, lon: 28.0205 }, { lat: -26.2468, lon: 28.0209 }, 0.5);
assert.equal(midpoint.lat, -26.2467);
assert.equal(midpoint.lon, 28.0207);

const interpolated = interpolateTrajectory([
  { id: 'a', timestamp: '2026-08-18T12:31:00Z', lat: -26.2466, lon: 28.0205, accuracyMeters: 5 },
  { id: 'b', timestamp: '2026-08-18T12:31:05Z', lat: -26.2468, lon: 28.0209, accuracyMeters: 5 },
], { maxGapSeconds: 10, stepSeconds: 1 });
assert.equal(interpolated.length, 6);
assert.equal(interpolated.filter((point) => point.interpolated).length, 4);

const videoSyncConfig = normalizeVideoSync({ captureStartAt: '2026-08-18T12:31:40Z', frameRate: 25, offsetSeconds: 0.2 });
assert.deepEqual(videoSyncConfig, { captureStartAt: '2026-08-18T12:31:40.000Z', frameRate: 25, offsetSeconds: 0.2 });
assert.equal(frameTimeSeconds(50, 25), 2);
assert.equal(frameTimestamp(50, videoSyncConfig), '2026-08-18T12:31:42.200Z');
assert.equal(timelineFrameIndex('2026-08-18T12:31:42.200Z', videoSyncConfig), 50);
const frameIndex = buildFrameEvidenceIndex('e-video-1', videoSyncConfig, [0, 25, 50]);
assert.equal(frameIndex.length, 3);
assert.equal(frameIndex[2].timestamp, '2026-08-18T12:31:42.200Z');
assert.equal(frameIndex.every((item) => item.synchronized), true);
assert.equal(frameTimestamp(1, { captureStartAt: 'not-a-date', frameRate: 25 }), null);

const helloHash = await hashBytes(new TextEncoder().encode('hello'));
assert.equal(helloHash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

const record = createEvidenceRecord({
  caseId: 'CLM-DEMO-0001',
  type: 'DASHCAM',
  source: 'insured upload',
  sourceRef: 'dashcam-front.mp4',
  sha256: helloHash,
  capturedAt: '2026-08-18T12:31:40Z',
  ingestedAt: '2026-08-18T12:32:00Z',
  mediaType: 'video/mp4',
  sizeBytes: 123,
});
assert.equal(validateEvidenceRecord(record).valid, true);
assert.equal(record.chainOfCustody.length, 1);
const reviewed = appendCustodyEvent(record, {
  action: 'REVIEWED',
  timestamp: '2026-08-18T12:35:00Z',
  actor: 'INVESTIGATOR-01',
  note: 'Original upload inspected without modification.',
});
assert.equal(reviewed.chainOfCustody.length, 2);
assert.notEqual(reviewed.id, undefined);
assert.equal(buildEvidenceManifest([reviewed])[0].sha256, helloHash);

console.log('PASS: ClaimTrace static + source-backed quality + evidence engine + intake + multi-case + live telemetry + synchronized video artifact + persisted frame extraction + raw telemetry import + provenance + migration checks');
