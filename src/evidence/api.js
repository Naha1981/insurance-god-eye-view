const API_BASE = String(import.meta.env.VITE_CLAIMTRACE_API_BASE ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'claimtrace_access_token';

export const isApiConfigured = () => Boolean(API_BASE);
export const getConfiguredApiBase = () => API_BASE;
export const getStoredToken = () => sessionStorage.getItem(TOKEN_KEY);
export const clearStoredToken = () => sessionStorage.removeItem(TOKEN_KEY);

export const setStoredToken = (token) => sessionStorage.setItem(TOKEN_KEY, token);

const request = async (path, options = {}) => {
  if (!API_BASE) throw new Error('ClaimTrace API is not configured');
  const headers = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = `API request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
};

export const login = async (email, password) => {
  const body = await request('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(body.access_token);
  return body;
};

export const getMe = () => request('/v1/auth/me');

export const createCase = (payload) => request('/v1/cases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const getCase = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}`);

export const listEvidence = (caseId) => request(`/v1/cases/${encodeURIComponent(caseId)}/evidence`);

export const uploadEvidence = async (caseId, { file, type, capturedAt, source = 'USER_UPLOAD', claimedSha256 = null }) => {
  const form = new FormData();
  form.set('type', type);
  form.set('source', source);
  if (capturedAt) form.set('captured_at', capturedAt);
  if (claimedSha256) form.set('claimed_sha256', claimedSha256);
  form.set('file', file, file.name);
  return request(`/v1/cases/${encodeURIComponent(caseId)}/evidence/upload`, {
    method: 'POST',
    body: form,
  });
};

export const downloadReport = async (caseId) => {
  if (!API_BASE) throw new Error('ClaimTrace API is not configured');
  const headers = { Accept: 'text/html' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}/v1/cases/${encodeURIComponent(caseId)}/report`, { headers });
  if (!response.ok) throw new Error(`Report generation failed (${response.status})`);
  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
  return { blob, filename: filenameMatch?.[1] || `claimtrace-${caseId}-report.html` };
};
