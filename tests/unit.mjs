import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCaseAssessment, buildTrajectoryAssessment, correlateEvents, findMissingEvidence, normalizeEvidence, provenanceScore } from '../src/evidence/engine.js';
import { appendCustodyEvent, buildEvidenceManifest, createEvidenceRecord, hashBytes, validateEvidenceRecord } from '../src/evidence/intake.js';
import { normalizeTelemetry, enrichTelemetry } from '../src/evidence/geospatial.js';
import { buildTrajectorySegments, summarizeTrajectory, interpolateTrajectory, interpolatePosition } from '../src/evidence/trajectory.js';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const apiMode = await readFile(new URL('../src/evidence/api-mode.js', import.meta.url), 'utf8');
const apiClient = await readFile(new URL('../src/evidence/api.js', import.meta.url), 'utf8');
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
assert.match(apiMode, /ClaimTrace Investigator Access/);
assert.match(apiMode, /listCases\(\)/);
assert.match(apiMode, /caseSwitcherButton/);
assert.match(apiMode, /NEW CASE/);
assert.match(apiMode, /listTelemetry\(selectedCase\.id\)/);
assert.match(apiMode, /buildTrajectoryAssessment/);
assert.match(apiMode, /claimtraceRenderTelemetry/);
assert.match(apiMode, /telemetryPanel/);
assert.match(apiClient, /Authorization/);
assert.match(apiClient, /\/v1\/auth\/login/);
assert.match(apiClient, /\/v1\/cases/);
assert.match(apiClient, /\/telemetry/);
assert.match(apiClient, /registerVideoMetadata/);
assert.match(apiClient, /BROWSER_MEDIA_ELEMENT/);
assert.match(apiClient, /readBrowserVideoMetadata/);
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

console.log('PASS: ClaimTrace static + evidence engine + intake + multi-case + live telemetry + trajectory checks');
