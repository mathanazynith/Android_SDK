import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, Spacing } from '../../../constants/theme';
// Local mock provider (keeps file self-contained so editor resolves types reliably).
import { ActivityStore } from '../../../src/services/activityStore';
import { MockGpsSource } from '../../../src/services/mockGpsSource';
import { RawGpsPayload } from '../../../src/types/running';

const getMockRunTrackerData = () => ({
  routeCoordinates: MockGpsSource.gentleCurve(),
  initialHeartRate: 132,
  initialPaceSecondsPerKm: 445,
  initialCalories: 14,
  caloriesPerSecond: 0.16,
  targetDistanceKm: 12,
});

type RunState = 'idle' | 'running' | 'paused' | 'completed';

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs > 0 ? `${hrs}:` : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatPace = (secondsPerKm: number) => {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
};

const getDistanceText = (meters: number) => `${(meters / 1000).toFixed(2)} km`;

const createRoutePath = (points: RawGpsPayload[]) => points.map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`).join(' | ');

export default function RunningTrackerScreen() {
  const router = useRouter();
  const { workoutTitle } = useLocalSearchParams();
  const workoutLabel = workoutTitle ?? 'Running Workout';
  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [heartRate, setHeartRate] = useState(getMockRunTrackerData().initialHeartRate);
  const [paceSecondsPerKm, setPaceSecondsPerKm] = useState(getMockRunTrackerData().initialPaceSecondsPerKm);
  const [calories, setCalories] = useState(getMockRunTrackerData().initialCalories);
  const [routePoints] = useState<RawGpsPayload[]>(getMockRunTrackerData().routeCoordinates);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runData = useMemo(() => getMockRunTrackerData(), []);

  useEffect(() => {
    if (runState !== 'running') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsedSeconds((sec) => sec + 1);
      setDistanceMeters((meters: number) => Math.min(meters + 3.35, runData.targetDistanceKm * 1000));
      setCalories((value: number) => value + runData.caloriesPerSecond);
      setHeartRate((value: number) => Math.min(180, value + Math.random() * 0.18));
      setPaceSecondsPerKm((pace: number) => {
        const drift = Math.random() * 0.3 - 0.15;
        return Math.max(365, Math.min(520, pace + drift));
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [runState, runData.caloriesPerSecond, runData.targetDistanceKm, runData]);

  const handleStart = () => {
    setRunState('running');
  };

  const handlePause = () => setRunState('paused');
  const handleResume = () => setRunState('running');
  const handleFinish = () => {
    setRunState('completed');

    // Save a summary record into ActivityStore
    const record = {
      id: `act-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      date: new Date().toISOString(),
      displayDate: new Date().toDateString(),
      workoutName: workoutLabel,
      distanceMeters,
      paceSecondsPerKm,
      durationSeconds: elapsedSeconds,
      calories: Math.round(calories),
      averageHeartRate: Math.round(heartRate),
      routeCoordinates: routePoints,
    };

    ActivityStore.add(record as any);
  };

  const isActive = runState === 'running';
  const statusLabel = runState === 'idle' ? 'Ready' : runState === 'running' ? 'Running' : runState === 'paused' ? 'Paused' : 'Completed';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back to workout details">
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={styles.smallLabel}>Running</Text>
          <Text style={styles.title}>{workoutLabel}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <View style={styles.mockMap}>
          <Text style={styles.mapLabel}>Route preview</Text>
          <Text style={styles.mapPath}>{createRoutePath(routePoints)}</Text>
          <View style={styles.routeDot} />
          <View style={styles.currentDot} />
        </View>
      </View>

      <View style={styles.statsSection}>
        <View style={styles.statCardLarge}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{getDistanceText(distanceMeters)}</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statCardSmall}>
            <Text style={styles.statLabel}>Time</Text>
            <Text style={styles.statValue}>{formatTime(elapsedSeconds)}</Text>
          </View>
          <View style={styles.statCardSmall}>
            <Text style={styles.statLabel}>Pace</Text>
            <Text style={styles.statValue}>{formatPace(paceSecondsPerKm)}</Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statCardSmall}>
            <Text style={styles.statLabel}>Heart Rate</Text>
            <Text style={styles.statValue}>{Math.round(heartRate)} bpm</Text>
          </View>
          <View style={styles.statCardSmall}>
            <Text style={styles.statLabel}>Calories</Text>
            <Text style={styles.statValue}>{Math.round(calories)} kcal</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlsSection}>
        {runState === 'idle' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={handleStart}>
            <Text style={styles.primaryButtonText}>Start Run</Text>
          </TouchableOpacity>
        ) : runState === 'running' ? (
          <View style={styles.controlRow}>
            <TouchableOpacity style={[styles.primaryButton, styles.secondaryButton]} onPress={handlePause}>
              <Text style={[styles.primaryButtonText, styles.secondaryButtonText]}>Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleFinish}>
              <Text style={styles.primaryButtonText}>Finish</Text>
            </TouchableOpacity>
          </View>
        ) : runState === 'paused' ? (
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleResume}>
              <Text style={styles.primaryButtonText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, styles.secondaryButton]} onPress={handleFinish}>
              <Text style={[styles.primaryButtonText, styles.secondaryButtonText]}>Finish</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.summarySection}>
            <Text style={styles.summaryTitle}>Run Completed</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Distance</Text><Text style={styles.summaryValue}>{getDistanceText(distanceMeters)}</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Time</Text><Text style={styles.summaryValue}>{formatTime(elapsedSeconds)}</Text></View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Pace</Text><Text style={styles.summaryValue}>{formatPace(paceSecondsPerKm)}</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Heart Rate</Text><Text style={styles.summaryValue}>{Math.round(heartRate)} bpm</Text></View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Calories</Text><Text style={styles.summaryValue}>{Math.round(calories)} kcal</Text></View>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(app)/calendar')}>
              <Text style={styles.primaryButtonText}>Back to Running Plan</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  backButton: { width: 44, height: 44, borderRadius: BorderRadius.xl, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, marginLeft: Spacing.sm },
  smallLabel: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(99,199,43,0.16)' },
  statusText: { color: '#B7F19A', fontSize: 13, fontWeight: '600' },
  mapContainer: { borderRadius: BorderRadius.xl, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', minHeight: 220, marginBottom: Spacing.md },
  mockMap: { flex: 1, padding: Spacing.md, justifyContent: 'space-between' },
  mapLabel: { color: Colors.textSecondary, fontSize: 12, marginBottom: Spacing.sm },
  mapPath: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 18 },
  routeDot: { position: 'absolute', top: 90, left: 42, width: 14, height: 14, borderRadius: 7, backgroundColor: '#63C72B', borderWidth: 2, borderColor: Colors.background },
  currentDot: { position: 'absolute', top: 140, left: 220, width: 12, height: 12, borderRadius: 6, backgroundColor: '#7BFF81', borderWidth: 2, borderColor: Colors.background },
  statsSection: { marginBottom: Spacing.md },
  statCardLarge: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: Spacing.lg, marginBottom: Spacing.sm },
  statCardSmall: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: Spacing.lg, marginRight: Spacing.sm },
  statRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  statLabel: { color: Colors.textSecondary, fontSize: 13, marginBottom: 8 },
  statValue: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  controlsSection: { marginBottom: Spacing.xl },
  primaryButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, paddingVertical: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: Colors.background, fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  secondaryButtonText: { color: Colors.text },
  controlRow: { flexDirection: 'row', gap: Spacing.sm },
  summarySection: { marginTop: Spacing.md, padding: Spacing.md, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  summaryCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.xl, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryLabel: { color: Colors.textSecondary, fontSize: 13, marginBottom: 6 },
  summaryValue: { color: Colors.text, fontSize: 18, fontWeight: '700' },
});
