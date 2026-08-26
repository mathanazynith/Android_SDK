import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
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

type DurationMode = 'duration' | 'distance';
type PickerName = 'stepType' | 'durationType' | 'targetType' | 'distanceUnit' | null;

const pickerOptions = {
  stepType: ['Warm Up', 'Run', 'Recovery', 'Cool Down'],
  durationType: ['Time', 'Distance'],
  targetType: ['No Target', 'Pace', 'Heart Rate'],
  distanceUnit: ['Kilometers (km)', 'Miles (mi)'],
} as const;

const toNumber = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0;

export default function CustomWorkoutWarmUp() {
  const { setWarmUp } = useCustomWorkout();
  const [stepType, setStepType] = useState('Warm Up');
  const [durationMode, setDurationMode] = useState<DurationMode>('duration');
  const [targetType, setTargetType] = useState('No Target');
  const [distanceUnit, setDistanceUnit] = useState('Kilometers (km)');
  const [picker, setPicker] = useState<PickerName>(null);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [distance, setDistance] = useState('');
  const [pace, setPace] = useState('');
  const [notes, setNotes] = useState('');

  const calculatedPace = useMemo(() => {
    const totalSeconds = toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds);
    const distanceInKm = toNumber(distance) * (distanceUnit.startsWith('Miles') ? 1.60934 : 1);
    if (!totalSeconds || !distanceInKm) return '';
    const paceSeconds = Math.round(totalSeconds / distanceInKm);
    return `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, '0')} / km`;
  }, [distance, distanceUnit, hours, minutes, seconds]);

  const pickerValues: Record<Exclude<PickerName, null>, string> = {
    stepType,
    durationType: durationMode === 'duration' ? 'Time' : 'Distance',
    targetType,
    distanceUnit,
  };

  const selectPickerValue = (value: string) => {
    if (picker === 'stepType') setStepType(value);
    if (picker === 'durationType') setDurationMode(value === 'Time' ? 'duration' : 'distance');
    if (picker === 'targetType') setTargetType(value);
    if (picker === 'distanceUnit') setDistanceUnit(value);
    setPicker(null);
  };

  const pickerTitle = picker === 'stepType'
    ? 'Step Type'
    : picker === 'durationType'
      ? 'Duration Type'
      : picker === 'targetType'
        ? 'Target Type'
        : 'Distance Unit';

  const continueToRunning = () => {
    const hasDuration = toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds) > 0;
    const hasDistance = toNumber(distance) > 0;
    if ((durationMode === 'duration' && !hasDuration) || (durationMode === 'distance' && !hasDistance)) {
      Alert.alert('Duration required', durationMode === 'duration' ? 'Set the Warm Up time before continuing.' : 'Enter the Warm Up distance before continuing.');
      return;
    }
    setWarmUp({ title: 'Warm Up', duration: `${hours || '00'}:${minutes || '00'}:${seconds || '00'}`, distance, unit: distanceUnit, pace: pace || calculatedPace, repeat: 1, rest: '', skipLastRest: true });
    router.push('/custom-workout/running-declaration');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.headerButton}>
            <Feather name="arrow-left" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Warm Up</Text>
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
                  <TextInput value={distance} onChangeText={setDistance} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" style={[styles.input, styles.distanceInput]} />
                  <TouchableOpacity style={styles.unitButton} onPress={() => setPicker('distanceUnit')}>
                    <Text style={styles.unitText}>{distanceUnit.includes('Miles') ? 'mi' : 'km'}</Text>
                    <Feather name="chevron-down" size={19} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>INTENSITY TARGET</Text>
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <View style={styles.paceHeader}>
                <Text style={styles.inputLabel}>Pace</Text>
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
              {!!calculatedPace && !pace && <Text style={styles.calculated}>Automatically calculated from time and distance</Text>}
            </View>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={continueToRunning}
          >
            <Text style={styles.continueText}>ADD NEXT STEP</Text>
            <Feather name="chevron-right" size={21} color={Colors.background} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{pickerTitle}</Text>
            {picker && pickerOptions[picker].map((option) => (
              <TouchableOpacity key={option} style={styles.modalOption} onPress={() => selectPickerValue(option)}>
                <Text style={styles.modalOptionText}>{option}</Text>
                {pickerValues[picker] === option && <Feather name="check" size={22} color={Colors.primaryLight} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pickerRow} onPress={onPress}>
      <View>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Feather name="chevron-down" size={24} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: '#101010' },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: '#000000' },
  doneButton: { minWidth: 58, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  doneText: { color: Colors.primaryLight, fontSize: 14, fontWeight: '800' },
  headerButton: { width: 55, paddingVertical: 12 },
  headerTitle: { flex: 1, color: Colors.text, fontSize: 25, fontWeight: '700', textAlign: 'center' },
  removeButton: { width: 82, alignItems: 'flex-end', paddingVertical: 12 },
  removeText: { color: Colors.text, fontSize: 15, fontWeight: '500' },
  content: { paddingBottom: 32 },
  sectionLabel: { paddingHorizontal: 32, paddingTop: 27, paddingBottom: 12, color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  section: { backgroundColor: '#202020' },
  pickerRow: { minHeight: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  rowTitle: { color: Colors.text, fontSize: 22, fontWeight: '400' },
  rowValue: { marginTop: 5, color: Colors.textSecondary, fontSize: 18 },
  notesRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  notesInput: { minHeight: 48, marginHorizontal: 32, marginBottom: 18, padding: 12, color: Colors.text, backgroundColor: '#2A2A2A', borderRadius: 6, fontSize: 16 },
  inputGroup: { paddingHorizontal: 32, paddingBottom: 24 },
  inputLabel: { color: Colors.text, fontSize: 17, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 10 },
  numberField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  input: { minHeight: 50, flex: 1, paddingHorizontal: 14, color: Colors.text, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#4A4A4A', borderRadius: 6, fontSize: 18 },
  numberLabel: { color: Colors.textSecondary, fontSize: 15 },
  distanceRow: { flexDirection: 'row', gap: 10 },
  distanceInput: { flex: 1 },
  unitButton: { minWidth: 95, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#4A4A4A', borderRadius: 6 },
  unitText: { color: Colors.text, fontSize: 18 },
  paceHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  optional: { color: Colors.textMuted, fontSize: 14 },
  calculated: { marginTop: 7, color: Colors.primaryLight, fontSize: 13 },
  continueButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, margin: 24, backgroundColor: Colors.primary, borderRadius: 8 },
  continueText: { color: Colors.background, fontSize: 15, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  modalCard: { overflow: 'hidden', backgroundColor: '#252525', borderRadius: 8 },
  modalTitle: { padding: 20, color: Colors.textSecondary, fontSize: 14, fontWeight: '600', textTransform: 'uppercase' },
  modalOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#3A3A3A' },
  modalOptionText: { color: Colors.text, fontSize: 17 },
});