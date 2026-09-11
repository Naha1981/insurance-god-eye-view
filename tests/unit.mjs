import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCaseAssessment, correlateEvents, findMissingEvidence, normalizeEvidence, provenanceScore } from '../src/evidence/engine.js';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const prd = await readFile(new URL('../PRD.md', import.meta.url), 'utf8');

assert.match(source, /RECONSTRUCTION — NOT ACTUAL CRASH FOOTAGE/);
assert.match(source, /EVIDENCE TIMELINE/);
assert.match(source, /CLAIM VERSION TEST/);
assert.match(source, /cesiumContainer/);
assert.match(source, /fitScene/);
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

console.log('PASS: ClaimTrace static + evidence engine checks');
