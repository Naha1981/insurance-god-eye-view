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

const EVIDENCE = [
  { id: 'E-0001', time: '14:31:42', type: 'GPS', source: 'TELEMATICS', title: 'Vehicle A entered scene', detail: 'Estimated 62 km/h · synthetic telematics', confidence: 'HIGH', provenance: 'SOURCE-LINKED' },
  { id: 'E-0002', time: '14:31:46', type: 'GPS', source: 'TELEMATICS', title: 'Vehicle B approaches intersection', detail: 'Estimated 21 km/h · synthetic telematics', confidence: 'HIGH', provenance: 'SOURCE-LINKED' },
  { id: 'E-0003', time: '14:31:48', type: 'BRAKE', source: 'EDR', title: 'Vehicle A braking event', detail: 'Deceleration threshold exceeded', confidence: 'MEDIUM', provenance: 'SOURCE-LINKED' },
  { id: 'E-0004', time: '14:31:50', type: 'IMPACT', source: 'INFERENCE', title: 'Estimated collision point', detail: 'Trajectory intersection + impact timestamp', confidence: 'HIGH', provenance: 'DERIVED' },
  { id: 'E-0005', time: '14:31:52', type: 'GPS', source: 'TELEMATICS', title: 'Vehicles stationary', detail: 'Both trajectories converge at scene', confidence: 'HIGH', provenance: 'SOURCE-LINKED' },
];

const CLAIMS = [
  ['Vehicle A was travelling straight through the intersection.', 'SUPPORTED'],
  ['Vehicle A was travelling at 80 km/h.', 'NOT ESTABLISHED'],
  ['Vehicle B entered the intersection before the impact.', 'SUPPORTED'],
  ['Heavy rain caused the collision.', 'NOT ESTABLISHED'],
  ['The collision occurred around 14:31:50.', 'SUPPORTED'],
];

const app = document.querySelector('#app');
app.innerHTML = `
  <aside class="rail">
    <div class="brand-mark">CT</div>
    <div class="rail-label">CLAIMTRACE</div>
    <div class="rail-spacer"></div>
    <button class="rail-btn active" title="Investigation">⌁</button>
    <button class="rail-btn" title="Evidence">◈</button>
    <button class="rail-btn" title="Reports">▤</button>
  </aside>
  <main class="workspace">
    <header class="topbar">
      <div>
        <div class="eyebrow">PHYSICAL-WORLD EVIDENCE INTELLIGENCE</div>
        <h1>${INCIDENT.title}</h1>
      </div>
      <div class="top-actions">
        <span class="case-pill">${INCIDENT.id}</span>
        <span class="status-pill"><span class="status-dot"></span>${INCIDENT.status}</span>
        <button id="fitScene" class="ghost-btn">FIT SCENE</button>
      </div>
    </header>

    <section class="content-grid">
      <section class="map-card">
        <div id="cesiumContainer" class="map"></div>
        <div id="mapStatus" class="map-status" hidden></div>
        <div class="map-hud top-left">
          <div class="hud-title">RECONSTRUCTION VIEW</div>
          <div class="hud-sub">Johannesburg · South Africa</div>
        </div>
        <div class="map-hud bottom-left">
          <div class="legend-row"><span class="legend-line a"></span> Vehicle A trajectory</div>
          <div class="legend-row"><span class="legend-line b"></span> Vehicle B trajectory</div>
          <div class="legend-row"><span class="legend-point"></span> Estimated impact point</div>
          <div id="liveTelemetryLegend" class="legend-row" hidden><span class="legend-line live"></span> Persisted telemetry</div>
        </div>
        <div class="reconstruction-stamp">RECONSTRUCTION — NOT ACTUAL CRASH FOOTAGE</div>
      </section>

      <aside class="right-panel">
        <div class="panel-block summary-block">
          <div class="section-kicker">CASE SUMMARY</div>
          <div class="score-row"><strong>Evidence confidence</strong><span class="score">78%</span></div>
          <div class="confidence-bar"><span style="width:78%"></span></div>
          <div class="small-note">Prototype score from synthetic evidence. Production scoring will be source- and model-backed.</div>
        </div>

        <div class="panel-block">
          <div class="section-head"><div><div class="section-kicker">EVENT TIMELINE</div><h2>${EVIDENCE.length} evidence events</h2></div><span class="mini-chip">${INCIDENT.localTime}</span></div>
          <div class="timeline" id="timeline"></div>
        </div>

        <div class="panel-block">
          <div class="section-kicker">CLAIM VERSION TEST</div>
          <div id="claims" class="claims"></div>
        </div>

        <div class="panel-block" id="telemetryPanel" hidden></div>

        <div class="panel-block">
          <div class="section-head"><div><div class="section-kicker">EVIDENCE REGISTER</div><h2>Provenance chain</h2></div><span class="mini-chip" id="evidenceCountChip">${EVIDENCE.length} ITEMS</span></div>
          <div class="intake-controls">
            <select id="evidenceType" class="intake-select" aria-label="Evidence type">
              <option>DASHCAM</option>
              <option>CCTV</option>
              <option>PHOTO</option>
              <option>POLICE_REPORT</option>
              <option>TELEMATICS</option>
              <option>OTHER</option>
            </select>
            <button id="addEvidence" class="intake-btn">ADD EVIDENCE</button>
            <input id="evidenceFile" type="file" hidden />
          </div>
          <div id="intakeStatus" class="intake-status" aria-live="polite"></div>
          <div id="evidenceRegister" class="evidence-register"></div>
          <div class="small-note">Prototype intake hashes the selected file in-browser and registers metadata. Production intake will retain original bytes in immutable storage.</div>
        </div>
      </aside>
    </section>

    <footer class="footer-bar">
      <div><span class="footer-badge">SYNTHETIC DEMO</span> Every finding will be traceable to source evidence in production.</div>
      <div>Built on a Cesium + Vite geospatial foundation inspired by God's Eye View.</div>
    </footer>
  </main>
`;

