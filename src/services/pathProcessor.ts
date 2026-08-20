import { GpsFilter, DEFAULT_GPS_FILTER_CONFIG } from './gpsFilter';
import { RdpSimplifier, DEFAULT_RDP_SIMPLIFIER_CONFIG } from './rdpSimplifier';
import { calculateDistanceMeters } from '../utils/distance';
import { RunningGpsPoint, RunningPathPoint, RawGpsPayload, PathType } from '../types/running';

export interface PathProcessorConfig {
  gps: typeof DEFAULT_GPS_FILTER_CONFIG;
  rdp: typeof DEFAULT_RDP_SIMPLIFIER_CONFIG;
}

/**
 * GPS cannot produce a trustworthy indoor route. A long sequence which stays
 * inside this small area while repeatedly travelling around it is GPS drift,
 * not a 100+ metre workout.
 */
const INDOOR_DRIFT_MAX_RADIUS_METERS = 30;
const INDOOR_DRIFT_MIN_DURATION_SECONDS = 90;
const INDOOR_DRIFT_MIN_WANDER_RATIO = 6;
const MIN_DISPLAY_INTERVAL_MS = 5_000;
const MAX_FINAL_POINT_GAP_METERS = 5;

export class PathProcessor {
  private readonly gpsFilter: GpsFilter;
  private readonly rdp: RdpSimplifier;
  private sequence = 0;
  private readonly runId: string;
  private readonly workingPoints: RunningGpsPoint[] = [];
  private readonly displayPoints: RunningPathPoint[] = [];
  private readonly filteredPoints: RunningPathPoint[] = [];
  private readonly optimizedPoints: RunningPathPoint[] = [];
  private lastAccepted: RunningGpsPoint | null = null;

  constructor(runId: string, configOverride?: Partial<PathProcessorConfig>) {
    const gps = configOverride?.gps ?? DEFAULT_GPS_FILTER_CONFIG;
    const rdp = configOverride?.rdp ?? DEFAULT_RDP_SIMPLIFIER_CONFIG;

    this.runId = runId;
    this.gpsFilter = new GpsFilter(gps);
    this.rdp = new RdpSimplifier(rdp);
  }

  public reset(): void {
    this.sequence = 0;
    this.workingPoints.length = 0;
    this.displayPoints.length = 0;
    this.filteredPoints.length = 0;
    this.optimizedPoints.length = 0;
    this.lastAccepted = null;
  }

  /**
   * Stores a live route sample exactly as it was received. Quality filtering is
   * deliberately deferred to filterRawPoints(), which runs only when saving.
   */
  public ingestRaw(raw: RawGpsPayload): RunningPathPoint | null {
    if (
      raw === null ||
      typeof raw !== 'object' ||
      !Number.isFinite(raw.latitude) ||
      !Number.isFinite(raw.longitude) ||
      raw.latitude < -90 || raw.latitude > 90 ||
      raw.longitude < -180 || raw.longitude > 180
    ) {
      console.log('[LocationManager] LIVE GPS rejected malformed raw sample');
      return null;
    }

    const nextSequence = this.sequence + 1;
    this.sequence = nextSequence;

    const pointId = `${this.runId}-${String(nextSequence).padStart(3, '0')}`;
    const timestamp = typeof raw.timestamp === 'number'
      ? raw.timestamp
      : typeof raw.timestamp === 'string'
        ? new Date(raw.timestamp).getTime()
        : new Date().getTime();

    const point: RunningGpsPoint = {
      sequence: nextSequence,
      point_id: pointId,
      latitude: raw.latitude,
      longitude: raw.longitude,
      accuracy: raw.accuracy ?? null,
      altitude: raw.altitude ?? null,
      speed: raw.speed ?? null,
      heading: raw.heading ?? null,
      timestamp,
    };

    this.workingPoints.push(point);
    this.lastAccepted = point;

    const pathPoint: RunningPathPoint = {
      ...point,
      path_type: 'STRAIGHT' as PathType,
      heading_change: 0,
    };

    // Tier 1: the live map is intentionally much less sensitive than raw GPS.
    // A location accuracy radius is an uncertainty estimate, so a 0.5m delta
    // inside a building is noise rather than a meaningful route update.
    const lastDisplay = this.displayPoints.at(-1);
    if (!lastDisplay) {
      this.displayPoints.push(pathPoint);
      console.log('[LocationManager] Display point #1 recorded');
    } else {
      const displayDistance = calculateDistanceMeters(lastDisplay, pathPoint);
      const displayElapsedSeconds = Math.max(0, (pathPoint.timestamp - lastDisplay.timestamp) / 1_000);
      const accuracyRadius = Math.max(lastDisplay.accuracy ?? 0, pathPoint.accuracy ?? 0);
      const displayThreshold = Math.max(5, Math.min(12, accuracyRadius));

      if (displayDistance > 500 && displayElapsedSeconds < 10) {
        console.log(`[LocationManager] Display rejected huge jump: ${displayDistance.toFixed(1)}m`);
      } else if (
        displayElapsedSeconds >= MIN_DISPLAY_INTERVAL_MS / 1_000 &&
        displayDistance >= displayThreshold
      ) {
        this.displayPoints.push(pathPoint);
        console.log(`[LocationManager] Display point #${this.displayPoints.length} recorded`);
      } else {
        console.log(
          `[LocationManager] Display point skipped: ${displayDistance.toFixed(1)}m below ${displayThreshold.toFixed(1)}m uncertainty gate or sampled too soon`
        );
      }
    }

    console.log(
      `[LocationManager] LIVE raw point #${this.workingPoints.length} recorded -> lat:${point.latitude} lon:${point.longitude} acc:${point.accuracy ?? 'n/a'}m speed:${point.speed ?? 'n/a'}m/s`
    );
    return pathPoint;
  }

