import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles.css';

const INCIDENT = {
  id: 'CLM-DEMO-0001',
  title: 'Synthetic motor collision — Johannesburg',
  status: 'INVESTIGATION',
  location: { lon: 28.0205, lat: -26.2466 },
  localTime: '2026-08-18 14:31:50 SAST',
  synthetic: true,
};

const EVIDENCE = [
  { time: '14:31:42', type: 'GPS', title: 'Vehicle A entered scene', detail: 'Estimated 62 km/h · source: synthetic telematics', confidence: 'HIGH' },
  { time: '14:31:46', type: 'GPS', title: 'Vehicle B approaches intersection', detail: 'Estimated 21 km/h · source: synthetic telematics', confidence: 'HIGH' },
  { time: '14:31:48', type: 'BRAKE', title: 'Vehicle A braking event', detail: 'Deceleration threshold exceeded', confidence: 'MEDIUM' },
  { time: '14:31:50', type: 'IMPACT', title: 'Estimated collision point', detail: 'Trajectory intersection + impact timestamp', confidence: 'HIGH' },
  { time: '14:31:52', type: 'GPS', title: 'Vehicles stationary', detail: 'Both trajectories converge at scene', confidence: 'HIGH' },
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
        <div class="map-hud top-left">
          <div class="hud-title">RECONSTRUCTION VIEW</div>
          <div class="hud-sub">Johannesburg · South Africa</div>
        </div>
        <div class="map-hud bottom-left">
          <div class="legend-row"><span class="legend-line a"></span> Vehicle A trajectory</div>
          <div class="legend-row"><span class="legend-line b"></span> Vehicle B trajectory</div>
          <div class="legend-row"><span class="legend-point"></span> Estimated impact point</div>
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
      </aside>
    </section>

    <footer class="footer-bar">
      <div><span class="footer-badge">SYNTHETIC DEMO</span> Every finding will be traceable to source evidence in production.</div>
      <div>Built on a Cesium + Vite geospatial foundation inspired by God's Eye View.</div>
    </footer>
  </main>
`;

const viewer = new Cesium.Viewer('cesiumContainer', {
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
  imageryProvider: new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/'
  }),
});

viewer.scene.globe.enableLighting = false;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07121f');
viewer.scene.skyAtmosphere.show = true;
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#132333');

const toCartesian = (lon, lat, height = 8) => Cesium.Cartesian3.fromDegrees(lon, lat, height);

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
const rect = Cesium.Rectangle.fromCartographicArray(scenePoints);
viewer.camera.flyTo({ destination: Cesium.Rectangle.expand(rect, 0.006), duration: 1.6 });

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

document.querySelectorAll('.timeline-event').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.timeline-event').forEach((item) => item.classList.remove('selected'));
    el.classList.add('selected');
  });
});

document.querySelector('#fitScene').addEventListener('click', () => {
  viewer.camera.flyTo({ destination: Cesium.Rectangle.expand(rect, 0.006), duration: 1.1 });
});

window.addEventListener('beforeunload', () => viewer.destroy());
