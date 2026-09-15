import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles.css';
import { createEvidenceRecord, hashBytes, validateEvidenceRecord } from './evidence/intake.js';

const INCIDENT = {
  id: 'CLM-DEMO-0001',
  title: 'Synthetic motor collision — Johannesburg',
  status: 'INVESTIGATION',
  location: { lon: 28.0205, lat: -26.2466 },
  localTime: '2026-08-18 14:31:50 SAST',
  synthetic: true,
};

const EVIDENCE = [];
const STAGES = [
  ['evidence', '01', 'Evidence', 'Collect and verify source material'],
  ['timeline', '02', 'Timeline', 'Order observations by time'],
  ['reconstruction', '03', 'Reconstruction', 'Visualise supported movement'],
  ['findings', '04', 'Findings', 'Separate supported from unknown'],
  ['report', '05', 'Report', 'Prepare the investigation record'],
];

const app = document.querySelector('#app');
app.innerHTML = `
  <aside class="rail">
    <div class="brand-mark">CT</div>
    <div class="rail-label">CLAIMTRACE</div>
    <nav class="rail-nav" aria-label="Investigation workflow">
      ${STAGES.map(([id, number, label, description]) => `
        <button class="rail-btn" data-stage="${id}" title="${description}" aria-label="${number} ${label}">
          <span class="rail-number">${number}</span><span class="rail-icon">${label.slice(0, 1)}</span>
        </button>
      `).join('')}
    </nav>
    <div class="rail-spacer"></div>
    <div class="rail-footer">INSURANCE<br/>INVESTIGATION</div>
  </aside>

  <main class="workspace">
    <header class="topbar">
      <div class="topbar-title">
        <div class="eyebrow">PHYSICAL-WORLD EVIDENCE INTELLIGENCE</div>
        <h1>${INCIDENT.title}</h1>
        <div class="case-context"><span class="case-context-label">CASE</span><span class="case-pill">${INCIDENT.id}</span><span class="case-location">${INCIDENT.localTime} · Johannesburg, South Africa</span></div>
      </div>
      <div class="top-actions"><span class="status-pill"><span class="status-dot"></span>${INCIDENT.status}</span></div>
    </header>

    <section class="workflow-nav" aria-label="Case workflow">
      <div class="workflow-intro"><span class="workflow-kicker">INVESTIGATION WORKFLOW</span><span class="workflow-sub">Source evidence first. Reconstruction only from evidence.</span></div>
      <div class="workflow-steps">
        ${STAGES.map(([id, number, label, description], index) => `
          <button class="workflow-step ${index === 0 ? 'active' : ''}" data-stage="${id}">
            <span class="workflow-step-number">${number}</span>
            <span><strong>${label}</strong><small>${description}</small></span>
          </button>${index < STAGES.length - 1 ? '<span class="workflow-arrow">→</span>' : ''}
        `).join('')}
      </div>
    </section>

    <section class="screen-stack">
      <section class="screen" data-screen="evidence">
        <div class="screen-header"><div><div class="screen-kicker">STEP 01 · SOURCE EVIDENCE</div><h2>Build the evidence record before making a reconstruction.</h2><p>Upload the material an investigator is actually relying on. ClaimTrace records provenance and never infers capture time from filesystem metadata.</p></div><div class="screen-status"><span class="mini-chip" id="evidenceCountChip">0 ITEMS</span><span class="status-caption">SOURCE MATERIAL</span></div></div>
        <div class="evidence-layout">
          <section class="card evidence-intake-card">
            <div class="card-header"><div><div class="section-kicker">ADD EVIDENCE</div><h3>Start with the original source</h3></div><span class="card-badge">CHAIN OF CUSTODY</span></div>
            <div class="upload-grid">
              <button class="upload-tile" id="addVideoEvidence" type="button"><span class="upload-icon">▶</span><strong>Video evidence</strong><small>Dashcam, CCTV or authorised recording</small></button>
              <button class="upload-tile" id="addTelemetryEvidence" type="button"><span class="upload-icon">⌁</span><strong>GPS / telematics</strong><small>CSV or exported vehicle telemetry</small></button>
              <button class="upload-tile" id="addDocumentEvidence" type="button"><span class="upload-icon">▤</span><strong>Documents / images</strong><small>Reports, photographs, statements</small></button>
            </div>
            <div class="intake-form"><div class="intake-row">
              <label><span>Evidence type</span><select id="evidenceType" class="intake-select"><option>DASHCAM</option><option>CCTV</option><option>PHOTO</option><option>POLICE_REPORT</option><option>TELEMATICS</option><option>OTHER</option></select></label>
              <label class="capture-time-field"><span>Video clock start <em>optional</em></span><input id="demoVideoClock" class="intake-select" type="text" placeholder="ISO-8601 + timezone" /></label>
              <button id="addEvidence" class="primary-btn" type="button">UPLOAD TO CASE</button>
              <input id="evidenceFile" type="file" hidden accept="video/*,image/*,application/pdf,.pdf,.csv,text/csv" />
            </div><div id="intakeStatus" class="intake-status">No source evidence has been registered yet.</div></div>
          </section>
          <section class="card evidence-register-card"><div class="card-header"><div><div class="section-kicker">EVIDENCE REGISTER</div><h3>Provenance chain</h3></div><span class="card-badge">TRACEABLE</span></div><div id="evidenceRegister" class="evidence-register empty-register"><div class="empty-state"><div class="empty-state-icon">+</div><strong>No evidence registered</strong><p>Add the original source file first. Derived findings should not exist without source evidence.</p></div></div></section>
        </div>
        <div class="evidence-principles"><div><strong>What ClaimTrace records</strong><span>Original bytes</span><span>SHA-256</span><span>Source/type</span><span>Capture-time assertion</span><span>Audit trail</span></div></div>
      </section>

      <section class="screen" data-screen="timeline" hidden>
        <div class="screen-header"><div><div class="screen-kicker">STEP 02 · EVENT TIMELINE</div><h2>Establish what happened, and when.</h2><p>Every event should point back to source material or be explicitly marked as derived.</p></div><div class="screen-actions"><span class="mini-chip" id="timelineCountChip">0 EVENTS</span></div></div>
        <div class="timeline-layout"><section class="card timeline-card"><div class="card-header"><div><div class="section-kicker">CHRONOLOGY</div><h3>Evidence-linked sequence</h3></div><span class="card-badge">SOURCE → TIME</span></div><div class="timeline" id="timeline"><div class="empty-state compact"><strong>No events yet</strong><p>Upload evidence to begin building the chronology.</p></div></div></section><aside class="card timeline-explain"><div class="section-kicker">INVESTIGATOR TEST</div><h3>Why does this event exist?</h3><p>Select an event to inspect the evidence behind it. ClaimTrace should never turn a derived timestamp into a source fact.</p><div class="explain-box"><span>SUPPORTED</span><strong>Source evidence exists.</strong></div><div class="explain-box derived"><span>DERIVED</span><strong>Calculated from one or more source records.</strong></div><div class="explain-box unknown"><span>UNKNOWN</span><strong>Evidence is insufficient or unresolved.</strong></div></aside></div>
      </section>

      <section class="screen" data-screen="reconstruction" hidden>
        <div class="screen-header"><div><div class="screen-kicker">STEP 03 · SPATIOTEMPORAL RECONSTRUCTION</div><h2>Visualise only what the evidence supports.</h2><p>The 3D scene is a reconstruction layer. It is not recorded crash footage and it does not determine legal liability.</p></div><div class="screen-actions"><button id="fitScene" class="ghost-btn" type="button">FIT SCENE</button><span class="mini-chip">RECONSTRUCTION</span></div></div>
        <div class="reconstruction-layout">
          <section class="card reconstruction-card">
            <div id="cesiumContainer" class="map"></div><div id="mapStatus" class="map-status" hidden></div>
            <div class="map-hud top-left"><div class="hud-title">RECONSTRUCTION VIEW</div><div class="hud-sub">Johannesburg · South Africa</div></div>
            <div class="map-hud bottom-left"><div id="syntheticLegendVehicleA" class="legend-row" hidden><span class="legend-line a"></span> Demonstration Vehicle A trajectory</div><div id="syntheticLegendVehicleB" class="legend-row" hidden><span class="legend-line b"></span> Demonstration Vehicle B trajectory</div><div id="syntheticLegendImpact" class="legend-row" hidden><span class="legend-point"></span> Demonstration impact estimate</div><div id="liveTelemetryLegend" class="legend-row" hidden><span class="legend-line live"></span> Evidence-linked telemetry</div></div>
            <div class="reconstruction-stamp">RECONSTRUCTION — NOT ACTUAL CRASH FOOTAGE</div>
            <div class="reconstruction-empty" id="reconstructionEmpty"><div class="reconstruction-empty-card"><span class="screen-kicker">WAITING FOR SOURCE EVIDENCE</span><strong>No evidence-backed reconstruction is available yet.</strong><p>Import telemetry or register source media first.</p><button class="ghost-btn" data-stage="evidence" type="button">GO TO EVIDENCE</button></div></div>
          </section>
          <aside class="reconstruction-side">
            <div class="card reconstruction-legend-card"><div class="section-kicker">INTERPRETATION</div><div class="legend-definition"><span class="definition-dot source"></span><div><strong>Source-linked</strong><small>Directly tied to uploaded evidence.</small></div></div><div class="legend-definition"><span class="definition-dot derived"></span><div><strong>Derived</strong><small>Calculated from one or more source records.</small></div></div><div class="legend-definition"><span class="definition-dot unknown"></span><div><strong>Unresolved</strong><small>Not established by the current evidence.</small></div></div></div>
            <div class="card reconstruction-input-card" id="telemetryWorkspace"><div id="telemetryPanel" hidden></div><div class="empty-state compact" id="reconstructionInputEmpty"><strong>No telemetry imported</strong><p>GPS / telematics will appear here after source evidence is registered.</p><button class="ghost-btn" data-stage="evidence" type="button">ADD SOURCE EVIDENCE</button></div></div>
          </aside>
        </div>
        <div id="videoSyncPanel" class="card video-panel" hidden></div>
      </section>

      <section class="screen" data-screen="findings" hidden>
        <div class="screen-header"><div><div class="screen-kicker">STEP 04 · INVESTIGATOR FINDINGS</div><h2>Separate what is supported from what is not established.</h2><p>ClaimTrace assists the investigation. The human investigator remains responsible for the final finding.</p></div><div class="screen-actions"><span class="mini-chip">HUMAN REVIEW REQUIRED</span></div></div>
        <div class="findings-layout"><section class="card findings-card"><div class="card-header"><div><div class="section-kicker">FINDINGS</div><h3>Evidence-backed assessment</h3></div><span class="card-badge">NO AUTOMATED LIABILITY DECISION</span></div><div id="claims" class="claims"><div class="empty-state compact"><strong>No findings have been established.</strong><p>Findings should be recorded only after supporting evidence and unresolved questions have been reviewed.</p></div></div></section><aside class="card uncertainty-card"><div class="section-kicker">UNCERTAINTY</div><h3>What remains unanswered?</h3><textarea id="investigatorNotes" placeholder="Record unresolved questions, assumptions, clock issues or further evidence required."></textarea><div class="small-note">These notes are investigator observations. They do not become source facts unless supported by evidence.</div></aside></div>
      </section>

      <section class="screen" data-screen="report" hidden>
        <div class="screen-header"><div><div class="screen-kicker">STEP 05 · INVESTIGATION REPORT</div><h2>Package the investigation into one traceable record.</h2><p>The report connects findings back to evidence, timeline, reconstruction and audit trail.</p></div><div class="screen-actions"><button class="ghost-btn" id="reportStageButton" type="button">EXPORT REPORT</button></div></div>
        <div class="report-layout"><section class="card report-preview"><div class="report-cover"><div class="brand-mark small">CT</div><div><div class="section-kicker">CLAIMTRACE INVESTIGATION REPORT</div><h3>${INCIDENT.title}</h3><p>${INCIDENT.id} · Investigator evidence reconstruction</p></div></div><div class="report-sections"><div><span>01</span><strong>Case & source evidence</strong><small>Original files, provenance, hashes</small></div><div><span>02</span><strong>Event timeline</strong><small>Chronology with source/derived status</small></div><div><span>03</span><strong>Reconstruction</strong><small>Spatial and temporal evidence view</small></div><div><span>04</span><strong>Findings & uncertainty</strong><small>Human-reviewed assessment</small></div><div><span>05</span><strong>Audit trail</strong><small>Case activity and custody records</small></div></div></section><aside class="card report-checklist"><div class="section-kicker">REPORT READINESS</div><div class="readiness-row"><span class="readiness-dot"></span><div><strong>Source evidence</strong><small id="readinessEvidence">Awaiting evidence</small></div></div><div class="readiness-row"><span class="readiness-dot"></span><div><strong>Timeline</strong><small id="readinessTimeline">Awaiting evidence events</small></div></div><div class="readiness-row"><span class="readiness-dot"></span><div><strong>Reconstruction</strong><small id="readinessReconstruction">Awaiting source-backed movement data</small></div></div><div class="readiness-row"><span class="readiness-dot"></span><div><strong>Investigator review</strong><small>Human decision remains required</small></div></div><button class="primary-btn full" id="reportStageButtonSecondary" type="button">EXPORT INVESTIGATION REPORT</button></aside></div>
      </section>
    </section>
    <footer class="footer-bar"><div><span class="footer-badge">API PILOT</span> Source evidence is the system of record. Reconstruction is evidence-linked and explicitly non-footage.</div><div>ClaimTrace · Insurance physical-world evidence intelligence</div></footer>
  </main>
`;