  public filterRawPoints(): RunningPathPoint[] {
    this.filteredPoints.length = 0;

    console.log(`[LocationManager] Save filter started: evaluating ${this.workingPoints.length} raw points`);

    for (const rawPoint of this.workingPoints) {
      const rawPayload: RawGpsPayload = {
        latitude: rawPoint.latitude,
        longitude: rawPoint.longitude,
        accuracy: rawPoint.accuracy ?? undefined,
        altitude: rawPoint.altitude ?? undefined,
        speed: rawPoint.speed ?? undefined,
        heading: rawPoint.heading ?? undefined,
        timestamp: rawPoint.timestamp,
      };

      const candidate = this.gpsFilter.validateRawPoint(rawPayload);
      if (!candidate) {
        console.log(`[LocationManager] ❌ Save filter rejected #${rawPoint.sequence}: invalid coordinates, accuracy, or speed`);
        continue;
      }

      const ageSeconds = Math.max(0, (Date.now() - rawPoint.timestamp) / 1000);
      if (ageSeconds > 60 * 60 * 24) {
        console.log(`[LocationManager] ❌ Save filter rejected #${rawPoint.sequence}: stale point age ${ageSeconds.toFixed(1)}s`);
        continue;
      }

      const previous = this.filteredPoints.at(-1);
      if (previous) {
        const distance = calculateDistanceMeters(previous, rawPoint);
        const elapsedSeconds = Math.max(0.001, (rawPoint.timestamp - previous.timestamp) / 1000);
        const impliedSpeed = distance / elapsedSeconds;

        if (distance < 0.5) {
          console.log(`[LocationManager] ❌ Save filter rejected #${rawPoint.sequence}: movement ${distance.toFixed(1)}m < 0.5m`);
          continue;
        }

        // Indoor location callbacks can arrive in bursts, so their implied
        // speed is unreliable. Keep plausible points and reject only a large,
        // obvious GPS jump; RDP will simplify indoor jitter after saving.
        if (distance > 500) {
          console.log(`[LocationManager] ❌ Save filter rejected #${rawPoint.sequence}: GPS jump ${distance.toFixed(1)}m at ${impliedSpeed.toFixed(2)}m/s`);
          continue;
        }
      }

      const filteredPoint: RunningPathPoint = {
        ...rawPoint,
        path_type: 'STRAIGHT' as PathType,
        heading_change: 0,
      };

      this.filteredPoints.push(filteredPoint);
      console.log(`[LocationManager] ✅ Save filter accepted #${rawPoint.sequence}: lat:${rawPoint.latitude} lon:${rawPoint.longitude}`);
    }

    this.collapseIndoorDrift();
    return [...this.filteredPoints];
  }

  public getRawPoints(): RunningGpsPoint[] {
    return [...this.workingPoints];
  }

  public getDisplayPoints(): RunningPathPoint[] {
    return [...this.displayPoints];
  }

  public getFilteredPoints(): RunningPathPoint[] {
    return [...this.filteredPoints];
  }

  public getOptimizedPoints(): RunningPathPoint[] {
    return [...this.optimizedPoints];
  }

