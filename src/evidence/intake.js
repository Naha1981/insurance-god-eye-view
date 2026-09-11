const REQUIRED_FIELDS = ['id', 'caseId', 'type', 'source', 'sourceRef', 'sha256', 'capturedAt', 'ingestedAt', 'chainOfCustody'];

const normalizeText = (value) => String(value ?? '').trim();

export const hashBytes = async (bytes) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const createEvidenceRecord = ({ caseId, type, source, sourceRef, sha256, capturedAt, ingestedAt, mediaType = null, sizeBytes = null }) => {
  const now = ingestedAt ?? new Date().toISOString();
  const record = {
    id: `E-${globalThis.crypto.randomUUID()}`,
    caseId: normalizeText(caseId),
    type: normalizeText(type).toUpperCase() || 'UNKNOWN',
    source: normalizeText(source).toUpperCase() || 'UNKNOWN',
    sourceRef: normalizeText(sourceRef) || null,
    sha256: normalizeText(sha256).toLowerCase() || null,
    capturedAt: capturedAt ?? null,
    ingestedAt: now,
    mediaType: mediaType ?? null,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    chainOfCustody: [{
      action: 'INGESTED',
      timestamp: now,
      actor: 'CLAIMTRACE',
      note: 'Original evidence registered; immutable identity assigned.',
    }],
  };

  return Object.freeze(record);
};

export const appendCustodyEvent = (record, event) => Object.freeze({
  ...record,
  chainOfCustody: Object.freeze([
    ...(record.chainOfCustody ?? []),
    Object.freeze({
      action: normalizeText(event.action).toUpperCase() || 'UNKNOWN',
      timestamp: event.timestamp ?? new Date().toISOString(),
      actor: normalizeText(event.actor) || 'UNKNOWN',
      note: normalizeText(event.note) || null,
    }),
  ]),
});

export const validateEvidenceRecord = (record) => {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (record?.[field] == null || record[field] === '') errors.push(`Missing ${field}`);
  }
  if (record?.sha256 && !/^[a-f0-9]{64}$/i.test(record.sha256)) errors.push('sha256 must be a 64-character hexadecimal digest');
  if (!Array.isArray(record?.chainOfCustody) || record.chainOfCustody.length === 0) errors.push('chainOfCustody must contain at least one event');
  return { valid: errors.length === 0, errors };
};

export const buildEvidenceManifest = (records) => records
  .slice()
  .sort((a, b) => String(a.ingestedAt).localeCompare(String(b.ingestedAt)))
  .map((record) => ({
    id: record.id,
    caseId: record.caseId,
    type: record.type,
    source: record.source,
    sourceRef: record.sourceRef,
    sha256: record.sha256,
    capturedAt: record.capturedAt,
    ingestedAt: record.ingestedAt,
    custodyEvents: record.chainOfCustody?.length ?? 0,
  }));
