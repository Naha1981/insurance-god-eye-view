import {
  clearStoredToken,
  createCase,
  downloadReport,
  getCase,
  getMe,
  getStoredToken,
  isApiConfigured,
  listCases,
  listEvidence,
  listTelemetry,
  login,
  uploadEvidence,
} from './api.js';
import { buildTrajectoryAssessment } from './engine.js';

const CASE_KEY = 'claimtrace_case_id';

const style = document.createElement('style');
style.textContent = `
  .api-mode-banner { margin: 12px 18px 0; padding: 10px 12px; border: 1px solid rgba(74,180,255,.25); background: rgba(15,35,52,.72); color: #b9dfff; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; }
  .api-auth { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(3,9,15,.86); backdrop-filter: blur(8px); }
  .api-auth-card, .case-switcher-card { width: min(560px, 100%); padding: 28px; border: 1px solid #27415a; background: #0c1824; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
  .api-auth-card h2, .case-switcher-card h2 { margin: 0 0 8px; color: #fff; }
  .api-auth-card p, .case-switcher-card p { margin: 0 0 18px; color: #92a8bd; font-size: 13px; line-height: 1.5; }
  .api-auth-card label, .case-switcher-card label { display: block; margin: 12px 0 6px; color: #9db4ca; font: 11px ui-monospace, monospace; text-transform: uppercase; }
  .api-auth-card input, .case-switcher-card input { box-sizing: border-box; width: 100%; padding: 11px 12px; border: 1px solid #27415a; background: #07121f; color: #fff; }
  .api-auth-card button, .case-switcher-card button { width: 100%; margin-top: 16px; padding: 11px; border: 0; background: #4ab4ff; color: #05101a; font-weight: 700; cursor: pointer; }
  .api-auth-error, .case-switcher-error { margin-top: 10px; color: #ff927e; font-size: 12px; }
  .api-live-chip { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; color: #8ff0b4; }
  .api-live-chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #5be58f; box-shadow: 0 0 8px #5be58f; }
  .api-report-btn { border-color: rgba(74,180,255,.35); color: #d7ecff; }
  .api-case-btn { border-color: rgba(143,240,180,.28); color: #c8f8d7; }
  .case-switcher { position: fixed; inset: 0; z-index: 1001; display: grid; place-items: center; padding: 24px; background: rgba(3,9,15,.82); backdrop-filter: blur(10px); }
  .case-list { display: grid; gap: 8px; max-height: 340px; overflow: auto; }
  .case-row { width: 100%; display: flex; justify-content: space-between; gap: 16px; padding: 14px; text-align: left; border: 1px solid #27415a; background: #081522; color: #fff; cursor: pointer; }
  .case-row:hover { border-color: #4ab4ff; background: #0d1f2f; }
  .case-row strong { display: block; margin-bottom: 4px; }
  .case-row small { color: #88a1b7; }
  .case-row .case-count { color: #8ff0b4; white-space: nowrap; font: 11px ui-monospace, monospace; }
  .case-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .telemetry-panel { border-color: rgba(91,229,143,.2); }
  .telemetry-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
  .telemetry-metric { padding: 10px; border: 1px solid #20384d; background: #081522; }
  .telemetry-metric span { display: block; color: #7e97ad; font: 10px ui-monospace, monospace; text-transform: uppercase; }
  .telemetry-metric strong { display: block; margin-top: 4px; color: #f4f8fb; font-size: 15px; }
  .telemetry-quality { margin-top: 10px; color: #9fbed4; font-size: 11px; line-height: 1.45; }
`;
document.head.appendChild(style);

const waitForWorkspace = () => new Promise((resolve) => {
  const check = () => document.querySelector('#timeline') ? resolve() : setTimeout(check, 20);
  check();
});

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