  private collapseIndoorDrift(): void {
    if (this.filteredPoints.length < 3) {
      return;
    }

    const first = this.filteredPoints[0];
    const last = this.filteredPoints.at(-1)!;
    const durationSeconds = Math.max(0, (last.timestamp - first.timestamp) / 1_000);
    if (durationSeconds < INDOOR_DRIFT_MIN_DURATION_SECONDS) {
      return;
    }

    const centre = this.filteredPoints.reduce(
      (sum, point) => ({
        latitude: sum.latitude + point.latitude,
        longitude: sum.longitude + point.longitude,
      }),
      { latitude: 0, longitude: 0 }
    );
    centre.latitude /= this.filteredPoints.length;
    centre.longitude /= this.filteredPoints.length;

    const radius = Math.max(
      ...this.filteredPoints.map((point) => calculateDistanceMeters(centre, point))
    );
    const travelledDistance = this.filteredPoints.slice(1).reduce(
      (total, point, index) => total + calculateDistanceMeters(this.filteredPoints[index], point),
      0
    );
    const netDisplacement = calculateDistanceMeters(first, last);
    const isSmallArea = radius <= INDOOR_DRIFT_MAX_RADIUS_METERS;
    const isWandering = travelledDistance >= radius * INDOOR_DRIFT_MIN_WANDER_RATIO;
    const endsNearStart = netDisplacement <= radius;

    if (!isSmallArea || !isWandering || !endsNearStart) {
      return;
    }

    // Keep the most precise point as the stationary location. Using the first
    // and last noisy points would still make the backend calculate fake travel.
    const anchor = this.filteredPoints.reduce((best, point) =>
      (point.accuracy ?? Number.POSITIVE_INFINITY) < (best.accuracy ?? Number.POSITIVE_INFINITY)
        ? point
        : best
    );
    const originalCount = this.filteredPoints.length;
    this.filteredPoints.length = 0;
    this.filteredPoints.push(anchor);
    console.log(
      `[LocationManager] Indoor drift detected: ${originalCount} points, ${radius.toFixed(1)}m radius, ${travelledDistance.toFixed(1)}m jitter over ${durationSeconds.toFixed(0)}s -> stationary anchor retained`
    );
  }

  public simplifyFinal(filtered: RunningPathPoint[] = this.filteredPoints): RunningPathPoint[] {

    if (filtered.length <= 2) {
      this.optimizedPoints.length = 0;
      this.optimizedPoints.push(...filtered);
      console.log(`[LocationManager] 📊 Polyline optimization: ${filtered.length} → ${filtered.length} points (not enough points to simplify)`);
      return [...this.optimizedPoints];
    }

    const route = filtered.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));

    const simplified = this.rdp.simplifyPreservingTurns(route);
    const compressedKeys = new Set(
      simplified.map((point) => `${point.latitude.toFixed(10)}|${point.longitude.toFixed(10)}`)
    );

    const rdpOptimized = filtered.filter((point) => {
      const key = `${point.latitude.toFixed(10)}|${point.longitude.toFixed(10)}`;
      return compressedKeys.has(key);
    });
    const optimized = this.preservePointDensity(filtered, rdpOptimized);

    this.optimizedPoints.length = 0;
    this.optimizedPoints.push(...optimized);
    const reduction = this.gpsFilter.snapshotSummary(filtered.length, optimized.length);
    console.log(`[LocationManager] 📊 Polyline optimization: ${filtered.length} → ${optimized.length} points (reduced by ${reduction}%)`);
    return [...this.optimizedPoints];
  }

  /**
   * RDP preserves shape, but a long straight section can still be represented
   * by only its endpoints. Keep an original sample every five metres so the
   * Activity page remains recognisably close to the recorded route.
   */
  private preservePointDensity(
    original: RunningPathPoint[],
    rdpPoints: RunningPathPoint[]
  ): RunningPathPoint[] {
    const rdpKeys = new Set(
      rdpPoints.map((point) => `${point.latitude.toFixed(10)}|${point.longitude.toFixed(10)}`)
    );
    const retained: RunningPathPoint[] = [];
    let lastRetained: RunningPathPoint | null = null;

    for (const point of original) {
      const key = `${point.latitude.toFixed(10)}|${point.longitude.toFixed(10)}`;
      const isRdpPoint = rdpKeys.has(key);
      const isDensityPoint = lastRetained !== null
        && calculateDistanceMeters(lastRetained, point) >= MAX_FINAL_POINT_GAP_METERS;

      if (retained.length === 0 || isRdpPoint || isDensityPoint) {
        retained.push(point);
        lastRetained = point;
      }
    }

    const finalPoint = original.at(-1);
    if (finalPoint && retained.at(-1)?.sequence !== finalPoint.sequence) {
      retained.push(finalPoint);
    }

    return retained;
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