const timelineEl = document.querySelector('#timeline');
timelineEl.innerHTML = EVIDENCE.map((event, index) => `
  <button class="timeline-event ${index === 3 ? 'selected' : ''}" data-index="${index}">
    <div class="event-time">${event.time}</div>
    <div class="event-line"></div>
    <div class="event-body"><div class="event-title">${event.title}</div><div class="event-detail">${event.detail}</div><span class="confidence ${event.confidence.toLowerCase()}">${event.confidence}</span></div>
  </button>
`).join('');

const claimsEl = document.querySelector('#claims');
claimsEl.innerHTML = CLAIMS.map(([claim, result]) => `
  <div class="claim-row"><div class="claim-text">${claim}</div><span class="claim-result ${result.toLowerCase().replaceAll(' ', '-')}">${result}</span></div>
`).join('');

const evidenceRegisterEl = document.querySelector('#evidenceRegister');
const evidenceCountChip = document.querySelector('#evidenceCountChip');
const renderEvidenceRegister = () => {
  evidenceCountChip.textContent = `${EVIDENCE.length} ITEMS`;
  evidenceRegisterEl.innerHTML = EVIDENCE.map((event) => `
    <div class="evidence-row">
      <div class="evidence-main"><span class="evidence-id">${event.id}</span><strong>${event.type}</strong><span class="evidence-title">${event.title}</span></div>
      <div class="evidence-meta"><span>${event.source}</span><span>${event.confidence}</span><span class="provenance ${String(event.provenance || 'SOURCE-LINKED').toLowerCase().replaceAll('-', '')}">${event.provenance || 'SOURCE-LINKED'}</span></div>
      ${event.sha256 ? `<div class="evidence-hash">SHA-256 ${event.sha256.slice(0, 16)}… · custody ${event.chainOfCustody?.length ?? 1}</div>` : ''}
    </div>
  `).join('');
};
renderEvidenceRegister();