let viewer = null;
let sceneRectangle = null;
let viewerInitialized = false;
let liveTelemetryEntities = [];
let syntheticSceneEntities = [];
let syntheticSceneVisible = false;

const mapStatus = document.querySelector('#mapStatus');
const fitSceneButton = document.querySelector('#fitScene');
const reconstructionEmpty = document.querySelector('#reconstructionEmpty');
const reconstructionInputEmpty = document.querySelector('#reconstructionInputEmpty');

const expandSceneRectangle = (rectangle, paddingDegrees = 0.006) => {
  const padding = Cesium.Math.toRadians(paddingDegrees);
  return new Cesium.Rectangle(rectangle.west - padding, rectangle.south - padding, rectangle.east + padding, rectangle.north + padding);
};

const toCartesian = (lon, lat, height = 8) => Cesium.Cartesian3.fromDegrees(lon, lat, height);
const finitePoint = (point) => Number.isFinite(Number(point?.lon)) && Number.isFinite(Number(point?.lat));

const showMapFallback = (reason) => {
  if (!mapStatus) return;
  mapStatus.hidden = false;
  mapStatus.textContent = `MAP LAYER UNAVAILABLE — INVESTIGATION WORKFLOW REMAINS ACTIVE${reason ? ` · ${reason}` : ''}`;
  if (fitSceneButton) fitSceneButton.disabled = true;
};

