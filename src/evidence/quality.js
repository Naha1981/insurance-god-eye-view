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

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const evidenceQualityScore = (item = {}) => {
  const source = String(item.source ?? item.type ?? 'UNKNOWN').toUpperCase();
  const base = SOURCE_BASE_SCORE[source] ?? 0.3;
  const confidence = String(item.confidence ?? 'MEDIUM').toUpperCase();
  const confidenceFactor = { HIGH: 1, MEDIUM: 0.8, LOW: 0.55, UNKNOWN: 0.4 }[confidence] ?? 0.4;
  const accuracy = Number(item.accuracyMeters ?? item.accuracy_m);
  const accuracyFactor = Number.isFinite(accuracy) ? clamp(1 - (accuracy / 100)) : 0.75;
  const provenanceFactor = item.sha256 || item.sourceRef || item.source_ref ? 1 : 0.8;
  const interpolationPenalty = item.interpolated || source === 'INTERPOLATION' ? 0.25 : 0;
  const score = clamp((base * 0.45) + (confidenceFactor * 0.3) + (accuracyFactor * 0.15) + (provenanceFactor * 0.1) - interpolationPenalty);
  return Math.round(score * 100);
};

export const trajectoryQualityAssessment = (segments = []) => {
  if (!segments.length) return { score: 0, label: 'NO DATA', observedSegments: 0, interpolatedSegments: 0, lowQualitySegments: 0 };
  const weighted = segments.map((segment) => {
    const sourceScore = evidenceQualityScore({
      source: segment.interpolated ? 'INTERPOLATION' : 'GPS',
      accuracyMeters: segment.uncertaintyMeters,
      confidence: segment.quality,
      interpolated: segment.interpolated,
    });
    return (sourceScore / 100) * Math.max(0.1, Number(segment.elapsedSeconds) || 0.1);
  });
  const totalWeight = segments.reduce((sum, segment) => sum + Math.max(0.1, Number(segment.elapsedSeconds) || 0.1), 0);
  const score = Math.round((weighted.reduce((sum, value) => sum + value, 0) / totalWeight) * 100);
  const label = score >= 85 ? 'HIGH' : score >= 65 ? 'MEDIUM' : score >= 45 ? 'LOW' : 'VERY LOW';
  return {
    score,
    label,
    observedSegments: segments.filter((segment) => !segment.interpolated).length,
    interpolatedSegments: segments.filter((segment) => segment.interpolated).length,
    lowQualitySegments: segments.filter((segment) => segment.quality === 'LOW' || segment.confidence < 0.6).length,
  };
};