const setBanner = (text) => {
  const topbar = document.querySelector('.topbar');
  if (!topbar || document.querySelector('.api-mode-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'api-mode-banner';
  banner.innerHTML = `${esc(text)} <span class="api-live-chip">API CONNECTED</span>`;
  topbar.insertAdjacentElement('afterend', banner);
};

const showAuth = () => new Promise((resolve) => {
  const overlay = document.createElement('div');
  overlay.className = 'api-auth';
  overlay.innerHTML = `
    <form class="api-auth-card" id="claimtraceLogin">
      <h2>ClaimTrace Investigator Access</h2>
      <p>This deployment is connected to the ClaimTrace API. Sign in to work inside a tenant-isolated investigation workspace.</p>
      <label for="claimtraceEmail">Email</label>
      <input id="claimtraceEmail" name="claimtraceEmail" type="email" autocomplete="username" required />
      <label for="claimtracePassword">Password</label>
      <input id="claimtracePassword" name="claimtracePassword" type="password" autocomplete="current-password" required />
      <button type="submit">SIGN IN</button>
      <div id="claimtraceLoginError" class="api-auth-error" aria-live="polite"></div>
    </form>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('input').focus();
  overlay.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = overlay.querySelector('#claimtraceLoginError');
    const button = overlay.querySelector('button');
    button.disabled = true;
    error.textContent = 'AUTHENTICATING…';
    try {
      const result = await login(form.get('claimtraceEmail'), form.get('claimtracePassword'));
      overlay.remove();
      resolve(result.user);
    } catch (loginError) {
      error.textContent = loginError instanceof Error ? loginError.message : 'Authentication failed';
      button.disabled = false;
    }
  });
});

const renderApiEvidence = (records) => {
  const register = document.querySelector('#evidenceRegister');
  const countChip = document.querySelector('#evidenceCountChip');
  const timeline = document.querySelector('#timeline');
  if (!register || !countChip || !timeline) return;

  countChip.textContent = `${records.length} ITEMS`;
  register.innerHTML = records.map((record) => `
    <div class="evidence-row">
      <div class="evidence-main"><span class="evidence-id">${esc(record.id)}</span><strong>${esc(record.type)}</strong><span class="evidence-title">${esc(record.source_ref || record.source || 'Evidence')}</span></div>
      <div class="evidence-meta"><span>${esc(record.source)}</span><span>REGISTERED</span><span class="provenance sourcelinked">SOURCE-LINKED</span></div>
      <div class="evidence-hash">SHA-256 ${esc(record.sha256.slice(0, 16))}… · custody ${record.chain_of_custody?.length ?? 1}</div>
    </div>
  `).join('');

  timeline.innerHTML = records.map((record, index) => {
    const time = new Date(record.captured_at || record.ingested_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `
      <button class="timeline-event ${index === records.length - 1 ? 'selected' : ''}" data-index="${index}">
        <div class="event-time">${esc(time)}</div>
        <div class="event-line"></div>
        <div class="event-body"><div class="event-title">${esc(record.source_ref || record.type)}</div><div class="event-detail">${esc(record.media_type || record.type)} · ${Number(record.size_bytes || 0).toLocaleString()} bytes · server hashed</div><span class="confidence high">REGISTERED</span></div>
      </button>
    `;
  }).join('');

  document.querySelectorAll('.timeline-event').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.timeline-event').forEach((item) => item.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  const heading = document.querySelector('#timeline')?.previousElementSibling?.querySelector('h2');
  if (heading) heading.textContent = `${records.length} evidence events`;
};

const renderTelemetryPanel = (points) => {
  const panel = document.querySelector('#telemetryPanel');
  if (!panel) return null;
  const raw = points.map((point) => ({
    ...point,
    timestamp: point.timestamp_utc,
    lat: point.lat,
    lon: point.lon,
    accuracyMeters: point.accuracy_meters,
    vehicleId: point.vehicle_id,
    speedKph: point.speed_kph,
    headingDeg: point.heading_deg,
  }));
  const assessment = buildTrajectoryAssessment(raw);
  const summary = assessment.summary;
  const avgAccuracy = points.length ? points.reduce((sum, point) => sum + (Number(point.accuracy_meters) || 0), 0) / points.length : null;
  const confidence = assessment.segments.length
    ? Math.round((assessment.segments.reduce((sum, segment) => sum + segment.confidence, 0) / assessment.segments.length) * 100)
    : 0;
  panel.hidden = false;
  panel.className = 'panel-block telemetry-panel';
  panel.innerHTML = `
    <div class="section-head"><div><div class="section-kicker">LIVE RECONSTRUCTION INPUT</div><h2>${points.length} telemetry points</h2></div><span class="mini-chip">PERSISTED</span></div>
    <div class="telemetry-grid">
      <div class="telemetry-metric"><span>Distance</span><strong>${summary.totalDistanceMeters.toFixed(0)} m</strong></div>
      <div class="telemetry-metric"><span>Mean speed</span><strong>${summary.meanSpeedKph == null ? '—' : `${summary.meanSpeedKph.toFixed(1)} km/h`}</strong></div>
      <div class="telemetry-metric"><span>Signal quality</span><strong>${confidence}%</strong></div>
    </div>
    <div class="telemetry-quality">${summary.segmentCount} observed trajectory segments · ${summary.lowConfidenceSegments} low-confidence segments · average reported accuracy ${avgAccuracy == null ? 'unknown' : `${avgAccuracy.toFixed(1)} m`}. Movement shown on the map is evidence reconstruction, not recorded crash footage.</div>
  `;
  return assessment;
};

const installApiIntake = (caseId) => {
  const oldButton = document.querySelector('#addEvidence');
  const oldInput = document.querySelector('#evidenceFile');
  const oldType = document.querySelector('#evidenceType');
  if (!oldButton || !oldInput || !oldType) return;

  document.querySelector('#apiEvidenceType')?.remove();
  document.querySelector('#apiAddEvidence')?.remove();
  document.querySelector('#apiEvidenceFile')?.remove();
  oldButton.hidden = true;
  oldInput.hidden = true;
  oldType.hidden = true;
  oldType.insertAdjacentHTML('afterend', `
    <select id="apiEvidenceType" class="intake-select" aria-label="API evidence type">
      <option>DASHCAM</option>
      <option>CCTV</option>
      <option>PHOTO</option>
      <option>POLICE_REPORT</option>
      <option>TELEMATICS</option>
      <option>OTHER</option>
    </select>
    <button id="apiAddEvidence" class="intake-btn">UPLOAD TO CASE</button>
    <input id="apiEvidenceFile" type="file" hidden accept="video/*,image/*,application/pdf,.pdf" />
  `);

  const button = document.querySelector('#apiAddEvidence');
  const input = document.querySelector('#apiEvidenceFile');
  const type = document.querySelector('#apiEvidenceType');
  const status = document.querySelector('#intakeStatus');
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const [file] = input.files ?? [];
    if (!file) return;
    button.disabled = true;
    status.textContent = `UPLOADING ${file.name}…`;
    try {
      const record = await uploadEvidence(caseId, { file, type: type.value });
      renderApiEvidence(await listEvidence(caseId));
      const captureNote = type.value === 'DASHCAM' || type.value === 'CCTV'
        ? ' · capture time not asserted from filesystem metadata'
        : '';
      status.textContent = `REGISTERED ${record.id} · SERVER SHA-256 ${record.sha256.slice(0, 16)}…${captureNote}`;
      input.value = '';
    } catch (error) {
      if (error?.status === 401) clearStoredToken();
      status.textContent = `UPLOAD FAILED · ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      button.disabled = false;
    }
  });
};

