import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WorkoutDetail } from './types';

interface WorkoutModalProps { visible: boolean; workout: WorkoutDetail | null; onClose: () => void; }

export default function WorkoutModal({ visible, workout, onClose }: WorkoutModalProps) {
  const [rendered, setRendered] = useState(visible);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(workout);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (visible && workout) {
      setActiveWorkout(workout);
      setRendered(true);
      Animated.parallel([Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }), Animated.spring(translateY, { toValue: 0, damping: 17, stiffness: 180, useNativeDriver: true })]).start();
      return;
    }
    if (rendered) {
      Animated.parallel([Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }), Animated.timing(translateY, { toValue: 30, duration: 160, useNativeDriver: true })]).start(() => setRendered(false));
    }
  }, [opacity, rendered, translateY, visible, workout]);

  if (!rendered || !activeWorkout) return null;

  const content = <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
    <Text style={styles.caption}>Workout Details</Text>
    <View style={styles.headerRow}><View style={styles.titleBlock}><Text style={styles.title}>{activeWorkout.title}</Text><Text style={styles.type}>{activeWorkout.workoutType}</Text></View><TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close workout details"><Text style={styles.closeText}>×</Text></TouchableOpacity></View>
    <View style={styles.titleRow}><Text style={styles.key}>Title</Text><Text style={styles.value}>{activeWorkout.title}</Text></View>
    <View style={styles.divider} />
    <DetailSection label="Description" text={activeWorkout.description} />
    <DetailSection label="Instructions" text={activeWorkout.instructions} />
    <DetailSection label="Warm Up" text={activeWorkout.warmUp} />
    <Text style={styles.sectionLabel}>Workout Steps</Text>{activeWorkout.steps.map((step, index) => <Text key={`${activeWorkout.id}-${index}`} style={styles.step}>• {step}</Text>)}
    <DetailSection label="Cool Down" text={activeWorkout.coolDown} />
    <Text style={[styles.sectionLabel, styles.statsTitle]}>Stats</Text>
    <View style={styles.statsRow}><Stat label="Est Calories" value={activeWorkout.estimatedCalories} /><Stat label="Duration" value={activeWorkout.estimatedDuration} /><Stat label="HR Zone" value={activeWorkout.heartRateZone} /></View>
    <View style={styles.statsRow}><Stat label="Target Pace" value={activeWorkout.targetPace} /><Stat label="Distance" value={activeWorkout.distance} /><Stat label="Notes" value={activeWorkout.notes} /></View>
    {!activeWorkout.isRest && <TouchableOpacity
      style={styles.startButton}
      onPress={() => {
        // Planned sessions are the entry point to the live map tracker.
        onClose();
        router.push({
          pathname: '/(app)/run',
          params: { workoutId: activeWorkout.id, workoutTitle: activeWorkout.title, workoutType: activeWorkout.workoutType, workoutDuration: activeWorkout.estimatedDuration, workoutDistance: activeWorkout.distance, workoutPace: activeWorkout.targetPace },
        });
      }}
    >
      <Text style={styles.startButtonText}>▶ Start Run</Text>
    </TouchableOpacity>}
  </ScrollView>;

  return <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose}><Animated.View style={[styles.overlay, { opacity }]}><BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} /><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><Animated.View style={[styles.cardWrapper, { transform: [{ translateY }] }]}>{Platform.OS === 'ios' ? <GlassView style={styles.glassCard} glassEffectStyle="regular" tintColor="rgba(18, 42, 29, 0.68)" colorScheme="dark"><LinearGradient pointerEvents="none" colors={['rgba(104,199,71,0.22)', 'rgba(8,18,14,0.84)']} style={StyleSheet.absoluteFill} />{content}</GlassView> : <View style={styles.androidCard}><LinearGradient pointerEvents="none" colors={['rgba(104,199,71,0.25)', 'rgba(8,18,14,0.94)']} style={StyleSheet.absoluteFill} />{content}</View>}</Animated.View></Animated.View></Modal>;
}

function DetailSection({ label, text }: { label: string; text: string }) { return <><Text style={styles.sectionLabel}>{label}</Text><Text style={styles.sectionText}>{text}</Text></>; }
function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }

const cardBase = { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(212,255,195,0.34)', maxHeight: '84%' } as const;
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.70)', justifyContent: 'center', paddingHorizontal: 18 },
  cardWrapper: { maxHeight: '84%' },
  glassCard: { ...cardBase, overflow: 'hidden' },
  androidCard: { ...cardBase, overflow: 'hidden', backgroundColor: 'rgba(15, 29, 20, 0.96)' },
  scrollContent: { padding: 22, paddingBottom: 26 },
  caption: { color: '#F0F7EB', fontSize: 18, marginBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flex: 1 },
  title: { color: '#FFF', fontSize: 32, fontWeight: '500', lineHeight: 38 },
  type: { color: 'rgba(255,255,255,0.72)', fontSize: 16, marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  closeText: { color: 'rgba(255,255,255,0.74)', fontSize: 36, fontWeight: '200', lineHeight: 38 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  key: { color: 'rgba(255,255,255,0.72)', fontSize: 17 },
  value: { color: '#FFF', fontSize: 16, fontWeight: '600', maxWidth: '65%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 14 },
  sectionLabel: { color: '#FFF', fontSize: 18, fontWeight: '600', marginTop: 17, marginBottom: 5 },
  sectionText: { color: 'rgba(255,255,255,0.74)', fontSize: 16, lineHeight: 22 },
  step: { color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 22, marginBottom: 5 },
  statsTitle: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1 },
  statLabel: { color: '#FFF', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  statValue: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 19 },
  startButton: { marginTop: 24, backgroundColor: '#63C72B', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startButtonText: { color: '#091200', fontSize: 17, fontWeight: '700' },
});
