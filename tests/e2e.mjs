import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const port = 4173;
const artifactDir = 'test-artifacts';
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
  detached: process.platform !== 'win32',
});

let browser;
let page;
const diagnostics = { consoleErrors: [], pageErrors: [] };

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Vite server did not become ready within 30 seconds');
}

async function stopServer() {
  if (!server || server.killed) return;
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
      await new Promise((resolve) => killer.once('close', resolve));
    } else {
      process.kill(-server.pid, 'SIGTERM');
    }
  } catch {}
}

try {
  await waitForServer();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.case-pill', { timeout: 10000 });
  await page.waitForSelector('#evidenceRegister', { timeout: 10000 });
  await page.waitForSelector('#timeline', { timeout: 10000 });
  await page.waitForSelector('#cesiumContainer', { timeout: 10000 });
  await page.waitForSelector('#fitScene', { timeout: 10000 });

  const shell = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent || '',
    caseId: document.querySelector('.case-pill')?.textContent || '',
    disclaimer: document.querySelector('.reconstruction-stamp')?.textContent || '',
    fitButton: document.querySelector('#fitScene')?.textContent || '',
    timelineVisible: Boolean(document.querySelector('#timeline')),
    evidenceRegisterCount: document.querySelectorAll('#evidenceRegister .evidence-row').length,
    mapCanvas: Boolean(document.querySelector('#cesiumContainer canvas')),
    mapFallback: document.querySelector('#mapStatus')?.textContent || null,
  }));

  assert.equal(shell.caseId, 'CLM-DEMO-0001');
  assert.match(shell.disclaimer, /NOT ACTUAL CRASH FOOTAGE/);
  assert.equal(shell.fitButton, 'FIT SCENE');
  assert.equal(shell.timelineVisible, true);
  assert.equal(shell.evidenceRegisterCount, 0);
  assert.ok(shell.mapCanvas || shell.mapFallback);

  await mkdir(artifactDir, { recursive: true });
  const fixturePath = `${artifactDir}/intake-fixture.txt`;
  await writeFile(fixturePath, 'ClaimTrace deterministic intake fixture');
  const fileInput = await page.$('#evidenceFile');
  assert.ok(fileInput, 'Evidence file input should exist');
  await fileInput.uploadFile(fixturePath);
  await page.waitForFunction(
    () => document.querySelectorAll('#evidenceRegister .evidence-row').length === 1,
    { timeout: 10000 },
  );

  const intake = await page.evaluate(() => ({
    count: document.querySelectorAll('#evidenceRegister .evidence-row').length,
    status: document.querySelector('#intakeStatus')?.textContent || '',
    hashedRow: document.querySelector('#evidenceRegister .evidence-row:last-child .evidence-hash')?.textContent || '',
  }));
  assert.equal(intake.count, 1);
  assert.match(intake.status, /REGISTERED E-/);
  assert.match(intake.hashedRow, /SHA-256 [a-f0-9]{16}/i);

  await page.click('#fitScene');
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.pageErrors, []);

  const visibleText = await page.$eval('body', (el) => el.innerText);
  assert.match(visibleText, /PHYSICAL-WORLD EVIDENCE INTELLIGENCE/i);
  assert.doesNotMatch(visibleText, /ACTUAL CRASH VIDEO|RECORDED CRASH FOOTAGE/i);

  await page.screenshot({ path: `${artifactDir}/claimtrace-smoke.png`, fullPage: true });
  await writeFile(
    `${artifactDir}/claimtrace-summary.json`,
    JSON.stringify({ status: 'PASS', shell, intake, diagnostics }, null, 2),
  );
  console.log(JSON.stringify({ status: 'PASS', shell, intake }, null, 2));
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  if (page) await page.screenshot({ path: `${artifactDir}/claimtrace-failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${artifactDir}/claimtrace-failure.txt`, `${error.stack || error}\n\n${JSON.stringify(diagnostics, null, 2)}\n`).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
