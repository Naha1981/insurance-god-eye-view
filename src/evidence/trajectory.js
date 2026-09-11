import { enrichTelemetry, haversineMeters } from './geospatial.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const classifyTelemetryQuality = (point) => {
  const accuracy = Number(point.accuracyMeters);
  const gap = Number(point.elapsedSeconds);
  if (!Number.isFinite(accuracy)) return 'UNKNOWN';
  if (accuracy <= 5 && (!Number.isFinite(gap) || gap <= 2)) return 'HIGH';
  if (accuracy <= 15 && (!Number.isFinite(gap) || gap <= 5)) return 'MEDIUM';
  return 'LOW';
};

export const buildTrajectorySegments = (points, options = {}) => {
  const maxGapSeconds = Number.isFinite(Number(options.maxGapSeconds)) ? Number(options.maxGapSeconds) : 10;
  const enriched = enrichTelemetry(points);
  return enriched.slice(1).map((point, index) => {
    const previous = enriched[index];
    const gap = point.elapsedSeconds;
    const gapPenalty = gap > maxGapSeconds ? clamp((gap - maxGapSeconds) / maxGapSeconds, 0, 1) : 0;
    const accuracyPenalty = [point, previous]
      .map((item) => Number(item.accuracyMeters))
      .filter(Number.isFinite)
      .reduce((sum, accuracy) => sum + clamp(accuracy / 50, 0, 1), 0) / 2;
    const uncertaintyMeters = Math.round((
      Math.max(Number(previous.accuracyMeters) || 5, Number(point.accuracyMeters) || 5)
      + (Number(point.segmentDistanceMeters) * gapPenalty * 0.5)
    ) * 100) / 100;
    const confidence = clamp(1 - Math.max(gapPenalty, accuracyPenalty), 0, 1);

    return {
      id: `SEG-${String(index + 1).padStart(5, '0')}`,
      fromId: previous.id,
      toId: point.id,
      fromTimestampUtc: previous.timestampUtc,
      toTimestampUtc: point.timestampUtc,
      from: { lat: previous.lat, lon: previous.lon },
      to: { lat: point.lat, lon: point.lon },
      distanceMeters: point.segmentDistanceMeters,
      elapsedSeconds: gap,
      observedSpeedKph: point.speedKph,
      derivedSpeedKph: point.derivedSpeedKph,
      headingDeg: point.headingDeg,
      uncertaintyMeters,
      confidence: Math.round(confidence * 100) / 100,
      quality: classifyTelemetryQuality(point),
      interpolated: gap > maxGapSeconds,
    };
  });
};

export const summarizeTrajectory = (points, options = {}) => {
  const normalized = enrichTelemetry(points);
  const segments = buildTrajectorySegments(normalized, options);
  const totalDistanceMeters = segments.reduce((sum, segment) => sum + segment.distanceMeters, 0);
  const movingSeconds = segments.reduce((sum, segment) => sum + (segment.elapsedSeconds > 0 ? segment.elapsedSeconds : 0), 0);
  const derivedSpeeds = segments.map((segment) => segment.derivedSpeedKph).filter(Number.isFinite);
  const maxSpeedKph = derivedSpeeds.length ? Math.max(...derivedSpeeds) : null;
  const meanSpeedKph = movingSeconds > 0 ? (totalDistanceMeters / movingSeconds) * 3.6 : null;
  const lowConfidenceSegments = segments.filter((segment) => segment.confidence < 0.6).length;

  return {
    pointCount: normalized.length,
    segmentCount: segments.length,
    totalDistanceMeters: Math.round(totalDistanceMeters * 100) / 100,
    durationSeconds: normalized.length > 1
      ? Math.max(0, (new Date(normalized.at(-1).timestampUtc) - new Date(normalized[0].timestampUtc)) / 1000)
      : 0,
    meanSpeedKph: meanSpeedKph == null ? null : Math.round(meanSpeedKph * 100) / 100,
    maxSpeedKph: maxSpeedKph == null ? null : Math.round(maxSpeedKph * 100) / 100,
    lowConfidenceSegments,
    start: normalized[0] ? { lat: normalized[0].lat, lon: normalized[0].lon, timestampUtc: normalized[0].timestampUtc } : null,
    end: normalized.at(-1) ? { lat: normalized.at(-1).lat, lon: normalized.at(-1).lon, timestampUtc: normalized.at(-1).timestampUtc } : null,
  };
};

export const interpolatePosition = (from, to, ratio) => {
  const t = clamp(Number(ratio), 0, 1);
  return {
    lat: from.lat + ((to.lat - from.lat) * t),
    lon: from.lon + ((to.lon - from.lon) * t),
  };
};

export const interpolateTrajectory = (points, options = {}) => {
  const maxGapSeconds = Number.isFinite(Number(options.maxGapSeconds)) ? Number(options.maxGapSeconds) : 10;
  const stepSeconds = Number.isFinite(Number(options.stepSeconds)) ? Math.max(1, Number(options.stepSeconds)) : 1;
  const normalized = enrichTelemetry(points);
  const output = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    output.push({ ...current, interpolated: false });
    const next = normalized[index + 1];
    if (!next) continue;
    const gapSeconds = (new Date(next.timestampUtc) - new Date(current.timestampUtc)) / 1000;
    if (gapSeconds <= stepSeconds || gapSeconds > maxGapSeconds) continue;

    const startMs = new Date(current.timestampUtc).getTime();
    for (let elapsed = stepSeconds; elapsed < gapSeconds; elapsed += stepSeconds) {
      const ratio = elapsed / gapSeconds;
      const position = interpolatePosition(current, next, ratio);
      output.push({
        id: `INT-${current.id}-${next.id}-${elapsed}`,
        timestampUtc: new Date(startMs + elapsed * 1000).toISOString(),
        timestampLocal: null,
        lat: position.lat,
        lon: position.lon,
        speedKph: null,
        headingDeg: null,
        accuracyMeters: null,
        vehicleId: current.vehicleId,
        source: 'INTERPOLATION',
        segmentDistanceMeters: null,
        elapsedSeconds: stepSeconds,
        derivedSpeedKph: current.derivedSpeedKph,
        interpolated: true,
        uncertaintyMeters: Math.round((Number(current.accuracyMeters) || 10) + (Number(next.accuracyMeters) || 10)) / 2,
      });
    }
  }

  return output.sort((a, b) => new Date(a.timestampUtc) - new Date(b.timestampUtc));
};

export const nearestTrajectoryDistanceMeters = (point, trajectoryPoints) => {
  const distances = trajectoryPoints
    .map((candidate) => haversineMeters(point, candidate))
    .filter(Number.isFinite);
  return distances.length ? Math.min(...distances) : null;
};
