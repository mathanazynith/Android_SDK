import { RunningCoordinate } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';
import { calculateBearing, calculateHeadingChange } from '../utils/bearing';

export interface RdpSimplifierConfig {
  straightToleranceMeters: number;
  curveToleranceMeters: number;
  turnToleranceMeters: number;
}

export const DEFAULT_RDP_SIMPLIFIER_CONFIG: RdpSimplifierConfig = {
  // The saved Activity route is user-facing, so simplify only small GPS
  // variation. A 5m tolerance can erase the shape of short walks entirely.
  straightToleranceMeters: 1.5,
  curveToleranceMeters: 1,
  turnToleranceMeters: 0.5,
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

  /**
   * Keeps route direction changes as hard boundaries before simplifying each
   * segment. This prevents RDP from drawing a diagonal across a real turn.
   */
  public simplifyPreservingTurns(points: RunningCoordinate[]): RunningCoordinate[] {
    if (points.length <= 2) {
      return [...points];
    }

    const protectedIndexes = [0];
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const previousDistance = calculateDistanceMeters(previous, current);
      const nextDistance = calculateDistanceMeters(current, next);

      // Very short segments are normally GPS noise and do not have a reliable
      // direction. Meaningful segments retain their corner at 20° or more.
      if (previousDistance < 1 || nextDistance < 1) {
        continue;
      }

      const headingChange = calculateHeadingChange(
        calculateBearing(previous, current),
        calculateBearing(current, next)
      );
      if (headingChange >= 20) {
        protectedIndexes.push(index);
      }
    }
    protectedIndexes.push(points.length - 1);

    const result: RunningCoordinate[] = [];
    for (let index = 0; index < protectedIndexes.length - 1; index += 1) {
      const start = protectedIndexes[index];
      const end = protectedIndexes[index + 1];
      const segment = points.slice(start, end + 1);
      const simplified = this.simplify(segment, this.config.straightToleranceMeters);
      result.push(...(index === 0 ? simplified : simplified.slice(1)));
    }

    return result;
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
    // Project into a local metre-based plane. Using start-to-point distance as
    // the ratio is incorrect when a point is off the segment or behind it.
    const metresPerLatitudeDegree = 111_320;
    const metresPerLongitudeDegree = metresPerLatitudeDegree * Math.cos((start.latitude * Math.PI) / 180);
    const toLocal = (coordinate: RunningCoordinate) => ({
      x: (coordinate.longitude - start.longitude) * metresPerLongitudeDegree,
      y: (coordinate.latitude - start.latitude) * metresPerLatitudeDegree,
    });
    const endLocal = toLocal(end);
    const pointLocal = toLocal(point);
    const segmentLengthSquared = endLocal.x ** 2 + endLocal.y ** 2;

    if (segmentLengthSquared === 0) {
      return calculateDistanceMeters(start, point);
    }

    const ratio = Math.max(
      0,
      Math.min(1, (pointLocal.x * endLocal.x + pointLocal.y * endLocal.y) / segmentLengthSquared)
    );
    const deltaX = pointLocal.x - endLocal.x * ratio;
    const deltaY = pointLocal.y - endLocal.y * ratio;
    return Math.sqrt(deltaX ** 2 + deltaY ** 2);
  }
}