const setSyntheticSceneVisibility = (visible) => {
  syntheticSceneVisible = Boolean(visible) && !window.claimtraceApiMode;
  syntheticSceneEntities.forEach((entity) => { entity.show = syntheticSceneVisible; });
  ['syntheticLegendVehicleA','syntheticLegendVehicleB','syntheticLegendImpact'].forEach((id) => {
    const el = document.querySelector(`#${id}`);
    if (el) el.hidden = !syntheticSceneVisible;
  });
};

const clearLiveTelemetry = () => {
  if (!viewer) return;
  liveTelemetryEntities.forEach((entity) => viewer.entities.remove(entity));
  liveTelemetryEntities = [];
  const legend = document.querySelector('#liveTelemetryLegend');
  if (legend) legend.hidden = true;
};

const addSyntheticEntity = (entity) => { if (entity) syntheticSceneEntities.push(entity); return entity; };
const addTrajectory = (id, points, color) => addSyntheticEntity(viewer.entities.add({ id, polyline: { positions: points.map(([lon, lat]) => toCartesian(lon, lat, 10)), width: 5, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.15, color: Cesium.Color.fromCssColorString(color) }), clampToGround: false } }));

const initViewer = () => {
  if (viewerInitialized) return viewer;
  viewerInitialized = true;
  try {
    viewer = new Cesium.Viewer('cesiumContainer', { animation:false, timeline:false, baseLayerPicker:false, geocoder:false, homeButton:false, sceneModePicker:false, navigationHelpButton:false, fullscreenButton:false, selectionIndicator:false, infoBox:false, terrainProvider:new Cesium.EllipsoidTerrainProvider(), imageryProvider:false });
    viewer.scene.globe.enableLighting = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07121f');
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#132333');
    viewer.camera.flyTo({ destination: toCartesian(INCIDENT.location.lon, INCIDENT.location.lat, 12000), duration: 0.4 });
    return viewer;
  } catch (error) {
    viewerInitialized = false;
    console.warn('ClaimTrace map initialization fallback:', error);
    showMapFallback('renderer initialization failed');
    return null;
  }
};