const installReportAction = (caseId) => {
  const actions = document.querySelector('.top-actions');
  if (!actions) return;
  const existing = document.querySelector('#downloadReport');
  if (existing) existing.remove();
  const button = document.createElement('button');
  button.id = 'downloadReport';
  button.className = 'ghost-btn api-report-btn';
  button.textContent = 'EXPORT REPORT';
  button.title = 'Download the investigator evidence report';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'BUILDING REPORT…';
    try {
      const { blob, filename } = await downloadReport(caseId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const status = document.querySelector('#intakeStatus');
      if (status) status.textContent = `REPORT FAILED · ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      button.disabled = false;
      button.textContent = 'EXPORT REPORT';
    }
  });
  actions.appendChild(button);
};

const mountCaseSwitcher = async (refreshCase) => {
  const overlay = document.createElement('div');
  overlay.className = 'case-switcher';
  overlay.innerHTML = `
    <div class="case-switcher-card">
      <h2>Investigation cases</h2>
      <p>Select an existing case or open a new investigation. Cases are tenant-scoped.</p>
      <div id="claimtraceCaseList" class="case-list"></div>
      <div class="case-actions">
        <button id="newCaseButton" type="button">NEW CASE</button>
        <button id="closeCaseButton" type="button">CLOSE</button>
      </div>
      <div id="caseSwitcherError" class="case-switcher-error" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const list = overlay.querySelector('#claimtraceCaseList');
  const error = overlay.querySelector('#caseSwitcherError');
  try {
    const cases = await listCases();
    if (!cases.length) {
      list.innerHTML = '<div class="small-note">No cases exist in this tenant yet.</div>';
    } else {
      list.innerHTML = cases.map((item) => `
        <button class="case-row" type="button" data-case-id="${esc(item.id)}">
          <span><strong>${esc(item.title)}</strong><small>${esc(item.id)} · ${esc(item.status)}</small></span>
          <span class="case-count">${item.evidence_count} evidence</span>
        </button>
      `).join('');
      list.querySelectorAll('.case-row').forEach((row) => {
        row.addEventListener('click', async () => {
          const caseId = row.dataset.caseId;
          try {
            const caseRecord = await getCase(caseId);
            sessionStorage.setItem(CASE_KEY, caseRecord.id);
            overlay.remove();
            await refreshCase(caseRecord);
          } catch (switchError) {
            error.textContent = switchError instanceof Error ? switchError.message : 'Unable to open case';
          }
        });
      });
    }
  } catch (listError) {
    error.textContent = listError instanceof Error ? listError.message : 'Unable to load cases';
  }

  overlay.querySelector('#newCaseButton').addEventListener('click', async () => {
    const title = window.prompt('Case title', 'New ClaimTrace investigation');
    if (!title?.trim()) return;
    try {
      const caseRecord = await createCase({ title: title.trim() });
      sessionStorage.setItem(CASE_KEY, caseRecord.id);
      overlay.remove();
      await refreshCase(caseRecord);
    } catch (createError) {
      error.textContent = createError instanceof Error ? createError.message : 'Unable to create case';
    }
  });
  overlay.querySelector('#closeCaseButton').addEventListener('click', () => overlay.remove());
};

const enableApiMode = async () => {
  if (!isApiConfigured()) return;
  await waitForWorkspace();
  let user;
  if (getStoredToken()) {
    try {
      user = await getMe();
    } catch {
      clearStoredToken();
      sessionStorage.removeItem(CASE_KEY);
    }
  }
  if (!user) user = await showAuth();

  const cases = await listCases();
  let caseRecord = null;
  const savedCaseId = sessionStorage.getItem(CASE_KEY);
  if (savedCaseId) {
    try { caseRecord = await getCase(savedCaseId); } catch { sessionStorage.removeItem(CASE_KEY); }
  }
  if (!caseRecord && cases.length) {
    caseRecord = cases[0];
    sessionStorage.setItem(CASE_KEY, caseRecord.id);
  }
  if (!caseRecord) {
    caseRecord = await createCase({ title: 'ClaimTrace investigation — Johannesburg motor collision', incident_at: new Date('2026-08-18T12:31:50Z').toISOString(), location: { lat: -26.2466, lon: 28.0205 } });
    sessionStorage.setItem(CASE_KEY, caseRecord.id);
  }

  const refreshCase = async (selectedCase) => {
    setBanner(`${user.email} · ${user.tenant_id} · ${selectedCase.id}`);
    const casePill = document.querySelector('.case-pill');
    if (casePill) casePill.textContent = selectedCase.id;
    const title = document.querySelector('.topbar h1');
    if (title) title.textContent = selectedCase.title;
    const footerBadge = document.querySelector('.footer-badge');
    if (footerBadge) footerBadge.textContent = 'API PILOT';
    const registerNote = document.querySelector('#evidenceRegister')?.parentElement?.querySelector('.small-note');
    if (registerNote) registerNote.textContent = 'Connected evidence intake: original bytes are retained by the ClaimTrace API and server-side SHA-256 is recorded at ingestion. Capture time is only asserted when supplied by source metadata or investigator input.';
    installApiIntake(selectedCase.id);
    installReportAction(selectedCase.id);
    renderApiEvidence(await listEvidence(selectedCase.id));

    try {
      const telemetry = await listTelemetry(selectedCase.id);
      const assessment = renderTelemetryPanel(telemetry);
      if (assessment && typeof window.claimtraceRenderTelemetry === 'function') {
        window.claimtraceRenderTelemetry({ points: telemetry, segments: assessment.segments });
      }
    } catch (telemetryError) {
      const panel = document.querySelector('#telemetryPanel');
      if (panel) {
        panel.hidden = false;
        panel.className = 'panel-block telemetry-panel';
        panel.innerHTML = '<div class="section-kicker">LIVE RECONSTRUCTION INPUT</div><div class="telemetry-quality">No persisted telemetry available for this case yet.</div>';
      }
      window.claimtraceClearTelemetry?.();
    }
  };

  await refreshCase(caseRecord);

  const actions = document.querySelector('.top-actions');
  if (actions) {
    const existing = document.querySelector('#caseSwitcherButton');
    existing?.remove();
    const button = document.createElement('button');
    button.id = 'caseSwitcherButton';
    button.className = 'ghost-btn api-case-btn';
    button.textContent = 'CASES';
    button.title = 'Switch investigation case';
    button.addEventListener('click', () => mountCaseSwitcher(refreshCase));
    actions.insertBefore(button, actions.firstChild);
  }
};

window.addEventListener('load', () => {
  enableApiMode().catch((error) => {
    const status = document.querySelector('#intakeStatus');
    if (status) status.textContent = `API MODE FAILED · ${error instanceof Error ? error.message : 'Unknown error'}`;
  });
});
