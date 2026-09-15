import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCaseAssessment, buildTrajectoryAssessment, findMissingEvidence, normalizeEvidence, provenanceScore } from '../src/evidence/engine.js';
import { evidenceQualityAssessment } from '../src/evidence/quality.js';
import { hashBytes } from '../src/evidence/intake.js';
import { normalizeTelemetry, enrichTelemetry } from '../src/evidence/geospatial.js';
import { buildTrajectorySegments, summarizeTrajectory } from '../src/evidence/trajectory.js';
import { buildFrameEvidenceIndex, frameTimestamp, normalizeVideoSync, timelineFrameIndex } from '../src/evidence/video-sync.js';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const apiMode = await readFile(new URL('../src/evidence/api-mode.js', import.meta.url), 'utf8');
const apiClient = await readFile(new URL('../src/evidence/api.js', import.meta.url), 'utf8');
const render = await readFile(new URL('../render.yaml', import.meta.url), 'utf8');
const prd = await readFile(new URL('../PRD.md', import.meta.url), 'utf8');

assert.match(source, /const EVIDENCE = \[/);
assert.match(source, /id="timeline"/);
assert.match(source, /id="cesiumContainer"/);
assert.match(source, /RECONSTRUCTION — NOT ACTUAL CRASH FOOTAGE/);
assert.match(source, /claimtraceRenderTelemetry/);
assert.match(source, /claimtraceSetSyntheticVisibility/);
assert.match(apiMode, /ClaimTrace Investigator Access/);
assert.match(apiMode, /listCases\(\)/);
assert.match(apiMode, /importTelemetryCsv/);
assert.match(apiMode, /buildTrajectoryAssessment/);
assert.match(apiClient, /\/v1\/cases/);
assert.match(apiClient, /\/telemetry/);
assert.match(apiClient, /Authorization/);
assert.match(render, /claimtrace-api/);
assert.match(render, /claimtrace-web/);
assert.match(prd, /ClaimTrace/);
assert.match(prd, /human/i);

const evidence = normalizeEvidence([
  { id: 'e2', timestamp: '2026-08-18T12:31:50Z', type: 'CCTV', source: 'CCTV', confidence: 'HIGH', title: 'Collision visible' },
  { id: 'e1', timestamp: '2026-08-18T12:31:46Z', type: 'GPS', source: 'GPS', confidence: 'HIGH', title: 'Vehicle A braking' },
]);
assert.deepEqual(evidence.map((item) => item.id), ['e1', 'e2']);
assert.equal(provenanceScore(evidence[1]), 80);
assert.ok(evidence.every((item) => item.quality.score > 0));

const quality = evidenceQualityAssessment({ source: 'CCTV', confidence: 'HIGH', accuracyMeters: 5, sha256: 'abc', sourceRef: 'camera.mp4' });
assert.equal(quality.provenancePresent, true);
assert.ok(quality.score > 0);

const trajectoryInput = [
  { id: 'a', timestamp: '2026-08-18T12:31:00Z', lat: -26.2466, lon: 28.0205, accuracyMeters: 5 },
  { id: 'b', timestamp: '2026-08-18T12:31:02Z', lat: -26.2467, lon: 28.0207, accuracyMeters: 5 },
  { id: 'c', timestamp: '2026-08-18T12:31:04Z', lat: -26.2468, lon: 28.0209, accuracyMeters: 10 },
];
const segments = buildTrajectorySegments(trajectoryInput);
assert.equal(segments.length, 2);
assert.equal(segments[0].interpolated, false);
const summary = summarizeTrajectory(trajectoryInput);
assert.equal(summary.pointCount, 3);
assert.equal(summary.segmentCount, 2);
assert.equal(summary.durationSeconds, 4);
const integrated = buildTrajectoryAssessment(trajectoryInput);
assert.equal(integrated.summary.segmentCount, 2);
assert.ok(integrated.quality.score > 0);

const caseAssessment = buildCaseAssessment({
  evidence: [
    { id: 'e1', timestamp: '2026-08-18T12:31:46Z', type: 'GPS', source: 'GPS', confidence: 'HIGH', supportsClaim: 'claim-1' },
    { id: 'e2', timestamp: '2026-08-18T12:31:50Z', type: 'CCTV', source: 'CCTV', confidence: 'HIGH', supportsClaim: 'claim-1' },
    { id: 'e3', timestamp: '2026-08-18T12:31:51Z', type: 'STATEMENT', source: 'STATEMENT', confidence: 'LOW', contradictsClaim: 'claim-1' },
  ],
  claims: [{ id: 'claim-1', text: 'Vehicle A entered the intersection before impact.' }],
  requiredEvidence: ['GPS', 'CCTV', 'DASHCAM'],
  telemetry: trajectoryInput,
});
assert.equal(caseAssessment.claims[0].result.status, 'CONFLICTING');
assert.deepEqual(findMissingEvidence(['GPS', 'DASHCAM'], caseAssessment.evidence), ['DASHCAM']);
assert.equal(caseAssessment.trajectory.summary.segmentCount, 2);

const telemetry = normalizeTelemetry([
  { id: 'p2', timestamp: '2026-08-18T14:31:05', latitude: -26.2465, longitude: 28.0206, accuracy_m: 6 },
  { id: 'p1', timestamp: '2026-08-18T14:31:00', latitude: -26.2466, longitude: 28.0205, accuracy_m: 4 },
]);
assert.deepEqual(telemetry.map((point) => point.id), ['p1', 'p2']);
assert.equal(telemetry[0].assumedTimeZone, true);
const enriched = enrichTelemetry(telemetry);
assert.ok(enriched[1].segmentDistanceMeters > 0);

const sync = normalizeVideoSync({ captureStartAt: '2026-08-18T12:31:40Z', frameRate: 25, offsetSeconds: 0.2 });
assert.equal(frameTimestamp(50, sync), '2026-08-18T12:31:42.200Z');
assert.equal(timelineFrameIndex('2026-08-18T12:31:42.200Z', sync), 50);
const frameIndex = buildFrameEvidenceIndex('e-video-1', sync, [0, 25, 50]);
assert.equal(frameIndex.length, 3);
assert.equal(frameIndex.every((item) => item.synchronized), true);

const helloHash = await hashBytes(new TextEncoder().encode('hello'));
assert.equal(helloHash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

console.log('ClaimTrace unit tests: PASS');
