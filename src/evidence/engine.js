const SOURCE_PRIORITY = {
  EDR: 100,
  TELEMATICS: 90,
  CCTV: 80,
  DASHCAM: 80,
  GPS: 70,
  POLICE_REPORT: 60,
  PHOTO: 50,
  STATEMENT: 30,
  INFERENCE: 10,
};

export const normalizeEvidence = (items) => items
  .map((item, index) => ({
    id: item.id ?? `E-${String(index + 1).padStart(4, '0')}`,
    timestamp: item.timestamp,
    type: String(item.type ?? 'UNKNOWN').toUpperCase(),
    title: item.title ?? 'Untitled evidence',
    detail: item.detail ?? '',
    source: item.source ?? 'UNKNOWN',
    confidence: item.confidence ?? 'MEDIUM',
    location: item.location ?? null,
  }))
  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

export const provenanceScore = (item) => {
  const priority = SOURCE_PRIORITY[item.source] ?? 0;
  const confidence = { HIGH: 1, MEDIUM: 0.7, LOW: 0.4 }[item.confidence] ?? 0.4;
  return Math.round((priority / 100) * confidence * 100);
};

export const correlateEvents = (items, windowSeconds = 5) => {
  const events = normalizeEvidence(items);
  const groups = [];

  for (const event of events) {
    const time = new Date(event.timestamp).getTime();
    const group = groups.find((candidate) => Math.abs(time - candidate.anchorTime) <= windowSeconds * 1000);
    if (group) {
      group.events.push(event);
      group.anchorTime = Math.min(group.anchorTime, time);
    } else {
      groups.push({
        id: `CORR-${String(groups.length + 1).padStart(3, '0')}`,
        anchorTime: time,
        events: [event],
      });
    }
  }

  return groups.map((group) => ({
    ...group,
    timestamp: new Date(group.anchorTime).toISOString(),
    dominantSource: [...group.events].sort((a, b) => provenanceScore(b) - provenanceScore(a))[0]?.source ?? 'UNKNOWN',
    evidenceCount: group.events.length,
  }));
};

export const evaluateClaim = (claim, evidence) => {
  const supporting = evidence.filter((item) => item.supportsClaim === claim.id);
  const contradicting = evidence.filter((item) => item.contradictsClaim === claim.id);

  if (supporting.length && contradicting.length) {
    return { status: 'CONFLICTING', supporting, contradicting };
  }
  if (supporting.length) {
    return { status: 'SUPPORTED', supporting, contradicting: [] };
  }
  if (contradicting.length) {
    return { status: 'CONTRADICTED', supporting: [], contradicting };
  }
  return { status: 'NOT_ESTABLISHED', supporting: [], contradicting: [] };
};

export const findMissingEvidence = (requiredTypes, evidence) => {
  const available = new Set(evidence.map((item) => String(item.type).toUpperCase()));
  return requiredTypes.filter((type) => !available.has(String(type).toUpperCase()));
};

export const buildCaseAssessment = ({ evidence = [], claims = [], requiredEvidence = [] }) => {
  const normalized = normalizeEvidence(evidence);
  const correlations = correlateEvents(normalized);
  const assessments = claims.map((claim) => ({
    claim,
    result: evaluateClaim(claim, normalized),
  }));

  return {
    evidence: normalized,
    correlations,
    claims: assessments,
    missingEvidence: findMissingEvidence(requiredEvidence, normalized),
    overallConfidence: normalized.length
      ? Math.round(normalized.reduce((sum, item) => sum + provenanceScore(item), 0) / normalized.length)
      : 0,
  };
};
