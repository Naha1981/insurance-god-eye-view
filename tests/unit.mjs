import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCaseAssessment, correlateEvents, findMissingEvidence, normalizeEvidence, provenanceScore } from '../src/evidence/engine.js';
import { appendCustodyEvent, buildEvidenceManifest, createEvidenceRecord, hashBytes, validateEvidenceRecord } from '../src/evidence/intake.js';

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
assert.match(apiMode, /ClaimTrace Investigator Access/);
assert.match(apiMode, /uploadEvidence\(caseId/);
assert.match(apiClient, /Authorization/);
assert.match(apiClient, /\/v1\/auth\/login/);
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

const assessment = buildCaseAssessment({
  evidence: [
    { id: 'e1', timestamp: '2026-08-18T12:31:46Z', type: 'GPS', source: 'GPS', confidence: 'HIGH', supportsClaim: 'claim-1' },
    { id: 'e2', timestamp: '2026-08-18T12:31:50Z', type: 'CCTV', source: 'CCTV', confidence: 'HIGH', supportsClaim: 'claim-1' },
    { id: 'e3', timestamp: '2026-08-18T12:31:51Z', type: 'STATEMENT', source: 'STATEMENT', confidence: 'LOW', contradictsClaim: 'claim-1' },
  ],
  claims: [{ id: 'claim-1', text: 'Vehicle A entered the intersection before impact.' }],
  requiredEvidence: ['GPS', 'CCTV', 'DASHCAM'],
});

assert.equal(assessment.claims[0].result.status, 'CONFLICTING');
assert.deepEqual(findMissingEvidence(['GPS', 'DASHCAM'], assessment.evidence), ['DASHCAM']);
assert.ok(assessment.overallConfidence > 0);

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

console.log('PASS: ClaimTrace static + evidence engine + intake + API/deployment checks');
