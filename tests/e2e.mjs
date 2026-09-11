import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const port = 4173;
const artifactDir = 'test-artifacts';
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

let browser;
let page;
const diagnostics = { consoleErrors: [], pageErrors: [] };

const waitForServer = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Vite server did not become ready within 30 seconds');
};

try {
  await waitForServer();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // The investigation workspace is the critical path; rendering must not depend on Cesium/WebGL.
  await page.waitForSelector('#timeline .timeline-event', { timeout: 5000 });
  await page.waitForSelector('#claims .claim-row', { timeout: 5000 });

  const result = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    caseId: document.querySelector('.case-pill')?.textContent,
    evidenceCount: document.querySelectorAll('#timeline .timeline-event').length,
    claimCount: document.querySelectorAll('#claims .claim-row').length,
    disclaimer: document.querySelector('.reconstruction-stamp')?.textContent,
    fitButton: document.querySelector('#fitScene')?.textContent,
    mapCanvas: Boolean(document.querySelector('#cesiumContainer canvas')),
    mapFallback: document.querySelector('#mapStatus')?.textContent || null,
  }));

  assert.equal(result.caseId, 'CLM-DEMO-0001');
  assert.equal(result.evidenceCount, 5);
  assert.equal(result.claimCount, 5);
  assert.match(result.disclaimer, /NOT ACTUAL CRASH FOOTAGE/);
  assert.equal(result.fitButton, 'FIT SCENE');
  assert.equal(typeof result.title, 'string');
  assert.ok(result.mapCanvas || result.mapFallback, 'Expected Cesium canvas or explicit map fallback status');

  await page.click('#timeline .timeline-event[data-index="0"]');
  assert.equal(
    await page.$eval('#timeline .timeline-event[data-index="0"]', (el) => el.classList.contains('selected')),
    true,
  );

  await page.click('#fitScene');

  // A map fallback is an accepted non-fatal condition, but unrelated runtime errors are not.
  const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => !message.includes('ClaimTrace map initialization failed:'));
  assert.deepEqual(unexpectedConsoleErrors, []);
  assert.deepEqual(diagnostics.pageErrors, []);

  // Autonomous acceptance checks: reject obvious hallucination-risk copy in a visual reconstruction.
  const visibleText = await page.$eval('body', (el) => el.innerText);
  assert.match(visibleText, /SYNTHETIC DEMO/);
  assert.doesNotMatch(visibleText, /ACTUAL CRASH VIDEO|RECORDED CRASH FOOTAGE/i);

  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/claimtrace-smoke.png`, fullPage: true });
  await writeFile(
    `${artifactDir}/claimtrace-summary.json`,
    JSON.stringify({ status: 'PASS', checks: 12, result, diagnostics }, null, 2),
  );

  console.log(JSON.stringify({ status: 'PASS', checks: 12, result }, null, 2));
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  if (page) {
    await page.screenshot({ path: `${artifactDir}/claimtrace-failure.png`, fullPage: true }).catch(() => {});
  }
  await writeFile(
    `${artifactDir}/claimtrace-failure.txt`,
    `${error.stack || error}\n\nDiagnostics:\n${JSON.stringify(diagnostics, null, 2)}\n`,
  ).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
