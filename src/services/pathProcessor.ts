import { AdaptiveSampler, DEFAULT_ADAPTIVE_SAMPLER_CONFIG } from './adaptiveSampler';
import { GpsFilter, DEFAULT_GPS_FILTER_CONFIG } from './gpsFilter';
import { RdpSimplifier, DEFAULT_RDP_SIMPLIFIER_CONFIG } from './rdpSimplifier';
import { calculateBearing, calculateHeadingChange } from '../utils/bearing';
import { calculateDistanceMeters } from '../utils/distance';
import { RunningGpsPoint, RunningPathPoint, RawGpsPayload, PathType } from '../types/running';

export interface PathProcessorConfig {
  gps: typeof DEFAULT_GPS_FILTER_CONFIG;
  sampler: typeof DEFAULT_ADAPTIVE_SAMPLER_CONFIG;
  rdp: typeof DEFAULT_RDP_SIMPLIFIER_CONFIG;
}

export class PathProcessor {
  private readonly gpsFilter: GpsFilter;
  private readonly sampler: AdaptiveSampler;
  private readonly rdp: RdpSimplifier;
  private sequence = 0;
  private readonly runId: string;
  private readonly workingPoints: RunningGpsPoint[] = [];
  private readonly optimizedPoints: RunningPathPoint[] = [];
  private lastAccepted: RunningGpsPoint | null = null;

  constructor(runId: string, configOverride?: Partial<PathProcessorConfig>) {
    const gps = configOverride?.gps ?? DEFAULT_GPS_FILTER_CONFIG;
    const sampler = configOverride?.sampler ?? DEFAULT_ADAPTIVE_SAMPLER_CONFIG;
    const rdp = configOverride?.rdp ?? DEFAULT_RDP_SIMPLIFIER_CONFIG;

    this.runId = runId;
    this.gpsFilter = new GpsFilter(gps);
    this.sampler = new AdaptiveSampler(sampler);
    this.rdp = new RdpSimplifier(rdp);
  }

  public reset(): void {
    this.sequence = 0;
    this.workingPoints.length = 0;
    this.optimizedPoints.length = 0;
    this.lastAccepted = null;
  }

  public ingest(raw: RawGpsPayload): RunningPathPoint | null {
    const candidate = this.gpsFilter.validateRawPoint(raw);

    if (!candidate) {
      return null;
    }

    if (this.gpsFilter.rejectDuplicate(this.lastAccepted, candidate)) {
      return null;
    }

    const smoothed = this.gpsFilter.smoothPoint(this.lastAccepted, candidate);
    const lastAcceptedCoordinate = this.lastAccepted
      ? { latitude: this.lastAccepted.latitude, longitude: this.lastAccepted.longitude }
      : null;

    const candidateCoordinate = {
      latitude: smoothed.latitude,
      longitude: smoothed.longitude,
    };

    if (lastAcceptedCoordinate) {
      const distance = calculateDistanceMeters(lastAcceptedCoordinate, candidateCoordinate);
      if (distance < this.gpsFilter['config'].minMovementDistanceMeters) {
        return null;
      }

      if (distance > this.gpsFilter['config'].maxJumpDistanceMeters) {
        return null;
      }

      if (
        candidate.speed !== undefined &&
        candidate.speed !== null &&
        candidate.speed > this.gpsFilter['config'].maxReasonableRunningSpeedMetersPerSecond
      ) {
        return null;
      }
    }

    const nextSequence = this.sequence + 1;
    this.sequence = nextSequence;

    const pointId = `${this.runId}-${String(nextSequence).padStart(3, '0')}`;
    const timestamp = typeof candidate.timestamp === 'number'
      ? candidate.timestamp
      : new Date(candidate.timestamp ?? Date.now()).getTime();

    const point: RunningGpsPoint = {
      sequence: nextSequence,
      point_id: pointId,
      latitude: candidateCoordinate.latitude,
      longitude: candidateCoordinate.longitude,
      accuracy: candidate.accuracy ?? null,
      altitude: candidate.altitude ?? null,
      speed: candidate.speed ?? null,
      heading: candidate.heading ?? null,
      timestamp,
    };

    this.workingPoints.push(point);

    const pathPoint = this.classifyAndRetain(point);
    if (pathPoint) {
      this.optimizedPoints.push(pathPoint);
    }

    this.lastAccepted = point;
    return pathPoint;
  }

