import type {
  ActivityExtraPayload,
  ActivityGpsPointPayload,
  ActivityPauseEventPayload,
  ActivityRecoveryPayload,
  ActivitySegmentPayload,
  ActivitySubmissionPayload,
} from '../types/running';

type TimestampReference = Pick<ActivityGpsPointPayload, 'timestamp'>;
type CompactedRecovery = Omit<ActivityRecoveryPayload, 'gps_points'> & {
  gps_points: TimestampReference[];
};
type CompactedSegment = Omit<ActivitySegmentPayload, 'gps_points' | 'recovery'> & {
  gps_points: TimestampReference[];
  recovery?: CompactedRecovery | null;
};
type CompactedExtra = Omit<ActivityExtraPayload, 'gps_points'> & {
  gps_points: TimestampReference[];
};

export type CompactedActivitySubmissionPayload = Omit<
  ActivitySubmissionPayload,
  'segments' | 'extra'
> & {
  segments?: CompactedSegment[];
  extra?: CompactedExtra | null;
};

export interface ActivityPayloadCompactionResult {
  payload: CompactedActivitySubmissionPayload;
  originalBytes: number;
  bytes: number;
  toleranceMeters: number | null;
}

const DEFAULT_BYTE_BUDGET = 900 * 1024;
export const MAX_BACKEND_GPS_ACCURACY_METERS = 30;
const SIMPLIFICATION_TOLERANCES_METERS = [1, 2, 3.5, 5, 8, 12];
const MAX_TIME_GAP_SECONDS = 20;

export interface ActivityGpsAccuracyFilterResult {
  payload: ActivitySubmissionPayload;
  rejectedPointCount: number;
}

export const normalizeActivityPauseMetrics = (
  input: ActivitySubmissionPayload,
): ActivitySubmissionPayload => {
  const pauseEvents = (input.pause_events ?? []).map((pause) => {
    const resumedAt = pause.resumed_at ?? input.end_time;
    const pausedAtMs = Date.parse(pause.paused_at);
    const resumedAtMs = Date.parse(resumedAt);
    if (!Number.isFinite(pausedAtMs) || !Number.isFinite(resumedAtMs) || resumedAtMs < pausedAtMs) {
      throw new RangeError(`Pause event ${pause.sequence} has invalid timestamps.`);
    }

    return {
      ...pause,
      resumed_at: resumedAt,
      duration_s: (resumedAtMs - pausedAtMs) / 1000,
    };
  });

  return {
    ...input,
    pause_events: pauseEvents,
    pause_count: pauseEvents.length,
    paused_time_s: pauseEvents.reduce((total, pause) => total + (pause.duration_s ?? 0), 0),
  };
};

const normalizeTimestampToWholeSeconds = (timestamp: string): string => {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    throw new RangeError('Workout timestamp is invalid.');
  }

  return new Date(Math.floor(timestampMs / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
};

export const normalizeActivityTimestampsToSeconds = (
  input: ActivitySubmissionPayload,
): ActivitySubmissionPayload => {
  const normalizePoint = (point: ActivityGpsPointPayload): ActivityGpsPointPayload => ({
    ...point,
    timestamp: normalizeTimestampToWholeSeconds(point.timestamp),
  });

  return {
    ...input,
    start_time: normalizeTimestampToWholeSeconds(input.start_time),
    end_time: normalizeTimestampToWholeSeconds(input.end_time),
    gps_points: input.gps_points.map(normalizePoint),
    ...(input.steps_per_minute
      ? {
        steps_per_minute: input.steps_per_minute.map((interval) => ({
          ...interval,
          start_time: normalizeTimestampToWholeSeconds(interval.start_time),
          end_time: normalizeTimestampToWholeSeconds(interval.end_time),
        })),
      }
      : {}),
    ...(input.lap_events
      ? {
        lap_events: input.lap_events.map((event) => ({
          ...event,
          timestamp: normalizeTimestampToWholeSeconds(event.timestamp),
        })),
      }
      : {}),
    ...(input.segments
      ? {
        segments: input.segments.map((segment) => ({
          ...segment,
          gps_points: segment.gps_points.map(normalizePoint),
          ...(segment.recovery
            ? {
              recovery: {
                ...segment.recovery,
                gps_points: segment.recovery.gps_points.map(normalizePoint),
              },
            }
            : {}),
        })),
      }
      : {}),
    ...(input.extra
      ? { extra: { ...input.extra, gps_points: input.extra.gps_points.map(normalizePoint) } }
      : {}),
    ...(input.pause_events
      ? {
        pause_events: input.pause_events.map((pause) => ({
          ...pause,
          paused_at: normalizeTimestampToWholeSeconds(pause.paused_at),
          resumed_at: pause.resumed_at
            ? normalizeTimestampToWholeSeconds(pause.resumed_at)
            : null,
          paused_points: pause.paused_points.map(normalizePoint),
        })),
      }
      : {}),
  };
};

export const filterActivityPointsForBackendAccuracy = (
  input: ActivitySubmissionPayload,
): ActivityGpsAccuracyFilterResult => {
  const gpsPoints = input.gps_points.filter((point) => (
    point.accuracy === null
    || point.accuracy === undefined
    || (Number.isFinite(point.accuracy) && point.accuracy <= MAX_BACKEND_GPS_ACCURACY_METERS)
  ));
  const retainedTimestamps = new Set(gpsPoints.map(({ timestamp }) => timestamp));
  const retainMatchingPoints = (points: ActivityGpsPointPayload[]) => (
    points.filter(({ timestamp }) => retainedTimestamps.has(timestamp))
  );
  const filterSegment = (segment: ActivitySegmentPayload): ActivitySegmentPayload => ({
    ...segment,
    gps_points: retainMatchingPoints(segment.gps_points),
    ...(segment.recovery
      ? { recovery: { ...segment.recovery, gps_points: retainMatchingPoints(segment.recovery.gps_points) } }
      : {}),
  });

  return {
    payload: {
      ...input,
      gps_points: gpsPoints,
      ...(input.segments ? { segments: input.segments.map(filterSegment) } : {}),
      ...(input.extra
        ? { extra: { ...input.extra, gps_points: retainMatchingPoints(input.extra.gps_points) } }
        : {}),
    },
    rejectedPointCount: input.gps_points.length - gpsPoints.length,
  };
};

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

const byteSize = (payload: CompactedActivitySubmissionPayload): number => {
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) {
    throw new Error('Workout payload could not be serialized as JSON.');
  }
  return utf8ByteLength(serialized);
};

