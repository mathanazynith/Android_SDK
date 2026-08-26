import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkoutDetail } from './types';
import { useTheme } from '../../../../contexts/ThemeContext';

interface WorkoutModalProps { visible: boolean; workout: WorkoutDetail | null; onClose: () => void; }

export default function WorkoutModal({ visible, workout, onClose }: WorkoutModalProps) {
  const { colors } = useTheme();
  const [rendered, setRendered] = useState(visible);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(workout);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(30));

  useEffect(() => {
    if (visible && workout) {
      const openModal = setTimeout(() => {
        setActiveWorkout(workout);
        setRendered(true);
      }, 0);
      Animated.parallel([Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }), Animated.spring(translateY, { toValue: 0, damping: 17, stiffness: 180, useNativeDriver: true })]).start();
      return () => clearTimeout(openModal);
    }
    if (rendered) {
      Animated.parallel([Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }), Animated.timing(translateY, { toValue: 30, duration: 160, useNativeDriver: true })]).start(() => setRendered(false));
    }
  }, [opacity, rendered, translateY, visible, workout]);

  if (!rendered || !activeWorkout) return null;

  const content = <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
    <Text style={[styles.caption, { color: colors.text }]}>Workout Details</Text>
    <View style={styles.headerRow}><View style={styles.titleBlock}><Text style={[styles.title, { color: colors.textPrimary }]}>{activeWorkout.title}</Text><Text style={[styles.type, { color: colors.textSecondary }]}>{activeWorkout.workoutType}</Text></View><TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} accessibilityRole="button" accessibilityLabel="Close workout details"><Ionicons name="close" size={24} color={colors.icon} /></TouchableOpacity></View>
    <View style={styles.titleRow}><Text style={[styles.key, { color: colors.textSecondary }]}>Title</Text><Text style={[styles.value, { color: colors.text }]}>{activeWorkout.title}</Text></View>
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
    <DetailSection label="Description" text={activeWorkout.description} />
    <DetailSection label="Instructions" text={activeWorkout.instructions} />
    <DetailSection label="Warm Up" text={activeWorkout.warmUp} />
    {activeWorkout.steps.length > 0 ? <><Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Workout Steps</Text>{activeWorkout.steps.map((step, index) => <Text key={`${activeWorkout.id}-${index}`} style={[styles.step, { color: colors.textPrimary }]}>{`- ${step}`}</Text>)}</> : null}
    <DetailSection label="Cool Down" text={activeWorkout.coolDown} />
    <Text style={[styles.sectionLabel, styles.statsTitle, { color: colors.text, borderTopColor: colors.border }]}>Stats</Text>
    <View style={styles.statsRow}><Stat label="Est Calories" value={activeWorkout.estimatedCalories} /><Stat label="Duration" value={activeWorkout.estimatedDuration} /><Stat label="HR Zone" value={activeWorkout.heartRateZone} /></View>
    <View style={styles.statsRow}><Stat label="Target Pace" value={activeWorkout.targetPace} /><Stat label="Distance" value={activeWorkout.distance} /><Stat label="Notes" value={activeWorkout.notes} /></View>
    {!activeWorkout.isRest && <TouchableOpacity
      style={[styles.startButton, { backgroundColor: colors.primary }]}
      onPress={() => {
        // Planned sessions are the entry point to the live map tracker.
        onClose();
        router.push({
          pathname: '/(app)/run',
          params: { workoutId: activeWorkout.id, workoutTitle: activeWorkout.title, workoutType: activeWorkout.workoutType, workoutDuration: activeWorkout.estimatedDuration, workoutDistance: activeWorkout.distance, workoutPace: activeWorkout.targetPace },
        });
      }}
    >
      <Text style={[styles.startButtonText, { color: colors.primaryText }]}>Start Run</Text>
    </TouchableOpacity>}
  </ScrollView>;

  return <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose}><Animated.View style={[styles.overlay, { opacity, backgroundColor: colors.overlay }]}><BlurView intensity={24} tint={colors.background === '#F8FAFC' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} /><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><Animated.View style={[styles.cardWrapper, { transform: [{ translateY }] }]}>{Platform.OS === 'ios' ? <GlassView style={[styles.glassCard, { borderColor: colors.border }]} glassEffectStyle="regular" tintColor={colors.surface} colorScheme={colors.background === '#F8FAFC' ? 'light' : 'dark'}><LinearGradient pointerEvents="none" colors={[colors.surface, colors.surfaceRaised]} style={StyleSheet.absoluteFill} />{content}</GlassView> : <View style={[styles.androidCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><LinearGradient pointerEvents="none" colors={[colors.surface, colors.surfaceRaised]} style={StyleSheet.absoluteFill} />{content}</View>}</Animated.View></Animated.View></Modal>;
}

function DetailSection({ label, text }: { label: string; text: string }) {
  const { colors } = useTheme();
  return text ? <><Text style={[styles.sectionLabel, { color: colors.text }]}>{label}</Text><Text style={[styles.sectionText, { color: colors.textSecondary }]}>{text}</Text></> : null;
}
function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return value ? <View style={styles.stat}><Text style={[styles.statLabel, { color: colors.text }]}>{label}</Text><Text style={[styles.statValue, { color: colors.textSecondary }]}>{value}</Text></View> : null;
}

const cardBase = { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(212,255,195,0.34)', maxHeight: '84%' } as const;
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.70)', justifyContent: 'center', paddingHorizontal: 18 },
  cardWrapper: { maxHeight: '84%' },
  glassCard: { ...cardBase, overflow: 'hidden' },
  androidCard: { ...cardBase, overflow: 'hidden', backgroundColor: 'rgba(15, 29, 20, 0.96)' },
  scrollContent: { padding: 22, paddingBottom: 26 },
  caption: { fontSize: 18, marginBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flex: 1 },
  title: { fontSize: 32, fontWeight: '500', lineHeight: 38 },
  type: { fontSize: 16, marginTop: 3 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  key: { fontSize: 17 },
  value: { fontSize: 16, fontWeight: '600', maxWidth: '65%', textAlign: 'right' },
  divider: { height: 1, marginTop: 14 },
  sectionLabel: { fontSize: 18, fontWeight: '600', marginTop: 17, marginBottom: 5 },
  sectionText: { fontSize: 16, lineHeight: 22 },
  step: { fontSize: 16, lineHeight: 22, marginBottom: 5 },
  statsTitle: { borderTopWidth: 1, paddingTop: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1 },
  statLabel: { color: '#FFF', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  statValue: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 19 },
  startButton: { marginTop: 24, backgroundColor: '#63C72B', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startButtonText: { fontSize: 17, fontWeight: '700' },
});
