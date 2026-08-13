import { RunningCoordinate } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';

export interface RdpSimplifierConfig {
  straightToleranceMeters: number;
  curveToleranceMeters: number;
  turnToleranceMeters: number;
}

export const DEFAULT_RDP_SIMPLIFIER_CONFIG: RdpSimplifierConfig = {
  straightToleranceMeters: 5,
  curveToleranceMeters: 4,
  turnToleranceMeters: 2,
};

export class RdpSimplifier {
  constructor(private readonly config: RdpSimplifierConfig = DEFAULT_RDP_SIMPLIFIER_CONFIG) {}

  public simplify(
    points: RunningCoordinate[],
    epsilonMeters: number = this.config.straightToleranceMeters
  ): RunningCoordinate[] {
    if (points.length <= 2) {
      return [...points];
    }

    const last = points.length - 1;
    const index = this.findFarthestPoint(points, epsilonMeters);

    if (index === -1) {
      return [points[0], points[last]];
    }

    const left = this.simplify(points.slice(0, index + 1), epsilonMeters);
    const right = this.simplify(points.slice(index), epsilonMeters);

    return [...left, ...right.slice(1)];
  }

  public simplifyAdaptive(points: RunningCoordinate[], pathType: 'STRAIGHT' | 'CURVE' | 'TURN'): RunningCoordinate[] {
    const toleranceMap = {
      STRAIGHT: this.config.straightToleranceMeters,
      CURVE: this.config.curveToleranceMeters,
      TURN: this.config.turnToleranceMeters,
    };

    return this.simplify(points, toleranceMap[pathType]);
  }

  private findFarthestPoint(points: RunningCoordinate[], epsilonMeters: number): number {
    const start = points[0];
    const end = points[points.length - 1];

    let maxDistance = 0;
    let maxIndex = -1;

    for (let i = 1; i < points.length - 1; i += 1) {
      const point = points[i];
      const distance = this.perpendicularDistance(start, end, point);

      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance > epsilonMeters) {
      return maxIndex;
    }

    return -1;
  }

  private perpendicularDistance(
    start: RunningCoordinate,
    end: RunningCoordinate,
    point: RunningCoordinate
  ): number {
    const startToEnd = calculateDistanceMeters(start, end);

    if (startToEnd === 0) {
      return calculateDistanceMeters(start, point);
    }

    const ratio = Math.max(0, Math.min(1, calculateDistanceMeters(start, point) / startToEnd));
    const projected = {
      latitude: start.latitude + (end.latitude - start.latitude) * ratio,
      longitude: start.longitude + (end.longitude - start.longitude) * ratio,
    };

    return calculateDistanceMeters(projected, point);
  }
}
