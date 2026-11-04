export interface ActiveRunTimingState {
  startedAt?: string | null;
  elapsedSeconds?: number;
  updatedAt?: number | null;
  paused?: boolean;
  pauseEvents?: { paused_at: string; resumed_at: string | null }[];
}

export const calculateActiveRunElapsedSeconds = (
  session: ActiveRunTimingState,
  now: number
): number => {
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
