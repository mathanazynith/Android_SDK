import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, useMemo } from 'react';
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
import { ScrollTimePicker } from '../../../components/ScrollTimePicker';
import { Colors } from '../../../constants/theme';
import { useCustomWorkout } from './workout-context';

type Mode = 'time' | 'distance';
const units = ['Kilometers (km)', 'Miles (mi)'];
const numeric = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0;

export default function Cooldown() {
  const { workout, setCooldown } = useCustomWorkout();
  const existing = workout.cooldown;
  const existingTime = existing?.duration?.split(':') || [];
  const [mode, setMode] = useState<Mode>(
    existing?.inputType === 'DISTANCE' || (!existing?.duration && !!existing?.distance)
      ? 'distance'
      : 'time'
  );
  const [unit, setUnit] = useState(existing?.unit || units[0]);
  const [picker, setPicker] = useState<'mode' | 'unit' | null>(null);
  const [hours, setHours] = useState(existingTime[0] === '00' ? '' : existingTime[0] || '');
  const [minutes, setMinutes] = useState(existingTime[1] === '00' ? '' : existingTime[1] || '');
  const [seconds, setSeconds] = useState(existingTime[2] === '00' ? '' : existingTime[2] || '');
  const [distance, setDistance] = useState(existing?.distance || '');
  const [pace, setPace] = useState(existing?.pace || '');
  const [notes, setNotes] = useState(existing?.notes || '');

  const calculatedPace = useMemo(() => {
    const totalSeconds = numeric(hours) * 3600 + numeric(minutes) * 60 + numeric(seconds);
    const distanceInKm = numeric(distance) * (unit.includes('Miles') ? 1.60934 : 1);
    if (!totalSeconds || !distanceInKm) return '';
    const paceSeconds = Math.round(totalSeconds / distanceInKm);
    return `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, '0')} / km`;
  }, [distance, unit, hours, minutes, seconds]);

  const select = (value: string) => {
    if (picker === 'mode') setMode(value === 'Time' ? 'time' : 'distance');
    if (picker === 'unit') setUnit(value);
    setPicker(null);
  };

  const timeValue = hours || minutes || seconds ? `${hours || '00'}:${minutes || '00'}:${seconds || '00'}` : '';

  const updateTime = (value: string) => {
    const [nextHours, nextMinutes, nextSeconds] = value.split(':');
    setHours(nextHours === '00' ? '' : nextHours);
    setMinutes(nextMinutes === '00' ? '' : nextMinutes);
    setSeconds(nextSeconds === '00' ? '' : nextSeconds);
  };

  const save = () => {
    const hasDuration = numeric(hours) * 3600 + numeric(minutes) * 60 + numeric(seconds) > 0;
    const hasDistance = numeric(distance) > 0;
    if (mode === 'time' && !hasDuration) {
      Alert.alert('Duration required', 'Set the Cool Down time before finishing.');
      return;
    }
    if (mode === 'distance' && !hasDistance) {
      Alert.alert('Distance required', 'Enter the Cool Down distance before finishing.');
      return;
    }

    setCooldown({
      title: 'Cool Down',
      stepType: 'Cooldown',
      inputType: mode === 'time' ? 'DURATION' : 'DISTANCE',
      duration: timeValue || '00:00:00',
      distance: mode === 'distance' ? distance : '',
      unit,
      pace: pace || calculatedPace,
      repeat: 1,
      rest: '',
      skipLastRest: true,
      notes: notes.trim(),
    });
    router.push('/custom-workout/overview');
  };

  const options = picker === 'mode' ? ['Time', 'Distance'] : units;
  const current = picker === 'mode' ? (mode === 'time' ? 'Time' : 'Distance') : unit;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Feather name="arrow-left" size={26} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerBadge}>STEP 3</Text>
            <Text style={styles.headerTitle}>Cool Down</Text>
          </View>
          <TouchableOpacity onPress={save} style={styles.doneButton}>
            <Text style={styles.done}>DONE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>DURATION</Text>
          <View style={styles.section}>
            <PickerRow
              label="Duration Type"
              value={mode === 'time' ? 'Time' : 'Distance'}
              onPress={() => setPicker('mode')}
            />
            {mode === 'time' ? (
              <View style={styles.inputGroup}>
                <ScrollTimePicker
                  value={timeValue}
                  allowEmpty={!timeValue}
                  onChange={updateTime}
                />
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Distance</Text>
                <View style={styles.row}>
                  <TextInput
                    value={distance}
                    onChangeText={setDistance}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.flex]}
                  />
                  <TouchableOpacity style={styles.unitButton} onPress={() => setPicker('unit')}>
                    <Text style={styles.unitText}>{unit.includes('Miles') ? 'mi' : 'km'}</Text>
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
                <Text style={styles.label}>Target Pace</Text>
                <Text style={styles.optional}>Optional</Text>
              </View>
              <TextInput
                value={pace}
                onChangeText={setPace}
                placeholder={calculatedPace || 'Enter pace (e.g. 6:30 / km)'}
                placeholderTextColor={calculatedPace ? Colors.primaryLight : Colors.textMuted}
                keyboardType="numbers-and-punctuation"
                style={styles.input}
              />
              {!!calculatedPace && !pace && (
                <Text style={styles.calculated}>Estimated from duration & distance</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Cooldown or stretching notes (optional)"
                placeholderTextColor={Colors.textMuted}
                style={[styles.input, styles.notesInput]}
                multiline
              />
            </View>
          </View>

          <TouchableOpacity style={styles.finish} onPress={save} activeOpacity={0.85}>
            <Text style={styles.finishText}>SAVE COOL DOWN</Text>
            <Feather name="check" size={20} color={Colors.background} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.overlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>SELECT OPTION</Text>
            {options.map((option) => (
              <TouchableOpacity key={option} style={styles.option} onPress={() => select(option)}>
                <Text style={styles.optionText}>{option}</Text>
                {current === option && <Feather name="check" size={21} color={Colors.primaryLight} />}
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
        <Text style={styles.value}>{value}</Text>
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
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  back: { width: 55 },
  headerCenter: { alignItems: 'center' },
  headerBadge: { color: Colors.success, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  doneButton: { minWidth: 55, alignItems: 'flex-end' },
  done: { color: Colors.primaryLight, fontSize: 14, fontWeight: '800' },
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
  value: { marginTop: 4, color: Colors.primaryLight, fontSize: 15 },
  inputGroup: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  label: { marginBottom: 8, color: Colors.text, fontSize: 16, fontWeight: '500' },
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
  notesInput: { minHeight: 65, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
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
  finish: {
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
  finishText: { color: Colors.background, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.75)' },
  modal: { overflow: 'hidden', backgroundColor: '#222224', borderRadius: 16, borderWidth: 1, borderColor: '#333336' },
  modalTitle: { padding: 20, color: Colors.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  optionText: { color: Colors.text, fontSize: 16 },
});
