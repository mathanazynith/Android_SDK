import type { RawGpsPayload } from '../types/running';

export interface PauseIntervalForTagging {
  paused_at: string;
  resumed_at: string | null;
}

export interface LocationTaggingState {
  paused?: boolean;
  traceType?: 'active' | 'pause' | 'extra';
  pauseEvents?: PauseIntervalForTagging[];
}

export const timestampMillis = (value: RawGpsPayload['timestamp']): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Date.parse(value);
  }
  return Number.NaN;
};

/** Classify each sample by its timestamp so a batched callback can cross pause boundaries. */
export const tagLocationBatch = <T extends RawGpsPayload>(
  points: T[],
  state: LocationTaggingState,
): Array<T & { traceType: 'active' | 'pause' | 'extra' }> => points.map((point) => {
  const pointTime = timestampMillis(point.timestamp);
  const pauseEvents = state.pauseEvents ?? [];
  const isInPauseInterval = pauseEvents.some((event) => {
    const pausedAt = Date.parse(event.paused_at);
    const resumedAt = event.resumed_at ? Date.parse(event.resumed_at) : Number.POSITIVE_INFINITY;
    return Number.isFinite(pausedAt) && pointTime >= pausedAt && pointTime <= resumedAt;
  });
  const openPauseStartedBeforePoint = pauseEvents.length > 0
    && pauseEvents.some((event) => (
      event.resumed_at === null
      && Number.isFinite(Date.parse(event.paused_at))
      && Date.parse(event.paused_at) <= pointTime
    ));
  const isPaused = isInPauseInterval || (
    Boolean(state.paused)
    && (pauseEvents.length === 0 || openPauseStartedBeforePoint)
  );
  return {
    ...point,
    traceType: isPaused ? 'pause' : state.traceType === 'extra' ? 'extra' : 'active',
  };
});
