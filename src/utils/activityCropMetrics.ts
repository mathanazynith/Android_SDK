import { calculateDistanceMeters } from './distance';

export interface ActivityCropPoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
  is_paused?: boolean;
  pause_sequence?: number | null;
}

export interface ActivityCropPause {
  sequence?: number;
  paused_at?: string;
  resumed_at?: string | null;
  duration_s?: number | null;
}

interface PauseInterval {
  start: number;
  end: number;
}

const getPauseIntervals = (
  points: ActivityCropPoint[],
  pauseEvents: ActivityCropPause[],
  cropEnd: number,
): PauseInterval[] => {
  const eventIntervals = pauseEvents.flatMap((event) => {
    const start = event.paused_at ? Date.parse(event.paused_at) : Number.NaN;
    const durationSeconds = event.duration_s;
    const eventEnd = event.resumed_at
      ? Date.parse(event.resumed_at)
      : typeof durationSeconds === 'number'
          && Number.isFinite(durationSeconds)
          && durationSeconds >= 0
        ? start + durationSeconds * 1000
        : cropEnd;
    return Number.isFinite(start) && Number.isFinite(eventEnd) && eventEnd > start
      ? [{ start, end: eventEnd }]
      : [];
  });
  if (eventIntervals.length > 0) return eventIntervals;

  const intervals = new Map<string, PauseInterval>();
  let inferredSequence = 0;
  let wasPaused = false;
  let lastPauseKey: string | undefined;
  points.forEach((point) => {
    if (!point.is_paused) {
      if (wasPaused && lastPauseKey && point.timestamp) {
        const timestamp = Date.parse(point.timestamp);
        const current = intervals.get(lastPauseKey);
        if (current && Number.isFinite(timestamp)) {
          intervals.set(lastPauseKey, { start: current.start, end: Math.max(current.end, timestamp) });
        }
      }
      wasPaused = false;
      lastPauseKey = undefined;
      return;
    }
    if (!wasPaused) inferredSequence += 1;
    wasPaused = true;
    if (!point.timestamp) return;
    const timestamp = Date.parse(point.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const sequence = point.pause_sequence === null || point.pause_sequence === undefined
      ? `inferred:${inferredSequence}`
      : `backend:${point.pause_sequence}`;
    lastPauseKey = sequence;
    const current = intervals.get(sequence);
    intervals.set(sequence, current
      ? { start: Math.min(current.start, timestamp), end: Math.max(current.end, timestamp) }
      : { start: timestamp, end: timestamp });
  });
  return [...intervals.values()].filter(({ end, start }) => end > start);
};

const getPauseOverlapSeconds = (
  intervals: PauseInterval[],
  cropStart: number,
  cropEnd: number,
): number => {
  const clipped = intervals
    .map(({ start, end }) => ({
      start: Math.max(start, cropStart),
      end: Math.min(end, cropEnd),
    }))
    .filter(({ end, start }) => end > start)
    .sort((left, right) => left.start - right.start);

  let pausedMilliseconds = 0;
  let current: PauseInterval | undefined;
  for (const interval of clipped) {
    if (!current) {
      current = interval;
      continue;
    }
    if (interval.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, interval.end) };
      continue;
    }
    pausedMilliseconds += current.end - current.start;
    current = interval;
  }
  if (current) pausedMilliseconds += current.end - current.start;
  return pausedMilliseconds / 1000;
};

export const calculateActivityCropMetrics = (
  points: ActivityCropPoint[],
  startIndex: number,
  endIndex: number,
  pauseEvents: ActivityCropPause[] = [],
): { distanceMeters: number; elapsedSeconds: number; movingSeconds: number } => {
  if (points.length === 0 || startIndex < 0 || endIndex >= points.length || startIndex >= endIndex) {
    return { distanceMeters: 0, elapsedSeconds: 0, movingSeconds: 0 };
  }

  let distanceMeters = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next || current.is_paused || next.is_paused) continue;
    distanceMeters += calculateDistanceMeters(current, next);
  }

  const startTimestamp = points[startIndex]?.timestamp;
  const endTimestamp = points[endIndex]?.timestamp;
  const cropStart = startTimestamp ? Date.parse(startTimestamp) : Number.NaN;
  const cropEnd = endTimestamp ? Date.parse(endTimestamp) : Number.NaN;
  if (!Number.isFinite(cropStart) || !Number.isFinite(cropEnd) || cropEnd <= cropStart) {
    return { distanceMeters, elapsedSeconds: 0, movingSeconds: 0 };
  }

  const selectedDuration = (cropEnd - cropStart) / 1000;
  const pausedSeconds = getPauseOverlapSeconds(
    getPauseIntervals(points, pauseEvents, cropEnd),
    cropStart,
    cropEnd,
  );
  const elapsedSeconds = Math.max(0, Math.round(selectedDuration));
  const movingSeconds = Math.max(0, Math.round(selectedDuration - pausedSeconds));
  return {
    distanceMeters,
    elapsedSeconds,
    movingSeconds: Math.min(elapsedSeconds, movingSeconds),
  };
};
