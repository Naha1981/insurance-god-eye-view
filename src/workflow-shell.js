import './workflow-shell.css';

const stages = [
  ['evidence', '01', 'Evidence', 'Collect & verify'],
  ['timeline', '02', 'Timeline', 'Order by time'],
  ['reconstruction', '03', 'Reconstruction', 'Visualise evidence'],
  ['findings', '04', 'Findings', 'Review & decide'],
  ['report', '05', 'Report', 'Export record'],
];

const app = document.querySelector('#app');
const topbar = document.querySelector('.topbar');
const grid = document.querySelector('.content-grid');
const mapCard = document.querySelector('.map-card');
const rightPanel = document.querySelector('.right-panel');
const summaryBlock = rightPanel?.querySelector('.summary-block');
const timelineBlock = rightPanel?.querySelector('#timeline')?.closest('.panel-block');
const claimsBlock = rightPanel?.querySelector('#claims')?.closest('.panel-block');
const evidenceBlock = rightPanel?.querySelector('#evidenceRegister')?.closest('.panel-block');
const telemetryPanel = document.querySelector('#telemetryPanel');

if (!app || !topbar || !grid || !mapCard || !rightPanel || !timelineBlock || !claimsBlock || !evidenceBlock || !telemetryPanel) {
  console.warn('ClaimTrace workflow shell: required workspace elements were not found.');
} else {
  const workflowNav = document.createElement('section');
  workflowNav.className = 'workflow-nav';
  workflowNav.setAttribute('aria-label', 'Investigation workflow');
  workflowNav.innerHTML = `
    <div class="workflow-intro">
      <span class="workflow-kicker">INVESTIGATION WORKFLOW</span>
      <span class="workflow-sub">Source evidence first. Reconstruction only from evidence.</span>
    </div>
    <div class="workflow-steps">
      ${stages.map(([id, number, label, sub], index) => `
        <button class="workflow-step ${index === 0 ? 'active' : ''}" data-workflow-stage="${id}" type="button">
          <span class="workflow-step-number">${number}</span>
          <span><strong>${label}</strong><small>${sub}</small></span>
        </button>
        ${index < stages.length - 1 ? '<span class="workflow-arrow">→</span>' : ''}
      `).join('')}
    </div>
  `;
  topbar.insertAdjacentElement('afterend', workflowNav);

  const caseContext = document.createElement('div');
  caseContext.className = 'case-context';
  caseContext.innerHTML = '<span class="case-context-label">CASE</span><span class="case-context-id"></span><span class="case-location">Johannesburg · South Africa</span>';
  topbar.querySelector('div:first-child')?.appendChild(caseContext);
  const casePill = topbar.querySelector('.case-pill');
  const contextId = caseContext.querySelector('.case-context-id');
  if (casePill && contextId) contextId.textContent = casePill.textContent || 'CASE';

  const screenStack = document.createElement('section');
  screenStack.className = 'screen-stack';

  const makeScreen = (id, number, kicker, title, copy) => {
    const screen = document.createElement('section');
    screen.className = 'screen';
    screen.dataset.workflowScreen = id;
    screen.hidden = id !== 'evidence';
    screen.innerHTML = `
      <div class="screen-header">
        <div>
          <div class="screen-kicker">STEP ${number} · ${kicker}</div>
          <h2>${title}</h2>
          <p>${copy}</p>
        </div>
        <div class="screen-actions"></div>
      </div>
      <div class="screen-body"></div>
    `;
    screenStack.appendChild(screen);
    return screen;
  };

  const evidenceScreen = makeScreen(
    'evidence',
    '01',
    'SOURCE EVIDENCE',
    'Build the evidence record before making a reconstruction.',
    'Start with the material an investigator is actually relying on. Original source files, provenance and capture-time assertions come first.'
  );
  const timelineScreen = makeScreen(
    'timeline',
    '02',
    'EVENT TIMELINE',
    'Establish what happened, and when.',
    'Every event should point back to source material or be explicitly marked as derived.'
  );
  const reconstructionScreen = makeScreen(
    'reconstruction',
    '03',
    'SPATIOTEMPORAL RECONSTRUCTION',
    'Visualise only what the evidence supports.',
    'The 3D scene is a reconstruction layer. It is not recorded crash footage and it does not determine legal liability.'
  );
  const findingsScreen = makeScreen(
    'findings',
    '04',
    'INVESTIGATOR FINDINGS',
    'Separate what is supported from what is not established.',
    'ClaimTrace assists the investigation. The human investigator remains responsible for the final finding.'
  );
  const reportScreen = makeScreen(
    'report',
    '05',
    'INVESTIGATION REPORT',
    'Package the investigation into one traceable record.',
    'The report connects evidence, chronology, reconstruction, findings and audit trail.'
  );

  const evidenceHeader = evidenceScreen.querySelector('.screen-actions');
  evidenceHeader.innerHTML = '<span class="mini-chip" id="workflowEvidenceCount">0 ITEMS</span><span class="status-caption">SOURCE MATERIAL</span>';
  const timelineHeader = timelineScreen.querySelector('.screen-actions');
  timelineHeader.innerHTML = '<span class="mini-chip" id="workflowTimelineCount">0 EVENTS</span>';
  const reconstructionHeader = reconstructionScreen.querySelector('.screen-actions');
  reconstructionHeader.innerHTML = '<button id="workflowFitScene" class="ghost-btn" type="button">FIT SCENE</button><span class="mini-chip">RECONSTRUCTION</span>';
  const findingsHeader = findingsScreen.querySelector('.screen-actions');
  findingsHeader.innerHTML = '<span class="mini-chip">HUMAN REVIEW REQUIRED</span>';
  const reportHeader = reportScreen.querySelector('.screen-actions');
  reportHeader.innerHTML = '<button id="workflowExportReport" class="ghost-btn" type="button">EXPORT REPORT</button>';

  const evidenceLayout = document.createElement('div');
  evidenceLayout.className = 'evidence-layout';
  const evidenceCard = document.createElement('section');
  evidenceCard.className = 'card workflow-card evidence-intake-card';
  evidenceCard.innerHTML = `
    <div class="card-header">
      <div><div class="section-kicker">ADD EVIDENCE</div><h3>Start with the original source</h3></div>
      <span class="card-badge">CHAIN OF CUSTODY</span>
    </div>
    <div class="workflow-upload-grid">
      <button class="workflow-upload-tile" data-evidence-shortcut="DASHCAM" type="button"><span>▶</span><strong>Video evidence</strong><small>Dashcam, CCTV or authorised recording</small></button>
      <button class="workflow-upload-tile" data-evidence-shortcut="TELEMATICS" type="button"><span>⌁</span><strong>GPS / telematics</strong><small>CSV or exported vehicle telemetry</small></button>
      <button class="workflow-upload-tile" data-evidence-shortcut="OTHER" type="button"><span>▤</span><strong>Documents / images</strong><small>Reports, photographs, statements</small></button>
    </div>
    <div class="workflow-note">Upload the source first. Derived observations belong later in the workflow.</div>
  `;
  const evidenceCardBody = evidenceBlock;
  evidenceCardBody.classList.add('workflow-moved-panel');
  evidenceCard.appendChild(evidenceCardBody);
  evidenceLayout.appendChild(evidenceCard);

  const evidenceRegisterCard = document.createElement('section');
  evidenceRegisterCard.className = 'card workflow-card evidence-register-card';
  const evidenceRegisterHeading = document.createElement('div');
  evidenceRegisterHeading.className = 'card-header';
  evidenceRegisterHeading.innerHTML = '<div><div class="section-kicker">EVIDENCE REGISTER</div><h3>Provenance chain</h3></div><span class="card-badge">TRACEABLE</span>';
  const evidenceRegister = document.querySelector('#evidenceRegister');
  evidenceRegisterCard.append(evidenceRegisterHeading, evidenceRegister);
  evidenceLayout.appendChild(evidenceRegisterCard);
  evidenceScreen.querySelector('.screen-body').appendChild(evidenceLayout);
  const evidencePrinciples = document.createElement('div');
  evidencePrinciples.className = 'evidence-principles';
  evidencePrinciples.innerHTML = '<div><strong>ClaimTrace records</strong><span>Original bytes</span><span>SHA-256</span><span>Source / type</span><span>Capture-time assertion</span><span>Audit trail</span></div>';
  evidenceScreen.querySelector('.screen-body').appendChild(evidencePrinciples);

  const timelineLayout = document.createElement('div');
  timelineLayout.className = 'timeline-layout';
  timelineBlock.classList.add('workflow-moved-panel');
  const timelineAside = document.createElement('aside');
  timelineAside.className = 'card timeline-explain';
  timelineAside.innerHTML = `
    <div class="section-kicker">INVESTIGATOR TEST</div>
    <h3>Why does this event exist?</h3>
    <p>Select an event to inspect the evidence behind it. ClaimTrace should never turn a derived timestamp into a source fact.</p>
    <div class="explain-box"><span>SUPPORTED</span><strong>Source evidence exists.</strong></div>
    <div class="explain-box derived"><span>DERIVED</span><strong>Calculated from one or more source records.</strong></div>
    <div class="explain-box unknown"><span>UNKNOWN</span><strong>Evidence is insufficient or unresolved.</strong></div>
  `;
  timelineLayout.append(timelineBlock, timelineAside);
  timelineScreen.querySelector('.screen-body').appendChild(timelineLayout);

  const reconstructionLayout = document.createElement('div');
  reconstructionLayout.className = 'reconstruction-layout';
  const mapWrap = document.createElement('section');
  mapWrap.className = 'card reconstruction-card';
  mapWrap.appendChild(mapCard);
  reconstructionLayout.appendChild(mapWrap);
  const reconstructionSide = document.createElement('aside');
  reconstructionSide.className = 'reconstruction-side';
  const interpretation = document.createElement('section');
  interpretation.className = 'card reconstruction-legend-card';
  interpretation.innerHTML = `
    <div class="section-kicker">INTERPRETATION</div>
    <div class="legend-definition"><span class="definition-dot source"></span><div><strong>Source-linked</strong><small>Directly tied to uploaded evidence.</small></div></div>
    <div class="legend-definition"><span class="definition-dot derived"></span><div><strong>Derived</strong><small>Calculated from one or more source records.</small></div></div>
    <div class="legend-definition"><span class="definition-dot unknown"></span><div><strong>Unresolved</strong><small>Not established by the current evidence.</small></div></div>
  `;
  reconstructionSide.appendChild(interpretation);
  const inputWrap = document.createElement('section');
  inputWrap.className = 'card reconstruction-input-card';
  const inputHeading = document.createElement('div');
  inputHeading.className = 'section-kicker';
  inputHeading.textContent = 'RECONSTRUCTION INPUT';
  inputWrap.appendChild(inputHeading);
  inputWrap.appendChild(telemetryPanel);
  const telemetryEmpty = document.createElement('div');
  telemetryEmpty.id = 'workflowTelemetryEmpty';
  telemetryEmpty.className = 'empty-state compact';
  telemetryEmpty.innerHTML = '<strong>No telemetry imported</strong><p>GPS / telematics will appear here after source evidence is registered.</p><button class="ghost-btn" data-workflow-stage="evidence" type="button">ADD SOURCE EVIDENCE</button>';
  inputWrap.appendChild(telemetryEmpty);
  reconstructionSide.appendChild(inputWrap);
  reconstructionLayout.appendChild(reconstructionSide);
  reconstructionScreen.querySelector('.screen-body').appendChild(reconstructionLayout);

  const findingsLayout = document.createElement('div');
  findingsLayout.className = 'findings-layout';
  claimsBlock.classList.add('workflow-moved-panel');
  findingsLayout.appendChild(claimsBlock);
  const uncertainty = document.createElement('aside');
  uncertainty.className = 'card uncertainty-card';
  uncertainty.innerHTML = `
    <div class="section-kicker">UNCERTAINTY</div>
    <h3>What remains unanswered?</h3>
    <textarea id="workflowInvestigatorNotes" placeholder="Record unresolved questions, assumptions, clock issues or further evidence required."></textarea>
    <div class="small-note">These notes are investigator observations. They do not become source facts unless supported by evidence.</div>
  `;
  findingsLayout.appendChild(uncertainty);
  findingsScreen.querySelector('.screen-body').appendChild(findingsLayout);

  const reportLayout = document.createElement('div');
  reportLayout.className = 'report-layout';
  const reportPreview = document.createElement('section');
  reportPreview.className = 'card report-preview';
  reportPreview.innerHTML = `
    <div class="report-cover"><div class="brand-mark small">CT</div><div><div class="section-kicker">CLAIMTRACE INVESTIGATION REPORT</div><h3>Investigation record</h3><p>Evidence → timeline → reconstruction → findings → audit trail</p></div></div>
    <div class="report-sections">
      <div><span>01</span><strong>Case & source evidence</strong><small>Original files, provenance and integrity records</small></div>
      <div><span>02</span><strong>Event timeline</strong><small>Chronology with source / derived status</small></div>
      <div><span>03</span><strong>Reconstruction</strong><small>Spatial and temporal evidence view</small></div>
      <div><span>04</span><strong>Findings & uncertainty</strong><small>Human-reviewed assessment</small></div>
      <div><span>05</span><strong>Audit trail</strong><small>Case activity and custody records</small></div>
    </div>
  `;
  const reportChecklist = document.createElement('aside');
  reportChecklist.className = 'card report-checklist';
  reportChecklist.innerHTML = `
    <div class="section-kicker">REPORT READINESS</div>
    <div class="readiness-row"><span class="readiness-dot"></span><div><strong>Source evidence</strong><small id="workflowReadinessEvidence">Awaiting evidence</small></div></div>
    <div class="readiness-row"><span class="readiness-dot"></span><div><strong>Timeline</strong><small id="workflowReadinessTimeline">Awaiting evidence events</small></div></div>
    <div class="readiness-row"><span class="readiness-dot"></span><div><strong>Reconstruction</strong><small id="workflowReadinessReconstruction">Awaiting source-backed movement data</small></div></div>
    <div class="readiness-row"><span class="readiness-dot"></span><div><strong>Investigator review</strong><small>Human decision remains required</small></div></div>
    <button class="primary-btn full" id="workflowExportReportSecondary" type="button">EXPORT INVESTIGATION REPORT</button>
  `;
  reportLayout.append(reportPreview, reportChecklist);
  reportScreen.querySelector('.screen-body').appendChild(reportLayout);

  const oldGrid = grid;
  oldGrid.replaceWith(screenStack);
  summaryBlock?.remove();
  rightPanel.remove();

  const rail = document.querySelector('.rail');
  if (rail) {
    const nav = rail.querySelector('.rail-nav');
    if (nav) {
      nav.innerHTML = stages.map(([id, number, label, sub]) => `
        <button class="rail-btn ${id === 'evidence' ? 'active' : ''}" data-workflow-stage="${id}" title="${sub}" aria-label="${number} ${label}"><span class="rail-number">${number}</span><span class="rail-icon">${label[0]}</span></button>
      `).join('');
    }
  }

  const syncCounts = () => {
    const evidenceText = document.querySelector('#evidenceCountChip')?.textContent || '0 ITEMS';
    const timelineText = document.querySelector('#timelineCountChip')?.textContent || '0 EVENTS';
    const workflowEvidence = document.querySelector('#workflowEvidenceCount');
    const workflowTimeline = document.querySelector('#workflowTimelineCount');
    if (workflowEvidence) workflowEvidence.textContent = evidenceText;
    if (workflowTimeline) workflowTimeline.textContent = timelineText;
    const evidenceReady = document.querySelector('#workflowReadinessEvidence');
    const timelineReady = document.querySelector('#workflowReadinessTimeline');
    if (evidenceReady) evidenceReady.textContent = evidenceText === '0 ITEMS' ? 'Awaiting evidence' : evidenceText;
    if (timelineReady) timelineReady.textContent = timelineText === '0 EVENTS' ? 'Awaiting evidence events' : timelineText;
  };

  const setStage = (stageId) => {
    const target = stages.some(([id]) => id === stageId) ? stageId : 'evidence';
    document.querySelectorAll('[data-workflow-stage]').forEach((element) => element.classList.toggle('active', element.dataset.workflowStage === target));
    document.querySelectorAll('[data-workflow-screen]').forEach((screen) => { screen.hidden = screen.dataset.workflowScreen !== target; });
    if (target === 'reconstruction') {
      window.setTimeout(() => window.claimtraceResizeMap?.(), 0);
      document.querySelector('#workflowFitScene')?.click();
    }
    syncCounts();
  };

  window.claimtraceSetWorkflowStage = setStage;
  document.querySelectorAll('[data-workflow-stage]').forEach((control) => control.addEventListener('click', () => setStage(control.dataset.workflowStage)));

  const workflowFit = document.querySelector('#workflowFitScene');
  const originalFit = document.querySelector('#fitScene');
  workflowFit?.addEventListener('click', () => originalFit?.click());
  const topFit = originalFit?.parentElement;
  if (topFit) {
    originalFit.hidden = true;
  }

  const exportFromStage = () => document.querySelector('#downloadReport')?.click() || document.querySelector('.api-report-btn')?.click();
  document.querySelector('#workflowExportReport')?.addEventListener('click', exportFromStage);
  document.querySelector('#workflowExportReportSecondary')?.addEventListener('click', exportFromStage);

  const apiConfigured = Boolean(import.meta.env.VITE_CLAIMTRACE_API_BASE);
  window.__claimtraceApiMode = apiConfigured;
  const originalSyntheticVisibility = window.claimtraceSetSyntheticVisibility;
  if (originalSyntheticVisibility) {
    window.claimtraceSetSyntheticVisibility = (visible) => originalSyntheticVisibility(apiConfigured ? false : visible);
    if (apiConfigured) originalSyntheticVisibility(false);
  }
  window.claimtraceShowReconstruction?.(apiConfigured ? false : true);

  const updateTelemetryEmpty = () => {
    const telemetryHasContent = Boolean(document.querySelector('#telemetryPanel:not([hidden]) .telemetry-grid'));
    const empty = document.querySelector('#workflowTelemetryEmpty');
    if (empty) empty.hidden = telemetryHasContent;
    const readiness = document.querySelector('#workflowReadinessReconstruction');
    if (readiness) readiness.textContent = telemetryHasContent ? 'Evidence-linked telemetry available' : 'Awaiting source-backed movement data';
  };

  const evidenceCountObserver = new MutationObserver(() => {
    syncCounts();
    const text = document.querySelector('#evidenceCountChip')?.textContent || '0 ITEMS';
    window.claimtraceShowReconstruction?.(text !== '0 ITEMS');
    updateTelemetryEmpty();
  });
  const evidenceChip = document.querySelector('#evidenceCountChip');
  if (evidenceChip) evidenceCountObserver.observe(evidenceChip, { childList: true, characterData: true, subtree: true });
  const telemetryPanelObserver = new MutationObserver(updateTelemetryEmpty);
  telemetryPanelObserver.observe(telemetryPanel, { attributes: true, childList: true, subtree: true });

  window.claimtraceResizeMap = () => {
    const cesiumWidget = document.querySelector('.cesium-widget');
    if (cesiumWidget) window.dispatchEvent(new Event('resize'));
  };
  syncCounts();
}
