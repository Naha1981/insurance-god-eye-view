import { buildTrajectorySegments, summarizeTrajectory } from './trajectory.js';
import { trajectoryQualityAssessment } from './quality.js';

export const buildTrajectoryAssessment = (points, options = {}) => {
  const segments = buildTrajectorySegments(points, options);
  return {
    segments,
    summary: summarizeTrajectory(points, options),
    quality: trajectoryQualityAssessment(segments),
  };
};

export const buildReconstructionAssessment = ({ evidence = [], telemetry = [], claims = [], requiredEvidence = [] } = {}) => {
  const trajectory = telemetry.length ? buildTrajectoryAssessment(telemetry) : null;
  return {
    trajectory,
    claims,
    evidence,
    requiredEvidence,
    generatedAt: new Date().toISOString(),
  };
};
