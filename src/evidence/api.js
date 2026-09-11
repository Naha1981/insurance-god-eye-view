const API_BASE = String(import.meta.env.VITE_CLAIMTRACE_API_BASE ?? '').replace(/\/$/, '');

export const isApiConfigured = () => Boolean(API_BASE);

const request = async (path, options = {}) => {
  if (!API_BASE) throw new Error('ClaimTrace API is not configured');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = `API request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new Error(detail);
  }

  return response.json();
};

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

export const getConfiguredApiBase = () => API_BASE;