document.querySelectorAll('.timeline-event').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.timeline-event').forEach((item) => item.classList.remove('selected'));
    el.classList.add('selected');
  });
});

const addEvidenceButton = document.querySelector('#addEvidence');
const evidenceFileInput = document.querySelector('#evidenceFile');
const evidenceType = document.querySelector('#evidenceType');
const intakeStatus = document.querySelector('#intakeStatus');
addEvidenceButton.addEventListener('click', () => evidenceFileInput.click());
evidenceFileInput.addEventListener('change', async () => {
  const [file] = evidenceFileInput.files ?? [];
  if (!file) return;
  addEvidenceButton.disabled = true;
  intakeStatus.textContent = `HASHING ${file.name}…`;
  try {
    const sha256 = await hashBytes(await file.arrayBuffer());
    const record = createEvidenceRecord({
      caseId: INCIDENT.id,
      type: evidenceType.value,
      source: 'USER_UPLOAD',
      sourceRef: file.name,
      sha256,
      capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      ingestedAt: new Date().toISOString(),
      mediaType: file.type || null,
      sizeBytes: file.size,
    });
    const validation = validateEvidenceRecord(record);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    EVIDENCE.push({
      id: record.id,
      time: new Date(record.capturedAt ?? record.ingestedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      type: record.type,
      source: record.source,
      title: record.sourceRef,
      detail: `${record.mediaType || 'file'} · ${record.sizeBytes ?? 0} bytes · SHA-256 registered`,
      confidence: 'MEDIUM',
      provenance: 'SOURCE-LINKED',
      sha256: record.sha256,
      chainOfCustody: record.chainOfCustody,
    });
    renderEvidenceRegister();
    intakeStatus.textContent = `REGISTERED ${record.id} · SHA-256 ${record.sha256.slice(0, 16)}…`;
    evidenceFileInput.value = '';
  } catch (error) {
    intakeStatus.textContent = `INTAKE FAILED · ${error instanceof Error ? error.message : 'Unknown error'}`;
  } finally {
    addEvidenceButton.disabled = false;
  }
});

const a = [
  [28.0147, -26.2410],
  [28.0168, -26.2420],
  [28.0188, -26.2432],
  [28.0205, -26.2466],
];

const b = [
  [28.0246, -26.2490],
  [28.0230, -26.2483],
  [28.0216, -26.2474],
  [28.0205, -26.2466],
];

let viewer = null;
let sceneRectangle = null;
let liveTelemetryEntities = [];

const mapStatus = document.querySelector('#mapStatus');
const fitSceneButton = document.querySelector('#fitScene');

const showMapFallback = (reason) => {
  mapStatus.hidden = false;
  mapStatus.textContent = `MAP LAYER UNAVAILABLE — EVIDENCE WORKSPACE REMAINS ACTIVE${reason ? ` · ${reason}` : ''}`;
  fitSceneButton.disabled = true;
};

const toCartesian = (lon, lat, height = 8) => Cesium.Cartesian3.fromDegrees(lon, lat, height);

const addTrajectory = (id, points, color) => {
  viewer.entities.add({
    id,
    polyline: {
      positions: points.map(([lon, lat]) => toCartesian(lon, lat, 10)),
      width: 5,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.15,
        color: Cesium.Color.fromCssColorString(color),
      }),
      clampToGround: false,
    },
  });
};

const clearLiveTelemetry = () => {
  if (!viewer) return;
  liveTelemetryEntities.forEach((entity) => viewer.entities.remove(entity));
  liveTelemetryEntities = [];
  const legend = document.querySelector('#liveTelemetryLegend');
  if (legend) legend.hidden = true;
};

