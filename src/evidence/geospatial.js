const SOUTH_AFRICA_TIME_ZONE = 'Africa/Johannesburg';

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeLongitude = (value) => {
  let longitude = value;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return longitude;
};

export const normalizeCoordinate = ({ lat, lon, latitude, longitude } = {}) => {
  const normalizedLat = toNumber(lat ?? latitude);
  const normalizedLon = toNumber(lon ?? longitude);
  if (!isFiniteNumber(normalizedLat) || !isFiniteNumber(normalizedLon)) return null;
  if (normalizedLat < -90 || normalizedLat > 90) return null;
  return {
    lat: normalizedLat,
    lon: normalizeLongitude(normalizedLon),
  };
};

export const normalizeTimestamp = (value, { sourceTimeZone = SOUTH_AFRICA_TIME_ZONE } = {}) => {
  if (!value) return { utc: null, local: null, sourceTimeZone, assumedTimeZone: false };
  const raw = String(value).trim();
  if (!raw) return { utc: null, local: null, sourceTimeZone, assumedTimeZone: false };

  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const candidate = hasExplicitOffset ? raw : `${raw.replace(' ', 'T')}+02:00`;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return { utc: null, local: null, sourceTimeZone, assumedTimeZone: !hasExplicitOffset };
  }

  const local = new Intl.DateTimeFormat('en-ZA', {
    timeZone: sourceTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(',', '');

  return {
    utc: date.toISOString(),
    local,
    sourceTimeZone,
    assumedTimeZone: !hasExplicitOffset,
  };
};

export const normalizeTelemetryPoint = (point, index = 0, options = {}) => {
  const coordinate = normalizeCoordinate(point);
  const timestamp = normalizeTimestamp(point.timestamp ?? point.time ?? point.datetime ?? point.captured_at, options);
  if (!coordinate || !timestamp.utc) return null;

  return {
    id: point.id ?? `GPS-${String(index + 1).padStart(5, '0')}`,
    timestampUtc: timestamp.utc,
    timestampLocal: timestamp.local,
    sourceTimeZone: timestamp.sourceTimeZone,
    assumedTimeZone: timestamp.assumedTimeZone,
    lat: coordinate.lat,
    lon: coordinate.lon,
    speedKph: toNumber(point.speedKph ?? point.speed_kph ?? point.speed),
    headingDeg: toNumber(point.headingDeg ?? point.heading_deg ?? point.heading),
    accuracyMeters: toNumber(point.accuracyMeters ?? point.accuracy_m ?? point.accuracy),
    vehicleId: point.vehicleId ?? point.vehicle_id ?? null,
    source: String(point.source ?? 'GPS').toUpperCase(),
  };
};

export const normalizeTelemetry = (points, options = {}) => points
  .map((point, index) => normalizeTelemetryPoint(point, index, options))
  .filter(Boolean)
  .sort((a, b) => new Date(a.timestampUtc) - new Date(b.timestampUtc));

export const haversineMeters = (a, b) => {
  const p1 = normalizeCoordinate(a);
  const p2 = normalizeCoordinate(b);
  if (!p1 || !p2) return null;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6371008.8;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export const enrichTelemetry = (points) => {
  const normalized = normalizeTelemetry(points);
  return normalized.map((point, index) => {
    const previous = normalized[index - 1];
    if (!previous) return { ...point, segmentDistanceMeters: 0, elapsedSeconds: 0, derivedSpeedKph: null };
    const distance = haversineMeters(previous, point) ?? 0;
    const elapsedSeconds = Math.max(0, (new Date(point.timestampUtc) - new Date(previous.timestampUtc)) / 1000);
    const derivedSpeedKph = elapsedSeconds > 0 ? (distance / elapsedSeconds) * 3.6 : null;
    return { ...point, segmentDistanceMeters: Math.round(distance * 100) / 100, elapsedSeconds, derivedSpeedKph: derivedSpeedKph == null ? null : Math.round(derivedSpeedKph * 100) / 100 };
  });
};

export { SOUTH_AFRICA_TIME_ZONE };
