const API_BASE = String(import.meta.env.VITE_CLAIMTRACE_API_BASE ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'claimtrace_access_token';

export const isApiConfigured = () => Boolean(API_BASE);
export const getConfiguredApiBase = () => API_BASE;
export const getStoredToken = () => sessionStorage.getItem(TOKEN_KEY);
export const clearStoredToken = () => sessionStorage.removeItem(TOKEN_KEY);
export const setStoredToken = (token) => sessionStorage.setItem(TOKEN_KEY, token);

const request = async (path, options = {}) => {
  if (!API_BASE) throw new Error('ClaimTrace API is not configured');
  const headers = { Accept: 'application/json', ...(options.headers ?? {}) };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let detail = `API request failed (${response.status})`;
    try { detail = (await response.json()).detail ?? detail; } catch { /* preserve HTTP status */ }
    const error = new Error(detail); error.status = response.status; throw error;
  }
  return response.status === 204 ? null : response.json();
};

export const login = async (email, password) => {
  const body = await request('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  setStoredToken(body.access_token); return body;
};
export const getMe = () => request('/v1/auth/me');
export const listCases = () => request('/v1/cases');
export const createCase = (payload) => request('/v1/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const getCase = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}`);
export const listEvidence = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}/evidence`);
export const listTelemetry = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}/telemetry`);
export const listTelemetryProvenance = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}/telemetry/provenance`);
export const ingestTelemetry = (caseId, points) => request(`/v1/cases/${encodeURIComponent(caseId)}/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points }) });
export const registerVideoMetadata = (caseId, evidenceId, metadata) => request(`/v1/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/video-metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
export const getVideoMetadata = (caseId, evidenceId) => request(`/v1/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/video-metadata`);
export const createFrameReference = (caseId, evidenceId, payload) => request(`/v1/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/frame-reference`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const listFrameArtifacts = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}/frame-artifacts`);

export const importTelemetryCsv = async (caseId, { file, sourceTimezone = 'Africa/Johannesburg', source = 'GPS_UPLOAD' }) => {
  if (!file) throw new Error('Telemetry CSV file is required');
  const form = new FormData();
  form.set('source_timezone', sourceTimezone);
  form.set('source', source);
  form.set('file', file, file.name || 'telemetry.csv');
  return request(`/v1/cases/${encodeURIComponent(caseId)}/telemetry/import`, { method: 'POST', body: form });
};

export const createFrameArtifact = async (caseId, { evidenceId, frameIndex, timestamp, blob }) => {
  if (!blob) throw new Error('Frame image is required');
  const form = new FormData();
  form.set('evidence_id', evidenceId);
  form.set('frame_index', String(frameIndex));
  form.set('timestamp_utc', new Date(timestamp).toISOString());
  form.set('file', blob, `frame-${frameIndex}.png`);
  return request(`/v1/cases/${encodeURIComponent(caseId)}/frame-artifacts`, { method: 'POST', body: form });
};

export const getEvidenceArtifact = async (caseId, evidenceId) => {
  if (!API_BASE) throw new Error('ClaimTrace API is not configured');
  const headers = { Accept: '*/*' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}/v1/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/artifact`, { headers });
  if (!response.ok) {
    let detail = `Evidence artifact request failed (${response.status})`;
    try { detail = (await response.json()).detail ?? detail; } catch { /* preserve HTTP status */ }
    const error = new Error(detail); error.status = response.status; throw error;
  }
  return { blob: await response.blob(), mediaType: response.headers.get('Content-Type') || 'application/octet-stream' };
};

const readBrowserVideoMetadata = (file) => new Promise((resolve) => {
  if (!file?.type?.startsWith('video/') || typeof document === 'undefined' || typeof URL === 'undefined') {
    resolve(null);
    return;
  }
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);
  let settled = false;
  const timer = setTimeout(() => finish(null), 10_000);
  const finish = (metadata) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute('src');
    video.load();
    resolve(metadata);
  };
  video.preload = 'metadata';
  video.onloadedmetadata = () => finish({
    duration_seconds: Number.isFinite(video.duration) && video.duration >= 0 ? video.duration : null,
    width: video.videoWidth > 0 ? video.videoWidth : null,
    height: video.videoHeight > 0 ? video.videoHeight : null,
    metadata_source: 'BROWSER_MEDIA_ELEMENT',
    metadata_version: '1',
  });
  video.onerror = () => finish(null);
  video.src = objectUrl;
});

export const uploadEvidence = async (caseId, { file, type, capturedAt, source = 'USER_UPLOAD', claimedSha256 = null, videoCaptureStartAt = null }) => {
  const form = new FormData(); form.set('type', type); form.set('source', source); if (capturedAt) form.set('captured_at', capturedAt); if (claimedSha256) form.set('claimed_sha256', claimedSha256); form.set('file', file, file.name);
  const record = await request(`/v1/cases/${encodeURIComponent(caseId)}/evidence/upload`, { method: 'POST', body: form });
  if ((type === 'DASHCAM' || type === 'CCTV') && file?.type?.startsWith('video/')) {
    const metadata = await readBrowserVideoMetadata(file);
    if (metadata) {
      if (videoCaptureStartAt) metadata.capture_start_at = videoCaptureStartAt;
      try {
        await registerVideoMetadata(caseId, record.id, metadata);
      } catch {
        // Evidence is already registered; metadata enrichment is best-effort.
      }
    }
  }
  return record;
};

export const downloadReport = async (caseId) => {
  if (!API_BASE) throw new Error('ClaimTrace API is not configured');
  const headers = { Accept: 'text/html' }; const token = getStoredToken(); if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}/v1/cases/${encodeURIComponent(caseId)}/report`, { headers });
  if (!response.ok) throw new Error(`Report generation failed (${response.status})`);
  const blob = await response.blob(); const contentDisposition = response.headers.get('Content-Disposition') || ''; const filenameMatch = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  return { blob, filename: filenameMatch?.[1] || `claimtrace-${caseId}-report.html` };
};
