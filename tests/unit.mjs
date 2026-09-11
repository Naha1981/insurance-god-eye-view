import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

console.log('PASS: ClaimTrace static product checks');
