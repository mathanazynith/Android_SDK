import { PathType } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';
import { RunningCoordinate } from '../types/running';

export interface AdaptiveSamplerConfig {
  straightMinMeters: number;
  straightMaxMeters: number;
  curveMinMeters: number;
  curveMaxMeters: number;
  turnMinMeters: number;
  turnMaxMeters: number;
  straightOverflowMeters: number;
  curveOverflowMeters: number;
  turnOverflowMeters: number;
}

export const DEFAULT_ADAPTIVE_SAMPLER_CONFIG: AdaptiveSamplerConfig = {
  straightMinMeters: 8,
  straightMaxMeters: 15,
  curveMinMeters: 3,
  curveMaxMeters: 5,
  turnMinMeters: 1,
  turnMaxMeters: 3,
  straightOverflowMeters: 50,
  curveOverflowMeters: 20,
  turnOverflowMeters: 8,
};

export class AdaptiveSampler {
  public readonly config: AdaptiveSamplerConfig;

  constructor(config: AdaptiveSamplerConfig = DEFAULT_ADAPTIVE_SAMPLER_CONFIG) {
    this.config = config;
  }

  public classifyPathType(headingChangeDegrees: number): PathType {
    if (headingChangeDegrees < 5) {
      return 'STRAIGHT';
    }

    if (headingChangeDegrees < 20) {
      return 'CURVE';
    }

    return 'TURN';
  }

  public shouldRetainByDistance(
    lastRetained: RunningCoordinate | null,
    candidate: RunningCoordinate,
    pathType: PathType
  ): boolean {
    if (!lastRetained) {
      return true;
    }

    const distance = calculateDistanceMeters(lastRetained, candidate);

    const target = this.getSamplingInterval(pathType);
    const tolerance = this.getToleranceForPathType(pathType);

    return distance >= Math.max(1, target + tolerance * 0.5);
  }

  public getSamplingInterval(pathType: PathType): number {
    switch (pathType) {
      case 'TURN':
        return this.config.turnMinMeters;
      case 'CURVE':
        return this.config.curveMinMeters;
      case 'STRAIGHT':
      default:
        return this.config.straightMinMeters;
    }
  }

  public getToleranceForPathType(pathType: PathType): number {
    switch (pathType) {
      case 'TURN':
        return this.config.turnOverflowMeters;
      case 'CURVE':
        return this.config.curveOverflowMeters;
      case 'STRAIGHT':
      default:
        return this.config.straightOverflowMeters;
    }
  }
}