const renderDemoScene = () => {
  const cesium = initViewer();
  if (!cesium || window.claimtraceApiMode) return;
  if (syntheticSceneEntities.length) return;
  const a = [[28.0147,-26.2410],[28.0168,-26.2420],[28.0188,-26.2432],[28.0205,-26.2466]];
  const b = [[28.0246,-26.2490],[28.0230,-26.2483],[28.0216,-26.2474],[28.0205,-26.2466]];
  addTrajectory('demo-vehicle-a', a, '#4ab4ff');
  addTrajectory('demo-vehicle-b', b, '#ffbe5c');
  addSyntheticEntity(cesium.entities.add({ id:'demo-impact', position:toCartesian(INCIDENT.location.lon, INCIDENT.location.lat, 12), point:{pixelSize:14,color:Cesium.Color.fromCssColorString('#ff735c'),outlineColor:Cesium.Color.WHITE,outlineWidth:2}, label:{text:'DEMO IMPACT',font:'12px monospace',fillColor:Cesium.Color.WHITE,showBackground:true,backgroundColor:Cesium.Color.fromCssColorString('#101923').withAlpha(0.88),pixelOffset:new Cesium.Cartesian2(0,-26)} }));
  [a[0],b[0]].forEach(([lon,lat],i)=>addSyntheticEntity(cesium.entities.add({id:`demo-vehicle-${i}`,position:toCartesian(lon,lat,10),point:{pixelSize:9,color:Cesium.Color.fromCssColorString(i===0?'#4ab4ff':'#ffbe5c')},label:{text:i===0?'DEMO VEHICLE A':'DEMO VEHICLE B',font:'11px monospace',fillColor:Cesium.Color.WHITE,showBackground:true,backgroundColor:Cesium.Color.BLACK.withAlpha(0.65),pixelOffset:new Cesium.Cartesian2(12,0)}})));
  const points = [...a,...b].map(([lon,lat])=>Cesium.Cartographic.fromDegrees(lon,lat));
  sceneRectangle = Cesium.Rectangle.fromCartographicArray(points);
  setSyntheticSceneVisibility(true);
  cesium.camera.flyTo({destination:expandSceneRectangle(sceneRectangle),duration:0.6});
};

