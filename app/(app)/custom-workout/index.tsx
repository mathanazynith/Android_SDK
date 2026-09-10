import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/theme';
import { ScrollTimePicker } from '../../../components/ScrollTimePicker';
import { useCustomWorkout } from './workout-context';
import CustomWorkoutOverview from './overview';
import CustomWorkoutCards from './cards';
import {
  normalizeUnit,
  formatSecondsToPace,
} from '../../../src/utils/workoutCalculations';

type DurationMode = 'duration' | 'distance';
type PickerName = 'durationType' | 'distanceUnit' | null;

const pickerOptions = {
  durationType: ['Time', 'Distance'],
  distanceUnit: ['Kilometers (km)', 'Miles (mi)'],
} as const;

const toNumber = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0;

function CustomWorkoutWarmUp() {
  const { setWarmUp, workout } = useCustomWorkout();
  const existing = workout.warmUp;
  const existingTime = existing?.duration?.split(':') || [];
  const [durationMode, setDurationMode] = useState<DurationMode>(
    existing?.inputType === 'DISTANCE' || (!existing?.duration && !!existing?.distance)
      ? 'distance'
      : 'duration'
  );
  const [distanceUnit, setDistanceUnit] = useState(existing?.unit || 'Kilometers (km)');
  const [picker, setPicker] = useState<PickerName>(null);
  const [hours, setHours] = useState(existingTime[0] === '00' ? '' : existingTime[0] || '');
  const [minutes, setMinutes] = useState(existingTime[1] === '00' ? '' : existingTime[1] || '');
  const [seconds, setSeconds] = useState(existingTime[2] === '00' ? '' : existingTime[2] || '');
  const [distance, setDistance] = useState(existing?.distance || '');
  const [pace, setPace] = useState(existing?.pace || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const activeUnitType = useMemo(
    () => normalizeUnit(distanceUnit),
    [distanceUnit]
  );

  const calculatedPace = useMemo(() => {
    const totalSeconds = toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds);
    const distVal = toNumber(distance);
    if (!totalSeconds || !distVal) return '';
    const paceSeconds = totalSeconds / distVal;
    return formatSecondsToPace(paceSeconds, activeUnitType);
  }, [distance, activeUnitType, hours, minutes, seconds]);

  const pickerValues: Record<Exclude<PickerName, null>, string> = {
    durationType: durationMode === 'duration' ? 'Time' : 'Distance',
    distanceUnit,
  };

  const selectPickerValue = (value: string) => {
    if (picker === 'durationType') {
      setDurationMode(value === 'Time' ? 'duration' : 'distance');
    }
    if (picker === 'distanceUnit') {
      setDistanceUnit(value);
    }
    setPicker(null);
  };

  const pickerTitle = picker === 'durationType' ? 'Duration Type' : 'Distance Unit';

  const continueToRunning = () => {
    const hasDuration = toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds) > 0;
    const hasDistance = toNumber(distance) > 0;
    if (durationMode === 'duration' && !hasDuration) {
      Alert.alert('Duration required', 'Set the Warm Up time before continuing.');
      return;
    }
    if (durationMode === 'distance' && !hasDistance) {
      Alert.alert('Distance required', 'Enter the Warm Up distance before continuing.');
      return;
    }

    if (durationMode === 'duration') {
      setWarmUp({
        title: 'Warm Up',
        stepType: 'Warmup',
        inputType: 'DURATION',
        duration: `${hours || '00'}:${minutes || '00'}:${seconds || '00'}`,
        distance: '',
        unit: distanceUnit,
        pace: pace ? pace.trim() : '',
        repeat: 1,
        rest: '',
        skipLastRest: true,
        notes: notes.trim(),
      });
    } else {
      setWarmUp({
        title: 'Warm Up',
        stepType: 'Warmup',
        inputType: 'DISTANCE',
        duration: '',
        distance: distance.trim(),
        unit: distanceUnit,
        pace: pace ? pace.trim() : '',
        repeat: 1,
        rest: '',
        skipLastRest: true,
        notes: notes.trim(),
      });
    }
    router.push('/custom-workout/overview');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.headerButton}>
            <Feather name="arrow-left" size={26} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerBadge}>STEP 1</Text>
            <Text style={styles.headerTitle}>Warm Up</Text>
          </View>
          <TouchableOpacity onPress={continueToRunning} style={styles.doneButton}>
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>DURATION</Text>
          <View style={styles.section}>
            <PickerRow
              label="Duration Type"
              value={durationMode === 'duration' ? 'Time' : 'Distance'}
              onPress={() => setPicker('durationType')}
            />
            {durationMode === 'duration' ? (
              <View style={styles.inputGroup}>
                <ScrollTimePicker
                  label="Time"
                  value={`${hours || '00'}:${minutes || '00'}:${seconds || '00'}`}
                  allowEmpty={!hours && !minutes && !seconds}
                  onChange={(value) => {
                    const [nextHours, nextMinutes, nextSeconds] = value.split(':');
                    setHours(nextHours === '00' ? '' : nextHours);
                    setMinutes(nextMinutes === '00' ? '' : nextMinutes);
                    setSeconds(nextSeconds === '00' ? '' : nextSeconds);
                  }}
                />
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Distance</Text>
                <View style={styles.distanceRow}>
                  <TextInput
                    value={distance}
                    onChangeText={setDistance}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.distanceInput]}
                  />
                  <TouchableOpacity style={styles.unitButton} onPress={() => setPicker('distanceUnit')}>
                    <Text style={styles.unitText}>{distanceUnit.includes('Miles') ? 'mi' : 'km'}</Text>
                    <Feather name="chevron-down" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>INTENSITY TARGET (OPTIONAL)</Text>
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <View style={styles.paceHeader}>
                <Text style={styles.inputLabel}>Target Pace</Text>
                <Text style={styles.optional}>Optional</Text>
              </View>
              <TextInput
                value={pace}
                onChangeText={setPace}
                placeholder={calculatedPace || 'e.g. 5:30 / km'}
                placeholderTextColor={calculatedPace ? Colors.primaryLight : Colors.textMuted}
                style={styles.input}
                keyboardType="numbers-and-punctuation"
              />
              {!!calculatedPace && !pace && (
                <Text style={styles.calculated}>Estimated from duration & distance</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Warmup instructions or notes (optional)"
                placeholderTextColor={Colors.textMuted}
                style={[styles.input, styles.notesInput]}
                multiline
              />
            </View>
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={continueToRunning} activeOpacity={0.85}>
            <Text style={styles.continueText}>ADD NEXT STEP</Text>
            <Feather name="chevron-right" size={20} color={Colors.background} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{pickerTitle}</Text>
            {picker &&
              pickerOptions[picker].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalOption}
                  onPress={() => selectPickerValue(option)}
                >
                  <Text style={styles.modalOptionText}>{option}</Text>
                  {pickerValues[picker] === option && (
                    <Feather name="check" size={22} color={Colors.primaryLight} />
                  )}
                </TouchableOpacity>
              ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export default function CustomWorkoutEntry() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  if (step === 'warmup') return <CustomWorkoutWarmUp />;
  if (step === 'overview') return <CustomWorkoutOverview />;
  return <CustomWorkoutCards />;
}

function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pickerRow} onPress={onPress}>
      <View>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Feather name="chevron-down" size={22} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: '#101010' },
  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  headerCenter: { alignItems: 'center' },
  headerBadge: { color: Colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  doneButton: { minWidth: 58, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  doneText: { color: Colors.primaryLight, fontSize: 14, fontWeight: '800' },
  headerButton: { width: 55, paddingVertical: 12 },
  content: { paddingBottom: 40 },
  sectionLabel: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 10,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  pickerRow: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  rowTitle: { color: Colors.text, fontSize: 18, fontWeight: '500' },
  rowValue: { marginTop: 4, color: Colors.primaryLight, fontSize: 15 },
  inputGroup: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  inputLabel: { color: Colors.text, fontSize: 16, fontWeight: '500', marginBottom: 8 },
  input: {
    minHeight: 50,
    paddingHorizontal: 16,
    color: Colors.text,
    backgroundColor: '#2A2A2D',
    borderWidth: 1,
    borderColor: '#3E3E42',
    borderRadius: 10,
    fontSize: 16,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top', paddingTop: 12 },
  distanceRow: { flexDirection: 'row', gap: 10 },
  distanceInput: { flex: 1 },
  unitButton: {
    minWidth: 95,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: '#2A2A2D',
    borderWidth: 1,
    borderColor: '#3E3E42',
    borderRadius: 10,
  },
  unitText: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  paceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optional: { color: Colors.textMuted, fontSize: 13 },
  calculated: { marginTop: 6, color: Colors.primaryLight, fontSize: 12 },
  continueButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 28,
    backgroundColor: Colors.primary,
    borderRadius: 14,
  },
  continueText: { color: Colors.background, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0, 0, 0, 0.75)' },
  modalCard: { overflow: 'hidden', backgroundColor: '#222224', borderRadius: 16, borderWidth: 1, borderColor: '#333336' },
  modalTitle: { padding: 20, color: Colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalOption: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  modalOptionText: { color: Colors.text, fontSize: 16 },
});