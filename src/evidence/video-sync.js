const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export const normalizeVideoSync = ({ captureStartAt = null, frameRate = null, offsetSeconds = 0 } = {}) => {
  const start = captureStartAt ? new Date(captureStartAt) : null;
  const rate = finiteNumber(frameRate);
  const offset = finiteNumber(offsetSeconds);
  return {
    captureStartAt: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
    frameRate: rate && rate > 0 ? rate : null,
    offsetSeconds: offset ?? 0,
  };
};

export const frameTimeSeconds = (frameIndex, frameRate) => {
  const index = finiteNumber(frameIndex);
  const rate = finiteNumber(frameRate);
  if (index === null || rate === null || index < 0 || rate <= 0) return null;
  return index / rate;
};

export const frameTimestamp = (frameIndex, { captureStartAt = null, frameRate = null, offsetSeconds = 0 } = {}) => {
  const start = captureStartAt ? new Date(captureStartAt) : null;
  const seconds = frameTimeSeconds(frameIndex, frameRate);
  const offset = finiteNumber(offsetSeconds) ?? 0;
  if (!start || Number.isNaN(start.getTime()) || seconds === null) return null;
  return new Date(start.getTime() + (seconds + offset) * 1000).toISOString();
};

export const timelineFrameIndex = (timestamp, { captureStartAt = null, frameRate = null, offsetSeconds = 0 } = {}) => {
  const event = timestamp ? new Date(timestamp) : null;
  const start = captureStartAt ? new Date(captureStartAt) : null;
  const rate = finiteNumber(frameRate);
  const offset = finiteNumber(offsetSeconds) ?? 0;
  if (!event || Number.isNaN(event.getTime()) || !start || Number.isNaN(start.getTime()) || rate === null || rate <= 0) return null;
  const seconds = (event.getTime() - start.getTime()) / 1000 - offset;
  const frame = Math.round(seconds * rate);
  return frame >= 0 ? frame : null;
};

export const buildFrameEvidenceIndex = (evidenceId, { captureStartAt = null, frameRate = null, offsetSeconds = 0 } = {}, frameIndices = []) => {
  const sync = normalizeVideoSync({ captureStartAt, frameRate, offsetSeconds });
  return frameIndices.map((frameIndex) => ({
    evidenceId,
    frameIndex,
    timestamp: frameTimestamp(frameIndex, sync),
    sourceTimeSeconds: frameTimeSeconds(frameIndex, sync.frameRate),
    synchronized: Boolean(sync.captureStartAt && sync.frameRate),
  }));
};