const timestampReferences = (points: ActivityGpsPointPayload[]): TimestampReference[] => (
  points.map(({ timestamp }) => ({ timestamp }))
);

const compactRecovery = (recovery: ActivityRecoveryPayload): CompactedRecovery => ({
  ...recovery,
  gps_points: timestampReferences(recovery.gps_points),
});

const compactSegment = (segment: ActivitySegmentPayload): CompactedSegment => ({
  ...segment,
  gps_points: timestampReferences(segment.gps_points),
  ...(segment.recovery ? { recovery: compactRecovery(segment.recovery) } : {}),
});

const deduplicateRouteReferences = (
  payload: ActivitySubmissionPayload,
): CompactedActivitySubmissionPayload => ({
  ...payload,
  ...(payload.segments
    ? { segments: payload.segments.map(compactSegment) }
    : {}),
  ...(payload.extra
    ? {
      extra: {
        ...payload.extra,
        gps_points: timestampReferences(payload.extra.gps_points),
      },
    }
    : {}),
});

const validCoordinate = (point: ActivityGpsPointPayload): boolean => (
  Number.isFinite(point.latitude)
  && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90
  && Math.abs(point.longitude) <= 180
);

const pointTime = (point: ActivityGpsPointPayload): number | null => {
  const time = Date.parse(point.timestamp);
  return Number.isFinite(time) ? time : null;
};

const perpendicularDistanceMeters = (
  point: ActivityGpsPointPayload,
  start: ActivityGpsPointPayload,
  end: ActivityGpsPointPayload,
): number => {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude
    * Math.cos(start.latitude * Math.PI / 180);
  const px = (point.longitude - start.longitude) * metersPerDegreeLongitude;
  const py = (point.latitude - start.latitude) * metersPerDegreeLatitude;
  const ex = (end.longitude - start.longitude) * metersPerDegreeLongitude;
  const ey = (end.latitude - start.latitude) * metersPerDegreeLatitude;
  const lengthSquared = ex * ex + ey * ey;
  if (lengthSquared === 0) return Math.hypot(px, py);
  const fraction = Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - fraction * ex, py - fraction * ey);
};