  private classifyAndRetain(point: RunningGpsPoint): RunningPathPoint | null {
    if (this.workingPoints.length < 2) {
      const output = {
        ...point,
        path_type: 'STRAIGHT' as PathType,
        heading_change: 0,
      };

      return output;
    }

    const previous = this.workingPoints[this.workingPoints.length - 2];
    const previous2 = this.workingPoints.length >= 3 ? this.workingPoints[this.workingPoints.length - 3] : null;

    const bearingFromPrevious = calculateBearing(
      { latitude: previous.latitude, longitude: previous.longitude },
      { latitude: point.latitude, longitude: point.longitude }
    );

    const refBearing = previous2
      ? calculateBearing(
          { latitude: previous2.latitude, longitude: previous2.longitude },
          { latitude: previous.latitude, longitude: previous.longitude }
        )
      : bearingFromPrevious;

    const headingChange = calculateHeadingChange(refBearing, bearingFromPrevious);
    const pathType = this.sampler.classifyPathType(headingChange);

    const lastRetained = this.optimizedPoints.length > 0
      ? { latitude: this.optimizedPoints[this.optimizedPoints.length - 1].latitude, longitude: this.optimizedPoints[this.optimizedPoints.length - 1].longitude }
      : null;

    const shouldRetain = this.sampler.shouldRetainByDistance(lastRetained, point, pathType);

    if (!shouldRetain && this.optimizedPoints.length > 0) {
      return null;
    }

    const output: RunningPathPoint = {
      ...point,
      path_type: pathType,
      heading_change: headingChange,
    };

    return output;
  }

  public getOptimizedPoints(): RunningPathPoint[] {
    return [...this.optimizedPoints];
  }

  public simplifyFinal(): RunningPathPoint[] {
    if (this.optimizedPoints.length <= 2) {
      return [...this.optimizedPoints];
    }

    const simplifiedSegments: RunningPathPoint[] = [];
    let segmentStart = 0;

    for (let i = 1; i < this.optimizedPoints.length; i += 1) {
      const previousType = this.optimizedPoints[i - 1].path_type;
      const currentType = this.optimizedPoints[i].path_type;

      const segmentBoundary = previousType !== currentType || i === this.optimizedPoints.length - 1;

      if (segmentBoundary) {
        const segment = this.optimizedPoints.slice(segmentStart, i + (i === this.optimizedPoints.length - 1 ? 1 : 0));
        const segmentType = segment[0]?.path_type ?? 'STRAIGHT';
        const tolerance = this.sampler.getToleranceForPathType(segmentType);

        const route = segment.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));

        const simplified = this.rdp.simplify(route, tolerance);
        const simplifiedKeys = new Set(
          simplified.map((point) => `${point.latitude.toFixed(10)}|${point.longitude.toFixed(10)}`)
        );

        const segmentRetained = segment.filter((point) => {
          const key = `${point.latitude.toFixed(10)}|${point.longitude.toFixed(10)}`;
          return simplifiedKeys.has(key);
        });

        simplifiedSegments.push(...segmentRetained);

        segmentStart = i;
        if (i === this.optimizedPoints.length - 1) {
          segmentStart = i + 1;
        }
      }
    }

    // If there is a single segment and slice logic ever misses a boundary, make sure we preserve the last point sequence.
    if (simplifiedSegments.length === 0) {
      return [...this.optimizedPoints];
    }

    return simplifiedSegments;
  }

  public getSnapshot(): { rawPointCount: number; optimizedPointCount: number; reductionPercent: number; points: RunningPathPoint[] } {
    const rawPointCount = this.workingPoints.length;
    const optimizedPointCount = this.optimizedPoints.length;

    return {
      rawPointCount,
      optimizedPointCount,
      reductionPercent: this.gpsFilter.snapshotSummary(rawPointCount, optimizedPointCount),
      points: this.getOptimizedPoints(),
    };
  }
}
