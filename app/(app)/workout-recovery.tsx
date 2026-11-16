import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../service/auth';
import { clearActiveRunJournal, readActiveRunJournal } from '../../src/services/activeRunJournal';
import { getBackgroundLocationSession, clearBackgroundLocationSession, stopBackgroundLocationTracking, flushBackgroundLocationTask } from '../../src/services/backgroundLocationTask';
import { offlineWorkoutQueue } from '../../src/services/offlineWorkoutQueue';
import { getPendingWorkoutRecovery, removePendingWorkoutRecovery } from '../../src/services/pendingWorkoutRecoveries';
import { RunningApiClient } from '../../src/services/runningApi';
import { stopLiveTrackingNotification } from '../../src/services/liveTrackingNotification';
import type { ActivityGpsPointPayload, ActivityPauseEventPayload, ActivitySubmissionPayload } from '../../src/types/running';

const formatDuration = (value: number) => {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};

export default function WorkoutRecoveryScreen() {
  const { recoveryId } = useLocalSearchParams<{ recoveryId?: string }>();
  const { user } = useAuth();
  const [recovery, setRecovery] = useState<Awaited<ReturnType<typeof getPendingWorkoutRecovery>>>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (typeof recoveryId !== 'string') throw new Error('This saved workout recovery could not be identified.');
        const item = await getPendingWorkoutRecovery(recoveryId);
        if (!item) throw new Error('This saved workout recovery is no longer available.');
        if (item.session.userId && String(item.session.userId) !== String(user?.id ?? '')) {
          throw new Error('This workout belongs to a different account.');
        }
        if (active) setRecovery(item);
      } catch (error: any) {
        Alert.alert('Recovery unavailable', error?.message ?? 'The saved workout could not be loaded.', [
          { text: 'Close', onPress: () => router.dismiss() },
        ]);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [recoveryId, user?.id]);

  const finishAction = async (action: 'save' | 'discard') => {
    if (actionLock.current || !recovery) return;
    actionLock.current = true;
    setBusy(true);
    const id = recovery.id;
    try {
      const current = await getPendingWorkoutRecovery(id);
      if (!current || current.session.runId !== recovery.session.runId) throw new Error('This saved workout recovery is no longer available.');
      if (current.session.userId && String(current.session.userId) !== String(user?.id ?? '')) throw new Error('This workout belongs to a different account.');

      if (action === 'discard') {
        const trackingStopped = await stopBackgroundLocationTracking();
        if (!trackingStopped) throw new Error('Background tracking could not be stopped. Please try again.');
        await flushBackgroundLocationTask();
        if (id && !id.startsWith('RUN-') && !id.includes('-OFFLINE')) {
          await new RunningApiClient().stopRun({ run_id: id, ended_at: new Date().toISOString(), final_sequence: current.journal.points.length });
        }
        await removePendingWorkoutRecovery(id);
        const session = await getBackgroundLocationSession();
        if (session?.runId === id) await clearBackgroundLocationSession();
        const journal = await readActiveRunJournal();
        if (journal?.runId === id) await clearActiveRunJournal();
        await stopLiveTrackingNotification();
      } else {
        const trackingStopped = await stopBackgroundLocationTracking();
        if (!trackingStopped) throw new Error('Background tracking could not be stopped. Please try again.');
        await flushBackgroundLocationTask();
        await stopLiveTrackingNotification();
        const startedAt = Date.parse(current.session.startedAt ?? current.journal.startedAt);
        if (!Number.isFinite(startedAt)) throw new Error('The saved workout start time is invalid.');
        const elapsed = Math.max(0, Number(current.session.elapsedSeconds ?? 0));
        const endAt = startedAt + elapsed * 1000;
        const pauses = current.session.pauseEvents ?? [];
        const pausedSeconds = pauses.reduce((total, event) => {
          const recorded = Number(event.duration_s);
          if (Number.isFinite(recorded)) return total + Math.max(0, recorded);
          const from = Date.parse(event.paused_at);
          const to = event.resumed_at ? Date.parse(event.resumed_at) : endAt;
          return total + (Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, Math.min(endAt, to) - from) / 1000 : 0);
        }, 0);
        const moving = Math.max(0, elapsed - pausedSeconds);
        const pointPayload = (point: typeof current.journal.points[number], paused: boolean, sequence: number | null): ActivityGpsPointPayload => ({
          latitude: point.latitude, longitude: point.longitude,
          altitude: point.altitude ?? null, accuracy: point.accuracy ?? null,
          speed: point.speed ?? null, heading: point.heading ?? null,
          timestamp: new Date(Number(point.timestamp)).toISOString(),
          is_extra_distance: false, is_paused: paused, pause_sequence: sequence,
        });
        const pauseEvents: ActivityPauseEventPayload[] = pauses.map((event, index) => {
          const pausePoints = (current.journal.pausePoints ?? []).filter((point) => point.pauseSequence === index + 1);
          return {
            ...event, sequence: index + 1,
            paused_points: pausePoints.map((point) => pointPayload(point, true, index + 1)),
          };
        });
        const points = current.journal.points.map((point) => {
          const timestamp = Number(point.timestamp);
          const pauseSequence = pauses.findIndex((event) => timestamp >= Date.parse(event.paused_at)
            && timestamp <= (event.resumed_at ? Date.parse(event.resumed_at) : endAt));
          return pointPayload(point, pauseSequence >= 0, pauseSequence >= 0 ? pauseSequence + 1 : null);
        });
        const distanceMeters = Math.max(0, Number(current.session.distanceKm ?? 0) * 1000);
        const pace = distanceMeters > 0 ? moving / (distanceMeters / 1000) : 0;
        const stepData = current.journal.stepData?.intervalSteps ?? [];
        const payload: ActivitySubmissionPayload = {
          gps_points: points,
          start_time: new Date(startedAt).toISOString(), end_time: new Date(endAt).toISOString(),
          elapsed_time: Math.round(elapsed), moving_time: Math.round(moving),
          elapsed_time_s: Math.round(elapsed), moving_time_s: Math.round(moving),
          activity_type: current.session.activityType ?? 'RUN',
          distance: distanceMeters, distance_meters: distanceMeters, workout_distance_meters: distanceMeters,
          additional_distance_meters: 0, total_distance_meters: distanceMeters, split_distance_m: 1000,
          avg_pace: pace, pace_seconds_per_km: pace,
          total_steps: stepData.reduce((sum, item) => sum + Math.max(0, item.stepCount), 0),
          step_summary: { total_steps: stepData.reduce((sum, item) => sum + Math.max(0, item.stepCount), 0), counted_steps: stepData.reduce((sum, item) => sum + Math.max(0, item.stepCount), 0), step_tracking_source: 'Pedometer' },
          steps_per_minute: stepData.map((item) => {
            const start = startedAt + (item.intervalNumber - 1) * 60_000;
            const end = Math.min(start + 60_000, endAt);
            const pausedMs = pauses.reduce((total, pause) => {
              const pauseStart = Date.parse(pause.paused_at);
              const pauseEnd = pause.resumed_at ? Date.parse(pause.resumed_at) : endAt;
              if (!Number.isFinite(pauseStart) || !Number.isFinite(pauseEnd)) return total;
              return total + Math.max(0, Math.min(end, pauseEnd) - Math.max(start, pauseStart));
            }, 0);
            return { interval_number: item.intervalNumber, start_time: new Date(start).toISOString(), end_time: new Date(Math.max(start, end)).toISOString(), step_count: item.stepCount, active_duration_s: Math.max(0, Math.round((end - start - pausedMs) / 1000)) };
          }),
          pause_events: pauseEvents, pause_count: pauseEvents.length, paused_time_s: Math.round(pausedSeconds),
        };
        try {
          const result = await new RunningApiClient().submitActivity(payload, id);
          if (!result.success) throw new Error('The server did not confirm the workout save.');
          await new RunningApiClient().stopRun({ run_id: id, ended_at: payload.end_time, final_sequence: current.journal.points.length });
        } catch (error) {
          // Persist the complete payload before removing the recovery so it remains retryable offline.
          await offlineWorkoutQueue.enqueue({ runId: id, userId: current.session.userId ?? null, payload, totalDistance: distanceMeters, movingTimePayloadSeconds: Math.round(moving), elapsedTimePayloadSeconds: Math.round(elapsed), pausedTimeSeconds: pausedSeconds, pauseCount: pauseEvents.length });
        }
        await removePendingWorkoutRecovery(id);
        const session = await getBackgroundLocationSession();
        if (session?.runId === id) await clearBackgroundLocationSession();
        const journal = await readActiveRunJournal();
        if (journal?.runId === id) await clearActiveRunJournal();
      }
      setRecovery(null);
      router.dismiss();
    } catch (error: any) {
      Alert.alert(action === 'discard' ? 'Could not discard workout' : 'Could not save workout', error?.message ?? 'Please try again.');
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#159447" /></SafeAreaView>;
  if (!recovery) return <SafeAreaView style={styles.center}><Text style={styles.title}>Recovery unavailable</Text><Pressable onPress={() => router.dismiss()}><Text style={styles.secondary}>Close</Text></Pressable></SafeAreaView>;
  const distance = Math.max(0, Number(recovery.session.distanceKm ?? 0));
  const elapsed = Math.max(0, Number(recovery.session.elapsedSeconds ?? 0));
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} bounces={false} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Unfinished workout</Text>
      <Text style={styles.description} numberOfLines={1}>
        {distance.toFixed(2)} km  ·  {formatDuration(elapsed)}  ·  {recovery.journal.points.length} GPS points
      </Text>
      <Pressable style={[styles.primary, busy && styles.disabled]} onPress={() => void finishAction('save')} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Working…' : 'Restore and Save Workout'}</Text></Pressable>
      <Pressable style={[styles.discard, busy && styles.disabled]} onPress={() => void finishAction('discard')} disabled={busy}><Text style={styles.discardText}>Discard Workout</Text></Pressable>
      <Pressable style={styles.later} onPress={() => router.dismiss()} disabled={busy}><Text style={styles.secondary}>Not Now</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F9F7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F9F7', gap: 16 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 14, gap: 6 },
  title: { color: '#17221A', fontSize: 21, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
  description: { color: '#67736A', textAlign: 'center', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  primary: { minHeight: 48, borderRadius: 15, backgroundColor: '#159447', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  discard: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  discardText: { color: '#C93636', fontWeight: '700', fontSize: 15 },
  later: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  secondary: { color: '#667269', fontSize: 15 },
  disabled: { opacity: 0.55 },
});
