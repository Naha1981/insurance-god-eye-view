const SOURCE_BASE_SCORE = {
  EDR: 1,
  TELEMATICS: 0.9,
  CCTV: 0.85,
  DASHCAM: 0.85,
  GPS: 0.75,
  POLICE_REPORT: 0.65,
  PHOTO: 0.55,
  STATEMENT: 0.4,
  INFERENCE: 0.2,
  INTERPOLATION: 0.15,
};

const CONFIDENCE_FACTOR = {
  HIGH: 1,
  MEDIUM: 0.8,
  LOW: 0.55,
  UNKNOWN: 0.4,
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const qualityLabel = (score) => (score >= 85 ? 'HIGH' : score >= 65 ? 'MEDIUM' : score >= 45 ? 'LOW' : 'VERY LOW');
const sourceLabel = (item) => String(item.source ?? item.type ?? 'UNKNOWN').toUpperCase();

export const evidenceQualityAssessment = (item = {}) => {
  const source = sourceLabel(item);
  const base = SOURCE_BASE_SCORE[source] ?? 0.3;
  const confidence = String(item.confidence ?? 'UNKNOWN').toUpperCase();
  const confidenceFactor = CONFIDENCE_FACTOR[confidence] ?? CONFIDENCE_FACTOR.UNKNOWN;
  const accuracy = Number(item.accuracyMeters ?? item.accuracy_m);
  const accuracyFactor = Number.isFinite(accuracy) ? clamp(1 - (accuracy / 100)) : 0.75;
  const provenancePresent = Boolean(item.sha256 || item.sourceRef || item.source_ref);
  const provenanceFactor = provenancePresent ? 1 : 0.8;
  const interpolated = Boolean(item.interpolated) || source === 'INTERPOLATION';
  const interpolationPenalty = interpolated ? 0.25 : 0;
  const score = Math.round(clamp(
    (base * 0.45) + (confidenceFactor * 0.3) + (accuracyFactor * 0.15) + (provenanceFactor * 0.1) - interpolationPenalty,
  ) * 100);

  const reasons = [`${source} source weighting`];
  reasons.push(confidence === 'HIGH' ? 'high source confidence' : 'limited source confidence');
  reasons.push(Number.isFinite(accuracy) ? `reported accuracy ${accuracy} m` : 'reported accuracy unavailable');
  reasons.push(provenancePresent ? 'source provenance present' : 'source provenance incomplete');
  if (interpolated) reasons.push('interpolated evidence penalty applied');

  return {
    score,
    label: qualityLabel(score),
    source,
    provenancePresent,
    accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
    interpolated,
    reasons,
  };
};

export const evidenceQualityScore = (item = {}) => evidenceQualityAssessment(item).score;

export const trajectoryQualityAssessment = (segments = []) => {
  if (!segments.length) return { score: 0, label: 'NO DATA', observedSegments: 0, interpolatedSegments: 0, lowQualitySegments: 0 };
  const weighted = segments.map((segment) => ({
    score: evidenceQualityScore({
      source: segment.interpolated ? 'INTERPOLATION' : 'GPS',
      accuracyMeters: segment.uncertaintyMeters,
      confidence: segment.quality,
      interpolated: segment.interpolated,
    }),
    weight: Math.max(0.1, Number(segment.elapsedSeconds) || 0.1),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(weighted.reduce((sum, item) => sum + ((item.score / 100) * item.weight), 0) / totalWeight * 100);
  return {
    score,
    label: qualityLabel(score),
    observedSegments: segments.filter((segment) => !segment.interpolated).length,
    interpolatedSegments: segments.filter((segment) => segment.interpolated).length,
    lowQualitySegments: segments.filter((segment) => segment.quality === 'LOW' || segment.confidence < 0.6).length,
  };
};
