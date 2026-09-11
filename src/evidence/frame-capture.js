import { createFrameArtifact, createFrameReference, getVideoMetadata, listEvidence, listTelemetry } from './api.js';
import { normalizeVideoSync } from './video-sync.js';

const CASE_KEY = 'claimtrace_case_id';
let installedButton = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

const nearestTelemetryPoint = (telemetry, timestamp) => telemetry.reduce((best, point) => {
  if (!best) return point;
  return Math.abs(new Date(point.timestamp_utc || point.timestamp).getTime() - new Date(timestamp).getTime()) < Math.abs(new Date(best.timestamp_utc || best.timestamp).getTime() - new Date(timestamp).getTime()) ? point : best;
}, null);

const capturePng = (video) => new Promise((resolve, reject) => {
  if (!video.videoWidth || !video.videoHeight) {
    reject(new Error('Video frame dimensions are not available'));
    return;
  }
  const maxWidth = 1280;
  const width = Math.min(maxWidth, video.videoWidth);
  const height = Math.round(video.videoHeight * (width / video.videoWidth));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    reject(new Error('Canvas frame capture is unavailable'));
    return;
  }
  context.drawImage(video, 0, 0, width, height);
  canvas.toBlob((blob) => {
    if (!blob) reject(new Error('PNG frame encoding failed'));
    else resolve(blob);
  }, 'image/png');
});

const install = async () => {
  const panel = document.querySelector('#videoSyncPanel');
  const button = panel?.querySelector('#createFrameEvidence');
  const video = panel?.querySelector('#claimtraceEvidenceVideo');
  if (!panel || !button || !video || button === installedButton) return;
  installedButton = button;

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const frameStatus = panel.querySelector('#videoFrameStatus');
    button.disabled = true;
    button.textContent = 'CAPTURING FRAME…';
    try {
      const caseId = sessionStorage.getItem(CASE_KEY);
      if (!caseId) throw new Error('Active case is unavailable');
      const records = await listEvidence(caseId);
      const title = panel.querySelector('h2')?.textContent?.trim() || '';
      const evidence = records.find((record) => record.source_ref === title) || records.find((record) => record.type === 'DASHCAM' || record.type === 'CCTV');
      if (!evidence) throw new Error('Source video evidence could not be resolved');
      const metadata = await getVideoMetadata(caseId, evidence.id);
      const sync = normalizeVideoSync({ captureStartAt: metadata?.capture_start_at, frameRate: metadata?.frame_rate, offsetSeconds: 0 });
      if (!sync.captureStartAt || !sync.frameRate) throw new Error('Frame synchronization requires asserted capture start and frame rate');
      const timestamp = new Date(new Date(sync.captureStartAt).getTime() + video.currentTime * 1000).toISOString();
      const frameIndex = Math.max(0, Math.round(video.currentTime * sync.frameRate));
      const telemetry = await listTelemetry(caseId);
      const nearest = nearestTelemetryPoint(telemetry, timestamp);
      const blob = await capturePng(video);
      const artifact = await createFrameArtifact(caseId, { evidenceId: evidence.id, frameIndex, timestamp, blob });
      await createFrameReference(caseId, evidence.id, {
        frame_index: frameIndex,
        timestamp,
        nearest_telemetry_point_id: nearest?.id ?? null,
        note: 'Browser-extracted PNG frame persisted as a derived artifact from the authenticated source video.',
      });
      const thumbnailUrl = URL.createObjectURL(blob);
      const existingThumbnail = panel.querySelector('#frameArtifactThumbnail');
      existingThumbnail?.remove();
      const thumbnail = document.createElement('img');
      thumbnail.id = 'frameArtifactThumbnail';
      thumbnail.alt = `Persisted frame ${frameIndex}`;
      thumbnail.src = thumbnailUrl;
      thumbnail.style.cssText = 'display:block;width:100%;max-height:260px;object-fit:contain;margin-top:10px;border:1px solid #20384d;background:#000;';
      panel.querySelector('.video-frame-status')?.after(thumbnail);
      frameStatus.textContent = `PERSISTED FRAME ARTIFACT · ${artifact.id} · FRAME ${frameIndex} · ${timestamp} · PNG SHA-256 ${artifact.sha256.slice(0, 16)}…${nearest ? ` · nearest telemetry ${nearest.id}` : ''}`;
      button.textContent = 'CAPTURE FRAME AGAIN';
    } catch (error) {
      if (frameStatus) frameStatus.textContent = `FRAME EXTRACTION FAILED · ${esc(error instanceof Error ? error.message : 'Unknown error')}`;
      button.textContent = 'CREATE FRAME REFERENCE';
    } finally {
      button.disabled = false;
    }
  }, { capture: true });
};

const observer = new MutationObserver(() => { install().catch(() => {}); });
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', () => install().catch(() => {}));