const updateReconstructionState = (hasEvidence, hasTelemetry = false) => {
  const ready = Boolean(hasTelemetry);
  if (reconstructionEmpty) reconstructionEmpty.hidden = ready;
  if (reconstructionInputEmpty) reconstructionInputEmpty.hidden = ready;
  if (!ready && !window.claimtraceApiMode) setSyntheticSceneVisibility(false);
};

const renderLiveTelemetry = ({ points = [], segments = [] } = {}) => {
  const cesium = initViewer();
  if (!cesium) return false;
  clearLiveTelemetry();
  if (!points.length) {
    updateReconstructionState(true, false);
    return false;
  }
  setSyntheticSceneVisibility(false);
  const byVehicle = new Map();
  points.filter(finitePoint).forEach((point) => { const key = point.vehicle_id ?? point.vehicleId ?? 'UNASSIGNED'; if (!byVehicle.has(key)) byVehicle.set(key, []); byVehicle.get(key).push(point); });
  const palette = ['#5be58f','#c084fc','#ffbe5c','#4ab4ff'];
  const allCartographic = [];
  byVehicle.forEach((vehiclePoints, vehicleId) => {
    const color = palette[liveTelemetryEntities.length % palette.length];
    const positions = vehiclePoints.map((point) => { allCartographic.push(Cesium.Cartographic.fromDegrees(Number(point.lon),Number(point.lat))); return toCartesian(Number(point.lon),Number(point.lat),16); });
    const entity = cesium.entities.add({id:`live-telemetry-${vehicleId}`,name:`Evidence-linked telemetry · ${vehicleId}`,polyline:{positions,width:7,material:new Cesium.PolylineGlowMaterialProperty({glowPower:0.05,color:Cesium.Color.fromCssColorString(color)}),clampToGround:false}});
    liveTelemetryEntities.push(entity);
    const first=vehiclePoints[0], last=vehiclePoints.at(-1);
    [first,last].filter(Boolean).forEach((point,index)=>liveTelemetryEntities.push(cesium.entities.add({position:toCartesian(Number(point.lon),Number(point.lat),18),point:{pixelSize:8,color:Cesium.Color.fromCssColorString(color),outlineColor:Cesium.Color.WHITE,outlineWidth:1},label:{text:`${vehicleId} ${index===0?'START':'END'}`,font:'10px monospace',fillColor:Cesium.Color.WHITE,showBackground:true,backgroundColor:Cesium.Color.BLACK.withAlpha(0.65),pixelOffset:new Cesium.Cartesian2(10,0)}})));
  });
  if (allCartographic.length) {
    sceneRectangle = Cesium.Rectangle.fromCartographicArray(allCartographic);
    cesium.camera.flyTo({destination:expandSceneRectangle(sceneRectangle),duration:0.7});
  }
  const lowQuality = segments.filter((segment)=>segment.quality==='LOW').length;
  const legend = document.querySelector('#liveTelemetryLegend'); if (legend) legend.hidden=false;
  if (mapStatus) { mapStatus.hidden=false; mapStatus.textContent=`${points.length} evidence-linked telemetry points · ${segments.length} trajectory segments · ${lowQuality} low-quality segments`; }
  updateReconstructionState(true,true);
  return true;
};

