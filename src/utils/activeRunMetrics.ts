export interface ActiveRunTimingState {
  startedAt?: string | null;
  elapsedSeconds?: number;
  updatedAt?: number | null;
  paused?: boolean;
  pauseEvents?: { paused_at: string; resumed_at: string | null }[];
}

/** Average pace in minutes per kilometre using active (moving) time. */
export const calculateMovingPaceMinutesPerKm = (
  movingSeconds: number,
  distanceKm: number,
): number => (
  Number.isFinite(movingSeconds)
  && movingSeconds > 0
  && Number.isFinite(distanceKm)
  && distanceKm > 0
    ? movingSeconds / 60 / distanceKm
    : 0
);

export const calculateActiveRunElapsedSeconds = (
  session: ActiveRunTimingState,
  now: number
): number => {
  // Persisted elapsed time is the active-time checkpoint. Advancing from that
  // checkpoint avoids counting time when the process/device was unavailable.
  if (Number.isFinite(session.elapsedSeconds) && Number.isFinite(session.updatedAt)) {
    const checkpoint = Math.max(0, session.elapsedSeconds ?? 0);
    return checkpoint + (!session.paused
      ? Math.max(0, (now - (session.updatedAt ?? now)) / 1000)
      : 0);
  }

  const startedAt = session.startedAt ? Date.parse(session.startedAt) : Number.NaN;
  if (!Number.isFinite(startedAt)) {
    const elapsed = session.elapsedSeconds ?? 0;
    return elapsed + (!session.paused && session.updatedAt
      ? Math.max(0, (now - session.updatedAt) / 1000)
      : 0);
  }

  const pausedMilliseconds = (session.pauseEvents ?? []).reduce((total, event) => {
    const pauseStartedAt = Date.parse(event.paused_at);
    if (!Number.isFinite(pauseStartedAt)) return total;
    const pauseEndedAt = event.resumed_at
      ? Date.parse(event.resumed_at)
      : session.paused
        ? now
        : pauseStartedAt;
    return Number.isFinite(pauseEndedAt) && pauseEndedAt >= pauseStartedAt
      ? total + pauseEndedAt - pauseStartedAt
      : total;
  }, 0);

  return Math.max(0, (now - startedAt - pausedMilliseconds) / 1000);
};