const renderLiveTelemetry = ({ points = [], segments = [] } = {}) => {
  if (!viewer || !points.length) return false;
  clearLiveTelemetry();
  const byVehicle = new Map();
  points.forEach((point) => {
    const key = point.vehicle_id ?? point.vehicleId ?? 'UNASSIGNED';
    if (!byVehicle.has(key)) byVehicle.set(key, []);
    byVehicle.get(key).push(point);
  });
  const palette = ['#5be58f', '#c084fc', '#ffbe5c', '#4ab4ff'];
  let vehicleIndex = 0;
  byVehicle.forEach((vehiclePoints, vehicleId) => {
    const color = palette[vehicleIndex % palette.length];
    const positions = vehiclePoints.map((point) => toCartesian(point.lon, point.lat, 16));
    const entity = viewer.entities.add({
      id: `live-telemetry-${vehicleIndex}`,
      name: `Persisted telemetry · ${vehicleId}`,
      polyline: {
        positions,
        width: 7,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.05, color: Cesium.Color.fromCssColorString(color) }),
        clampToGround: false,
      },
    });
    liveTelemetryEntities.push(entity);
    const first = vehiclePoints[0];
    const last = vehiclePoints.at(-1);
    [first, last].forEach((point, index) => {
      const marker = viewer.entities.add({
        position: toCartesian(point.lon, point.lat, 18),
        point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(color), outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
        label: { text: `${vehicleId} ${index === 0 ? 'START' : 'END'}`, font: '10px monospace', fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(0.65), pixelOffset: new Cesium.Cartesian2(10, 0) },
      });
      liveTelemetryEntities.push(marker);
    });
    vehicleIndex += 1;
  });

  const lowQuality = segments.filter((segment) => segment.quality === 'LOW').length;
  const telemetryLegend = document.querySelector('#liveTelemetryLegend');
  if (telemetryLegend) telemetryLegend.hidden = false;
  const status = document.querySelector('#mapStatus');
  if (status) {
    status.hidden = false;
    status.textContent = `${points.length} persisted telemetry points rendered · ${segments.length} trajectory segments · ${lowQuality} low-quality segments`;
  }
  return true;
};

window.claimtraceRenderTelemetry = renderLiveTelemetry;
window.claimtraceClearTelemetry = clearLiveTelemetry;

try {
  viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    imageryProvider: false,
  });

  viewer.scene.globe.enableLighting = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07121f');
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#132333');

  const impact = toCartesian(INCIDENT.location.lon, INCIDENT.location.lat, 12);
  viewer.entities.add({
    id: 'incident',
    name: 'Estimated impact point',
    position: impact,
    point: { pixelSize: 14, color: Cesium.Color.fromCssColorString('#ff735c'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
    label: {
      text: 'EST. IMPACT',
      font: '12px monospace',
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#101923').withAlpha(0.88),
      pixelOffset: new Cesium.Cartesian2(0, -26),
    },
  });

  addTrajectory('vehicle-a', a, '#4ab4ff');
  addTrajectory('vehicle-b', b, '#ffbe5c');

  [a[0], b[0]].forEach(([lon, lat], i) => {
    viewer.entities.add({
      id: `vehicle-${i}`,
      position: toCartesian(lon, lat, 10),
      point: { pixelSize: 9, color: Cesium.Color.fromCssColorString(i === 0 ? '#4ab4ff' : '#ffbe5c') },
      label: { text: i === 0 ? 'VEHICLE A' : 'VEHICLE B', font: '11px monospace', fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(0.65), pixelOffset: new Cesium.Cartesian2(12, 0) },
    });
  });

  const scenePoints = [a, b].flat().map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat));
  sceneRectangle = Cesium.Rectangle.fromCartographicArray(scenePoints);
  viewer.camera.flyTo({ destination: Cesium.Rectangle.expand(sceneRectangle, 0.006), duration: 1.6 });
} catch (error) {
  console.warn('ClaimTrace map initialization fallback:', error);
  showMapFallback('renderer initialization failed');
}

fitSceneButton.addEventListener('click', () => {
  if (!viewer || !sceneRectangle) return;
  viewer.camera.flyTo({ destination: Cesium.Rectangle.expand(sceneRectangle, 0.006), duration: 1.1 });
});

window.addEventListener('beforeunload', () => viewer?.destroy());