window.claimtraceRenderTelemetry = renderLiveTelemetry;
window.claimtraceClearTelemetry = clearLiveTelemetry;
window.claimtraceSetSyntheticVisibility = setSyntheticSceneVisibility;
window.claimtraceShowReconstruction = (hasEvidence, hasTelemetry = false) => updateReconstructionState(Boolean(hasEvidence), Boolean(hasTelemetry));

const setScreen = (stageId) => {
  const target = STAGES.some(([id]) => id === stageId) ? stageId : 'evidence';
  document.querySelectorAll('[data-screen]').forEach((screen)=>{ screen.hidden = screen.dataset.screen !== target; });
  document.querySelectorAll('[data-stage]').forEach((control)=>control.classList.toggle('active', control.dataset.stage===target));
  document.querySelector('.screen-stack')?.setAttribute('data-active-screen', target);
  if (target === 'reconstruction') {
    requestAnimationFrame(() => { const cesium = initViewer(); cesium?.resize(); if (window.claimtraceApiMode) { updateReconstructionState(document.querySelectorAll('.evidence-row').length > 0, false); } else { setSyntheticSceneVisibility(false); } });
  }
};

document.querySelectorAll('[data-stage]').forEach((control)=>control.addEventListener('click',()=>setScreen(control.dataset.stage)));

const renderTimeline = () => {
  const count = document.querySelector('#timelineCountChip'); if (count) count.textContent = `${EVIDENCE.length} EVENTS`;
  const el = document.querySelector('#timeline'); if (!el) return;
  if (!EVIDENCE.length) { el.innerHTML='<div class="empty-state compact"><strong>No events yet</strong><p>Upload evidence to begin building the chronology.</p></div>'; return; }
  el.innerHTML=EVIDENCE.map((event,index)=>`<button class="timeline-event ${index===EVIDENCE.length-1?'selected':''}" data-index="${index}"><div class="event-time">${event.time}</div><div class="event-line"></div><div class="event-body"><div class="event-title">${event.title}</div><div class="event-detail">${event.detail}</div><span class="confidence ${event.confidence.toLowerCase()}">${event.confidence}</span></div></button>`).join('');
  document.querySelectorAll('.timeline-event').forEach((el)=>el.addEventListener('click',()=>{document.querySelectorAll('.timeline-event').forEach(item=>item.classList.remove('selected'));el.classList.add('selected');}));
};

const renderClaims = () => { const el=document.querySelector('#claims'); if (el) el.innerHTML='<div class="empty-state compact"><strong>No findings have been established.</strong><p>Findings should be recorded only after the investigator has reviewed the supporting evidence and unresolved questions.</p></div>'; };