const simplifyPoints = (
  points: ActivityGpsPointPayload[],
  toleranceMeters: number,
  protectedTimestamps: ReadonlySet<string> = new Set(),
): ActivityGpsPointPayload[] => {
  const count = points.length;
  if (count <= 2) return points;

  const keep = new Array<boolean>(count).fill(false);
  keep[0] = true;
  keep[count - 1] = true;

  for (let index = 0; index < count; index += 1) {
    const point = points[index];
    if (!validCoordinate(point) || pointTime(point) === null
      || protectedTimestamps.has(point.timestamp)) {
      keep[index] = true;
    }
    if (index > 0
      && points[index - 1].is_extra_distance !== point.is_extra_distance) {
      keep[index - 1] = true;
      keep[index] = true;
    }
  }

  const anchors: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (keep[index]) anchors.push(index);
  }

  const ranges = anchors.slice(1).map((end, index) => [anchors[index], end] as const);
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    if (endIndex - startIndex <= 1) continue;

    const start = points[startIndex];
    const end = points[endIndex];
    let maximumDistance = 0;
    let maximumIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularDistanceMeters(points[index], start, end);
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }

    if (maximumDistance > toleranceMeters && maximumIndex >= 0) {
      keep[maximumIndex] = true;
      ranges.push([startIndex, maximumIndex], [maximumIndex, endIndex]);
    }
  }

  let lastKeptIndex = 0;
  for (let index = 1; index < count; index += 1) {
    if (keep[index]) {
      lastKeptIndex = index;
      continue;
    }
    const nextIndex = Math.min(index + 1, count - 1);
    const previousTime = pointTime(points[lastKeptIndex]);
    const nextTime = pointTime(points[nextIndex]);
    if (previousTime !== null && nextTime !== null
      && (nextTime - previousTime) / 1000 > MAX_TIME_GAP_SECONDS) {
      keep[index] = true;
      lastKeptIndex = index;
    }
  }

  return points.filter((_, index) => keep[index]);
};

const edgeTimestamps = (points: TimestampReference[]): string[] => {
  if (points.length === 0) return [];
  return points.length === 1
    ? [points[0].timestamp]
    : [points[0].timestamp, points[points.length - 1].timestamp];
};

const collectProtectedTimestamps = (
  payload: CompactedActivitySubmissionPayload,
): Set<string> => {
  const timestamps = new Set<string>();
  const addEdges = (points: TimestampReference[]) => {
    edgeTimestamps(points).forEach((timestamp) => timestamps.add(timestamp));
  };
  payload.segments?.forEach((segment) => {
    addEdges(segment.gps_points);
    if (segment.recovery) addEdges(segment.recovery.gps_points);
  });
  if (payload.extra) addEdges(payload.extra.gps_points);
  return timestamps;
};

const filterReferences = (
  points: TimestampReference[],
  keptTimestamps: ReadonlySet<string>,
): TimestampReference[] => points.filter(({ timestamp }) => keptTimestamps.has(timestamp));

const thinPayload = (
  payload: CompactedActivitySubmissionPayload,
  toleranceMeters: number,
): CompactedActivitySubmissionPayload => {
  const protectedTimestamps = collectProtectedTimestamps(payload);
  const gpsPoints = simplifyPoints(payload.gps_points, toleranceMeters, protectedTimestamps);
  const keptTimestamps = new Set(gpsPoints.map(({ timestamp }) => timestamp));

  const filterSegment = (segment: CompactedSegment): CompactedSegment => ({
    ...segment,
    gps_points: filterReferences(segment.gps_points, keptTimestamps),
    ...(segment.recovery
      ? {
        recovery: {
          ...segment.recovery,
          gps_points: filterReferences(segment.recovery.gps_points, keptTimestamps),
        },
      }
      : {}),
  });

  return {
    ...payload,
    gps_points: gpsPoints,
    ...(payload.segments
      ? { segments: payload.segments.map(filterSegment) }
      : {}),
    ...(payload.extra
      ? { extra: { ...payload.extra, gps_points: filterReferences(payload.extra.gps_points, keptTimestamps) } }
      : {}),
    ...(payload.pause_events
      ? {
        pause_events: payload.pause_events.map((pause: ActivityPauseEventPayload) => ({
          ...pause,
          paused_points: simplifyPoints(pause.paused_points, toleranceMeters),
        })),
      }
      : {}),
  };
};

export const compactActivitySubmissionPayload = (
  input: ActivitySubmissionPayload,
  byteBudget = DEFAULT_BYTE_BUDGET,
): ActivityPayloadCompactionResult => {
  if (!Number.isFinite(byteBudget) || byteBudget <= 0) {
    throw new RangeError('Workout payload byte budget must be a positive finite number.');
  }

  const originalBytes = byteSize(input);
  let payload = deduplicateRouteReferences(input);
  let bytes = byteSize(payload);
  if (bytes <= byteBudget) {
    return { payload, originalBytes, bytes, toleranceMeters: null };
  }

  let toleranceMeters: number | null = null;
  for (const tolerance of SIMPLIFICATION_TOLERANCES_METERS) {
    payload = thinPayload(payload, tolerance);
    bytes = byteSize(payload);
    toleranceMeters = tolerance;
    if (bytes <= byteBudget) break;
  }

  return { payload, originalBytes, bytes, toleranceMeters };
};