const renderEvidenceRegister = () => {
  const chip=document.querySelector('#evidenceCountChip'), el=document.querySelector('#evidenceRegister');
  if (chip) chip.textContent=`${EVIDENCE.length} ITEMS`;
  if (!el) return;
  if (!EVIDENCE.length) { el.className='evidence-register empty-register'; el.innerHTML='<div class="empty-state"><div class="empty-state-icon">+</div><strong>No evidence registered</strong><p>Add the original source file first. Derived findings should not exist without source evidence.</p></div>'; return; }
  el.className='evidence-register'; el.innerHTML=EVIDENCE.map(event=>`<div class="evidence-row"><div class="evidence-main"><span class="evidence-id">${event.id}</span><strong>${event.type}</strong><span class="evidence-title">${event.title}</span></div><div class="evidence-meta"><span>${event.source}</span><span>${event.confidence}</span><span class="provenance ${String(event.provenance||'SOURCE-LINKED').toLowerCase().replaceAll('-','')}">${event.provenance||'SOURCE-LINKED'}</span></div>${event.sha256?`<div class="evidence-hash">SHA-256 ${event.sha256.slice(0,16)}… · custody ${event.chainOfCustody?.length ?? 1}</div>`:''}</div>`).join('');
};

const updateReadiness = () => {
  const e=document.querySelector('#readinessEvidence'), t=document.querySelector('#readinessTimeline'), r=document.querySelector('#readinessReconstruction');
  if (e) e.textContent=EVIDENCE.length?`${EVIDENCE.length} source item${EVIDENCE.length===1?'':'s'} registered`:'Awaiting evidence';
  if (t) t.textContent=EVIDENCE.length?`${EVIDENCE.length} evidence-linked event${EVIDENCE.length===1?'':'s'}`:'Awaiting evidence events';
  if (r) r.textContent='Awaiting source-backed movement data';
};

renderTimeline(); renderClaims(); renderEvidenceRegister(); updateReadiness(); setScreen('evidence');

const addEvidenceButton=document.querySelector('#addEvidence');
const evidenceFileInput=document.querySelector('#evidenceFile');
const evidenceType=document.querySelector('#evidenceType');
const intakeStatus=document.querySelector('#intakeStatus');
addEvidenceButton?.addEventListener('click',()=>evidenceFileInput?.click());
document.querySelectorAll('.upload-tile').forEach((tile)=>tile.addEventListener('click',()=>{ const mapping={addVideoEvidence:'DASHCAM',addTelemetryEvidence:'TELEMATICS',addDocumentEvidence:'OTHER'}; evidenceType.value=mapping[tile.id]||'OTHER'; evidenceFileInput.click(); }));
evidenceFileInput?.addEventListener('change',async()=>{
  const [file]=evidenceFileInput.files??[]; if(!file)return; addEvidenceButton.disabled=true; intakeStatus.textContent=`HASHING ${file.name}…`;
  try {
    const sha256=await hashBytes(await file.arrayBuffer());
    const record=createEvidenceRecord({caseId:INCIDENT.id,type:evidenceType.value,source:'USER_UPLOAD',sourceRef:file.name,sha256,capturedAt:null,ingestedAt:new Date().toISOString(),mediaType:file.type||null,sizeBytes:file.size});
    const validation=validateEvidenceRecord(record); if(!validation.valid) throw new Error(validation.errors.join('; '));
    EVIDENCE.push({id:record.id,time:new Date(record.ingestedAt).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}),type:record.type,source:record.source,title:record.sourceRef,detail:`${record.mediaType||'file'} · ${record.sizeBytes??0} bytes · SHA-256 registered · capture time not asserted`,confidence:'MEDIUM',provenance:'SOURCE-LINKED',sha256:record.sha256,chainOfCustody:record.chainOfCustody});
    renderEvidenceRegister(); renderTimeline(); updateReadiness(); intakeStatus.textContent=`REGISTERED ${record.id} · SHA-256 ${record.sha256.slice(0,16)}… · capture time not asserted`; evidenceFileInput.value='';
  } catch(error) { intakeStatus.textContent=`INTAKE FAILED · ${error instanceof Error?error.message:'Unknown error'}`; } finally { addEvidenceButton.disabled=false; }
});

window.addEventListener('beforeunload',()=>viewer?.destroy());
