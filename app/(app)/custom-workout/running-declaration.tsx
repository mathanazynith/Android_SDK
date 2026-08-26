import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollTimePicker } from '../../../components/ScrollTimePicker';
import { Colors } from '../../../constants/theme';
import { useCustomWorkout } from './workout-context';

type TimeParts = { hours: string; minutes: string; seconds: string };
const units = ['Kilometers (km)', 'Meters (m)', 'Miles (mi)'];
const toNumber = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0;
const unitName = (unit: string) => unit.includes('Meters') ? 'm' : unit.includes('Miles') ? 'mi' : 'km';
const secondsOf = ({ hours, minutes, seconds }: TimeParts) => toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds);
const timeText = (time: TimeParts) => `${time.hours || '00'}:${time.minutes || '00'}:${time.seconds || '00'}`;
const timeParts = (total: number): TimeParts => ({ hours: String(Math.floor(total / 3600)).padStart(2, '0'), minutes: String(Math.floor((total % 3600) / 60)).padStart(2, '0'), seconds: String(Math.round(total % 60)).padStart(2, '0') });
const paceText = (total: number, unit: string) => `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')} / ${unitName(unit)}`;

export default function RunningDeclaration() {
  const { workout, addRun } = useCustomWorkout();
  const [title, setTitle] = useState('Running');
  const [unit, setUnit] = useState(units[0]);
  const [unitModal, setUnitModal] = useState(false);
  const [repeatModal, setRepeatModal] = useState(false);
  const [duration, setDuration] = useState<TimeParts>({ hours: '', minutes: '', seconds: '' });
  const [distance, setDistance] = useState('');
  const [pace, setPace] = useState('');
  const [repeat, setRepeat] = useState('1');
  const [rest, setRest] = useState<TimeParts>({ hours: '', minutes: '', seconds: '' });
  const [skipLastRest, setSkipLastRest] = useState(true);

  const calculated = useMemo(() => {
    const durationSeconds = secondsOf(duration);
    const distanceInUnits = toNumber(distance);
    const match = pace.match(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/);
    const paceSeconds = match ? toNumber(match[1]) * 60 + toNumber(match[2]) : 0;
    if ([durationSeconds > 0, distanceInUnits > 0, paceSeconds > 0].filter(Boolean).length < 2) return { duration: null as TimeParts | null, distance: '', pace: '' };
    if (!durationSeconds) return { duration: timeParts(distanceInUnits * paceSeconds), distance: '', pace: '' };
    if (!distanceInUnits) return { duration: null, distance: (durationSeconds / paceSeconds).toFixed(2), pace: '' };
    if (!paceSeconds) return { duration: null, distance: '', pace: paceText(durationSeconds / distanceInUnits, unit) };
    return { duration: null, distance: '', pace: '' };
  }, [distance, duration, pace, unit]);

  const saveStep = () => {
    const filled = [secondsOf(duration) > 0, toNumber(distance) > 0, /\d+\s*:\s*\d+/.test(pace)].filter(Boolean).length;
    if (!title.trim()) return Alert.alert('Workout title required', 'Enter a name for this running step.');
    if (filled < 2) return Alert.alert('Add two values', 'Fill any two of duration, distance, or pace.');
    addRun({
      title: title.trim(),
      duration: durationValue,
      distance: distance || calculated.distance,
      unit,
      pace: pace || calculated.pace,
      repeat: Number(repeat),
      rest: restValue,
      skipLastRest,
    });
    router.push(workout.runs.length === 0 ? '/custom-workout/cooldown' : '/custom-workout/overview');
  };

  const updateTime = (value: string, setValue: (next: TimeParts) => void) => {
    const [hours, minutes, seconds] = value.split(':');
    setValue({ hours, minutes, seconds });
  };
  const durationValue = duration.hours || duration.minutes || duration.seconds ? timeText(duration) : calculated.duration ? timeText(calculated.duration) : '';
  const restValue = timeText(rest);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Go back"><Feather name="arrow-left" size={28} color={Colors.text} /></TouchableOpacity><Text style={styles.headerTitle}>Running</Text><TouchableOpacity onPress={saveStep}><Text style={styles.doneHeader}>DONE</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>RUNNING DECLARATION</Text>
          <View style={styles.section}><Text style={styles.label}>Workout title</Text><TextInput value={title} onChangeText={setTitle} placeholder="Workout title" placeholderTextColor={Colors.textMuted} style={styles.input} /></View>
          <Text style={styles.sectionLabel}>SET TWO VALUES</Text>
          <View style={styles.section}>
            <Text style={styles.label}>Duration</Text>
            <ScrollTimePicker value={durationValue} allowEmpty={!durationValue} onChange={(value) => updateTime(value, setDuration)} />
            <Text style={styles.label}>Distance</Text>
            <View style={styles.row}><TextInput value={distance || calculated.distance} onChangeText={setDistance} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" style={[styles.input, styles.flex]} /><TouchableOpacity style={styles.unitButton} onPress={() => setUnitModal(true)}><Text style={styles.unitText}>{unitName(unit)}</Text><Feather name="chevron-down" size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
            <Text style={styles.label}>Pace</Text>
            <TextInput value={pace || calculated.pace} onChangeText={setPace} placeholder={`e.g. 5:30 / ${unitName(unit)}`} placeholderTextColor={Colors.textMuted} keyboardType="numbers-and-punctuation" style={styles.input} />
            <Text style={styles.helper}>Fill any two fields. The remaining field is calculated inside its field.</Text>
          </View>
          <Text style={styles.sectionLabel}>REPEAT</Text>
          <View style={styles.section}>
            <View style={styles.repeatRow}><Text style={styles.rowTitle}>Repeat</Text><TouchableOpacity style={styles.repeatButton} onPress={() => setRepeatModal(true)}><Text style={styles.repeatValue}>{repeat}</Text><Feather name="chevron-down" size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
            <Text style={styles.label}>Rest duration <Text style={styles.optional}>(optional)</Text></Text>
            <ScrollTimePicker value={restValue} allowEmpty onChange={(value) => updateTime(value, setRest)} />
            <View style={styles.switchRow}><View style={styles.flex}><Text style={styles.rowTitle}>Skip last rest</Text><Text style={styles.helper}>Go directly to Cool Down after the final repeat.</Text></View><Switch value={skipLastRest} onValueChange={setSkipLastRest} trackColor={{ false: '#555555', true: Colors.primaryDark }} thumbColor={skipLastRest ? Colors.primaryLight : '#BBBBBB'} /></View>
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={saveStep}><Text style={styles.saveText}>SAVE RUNNING STEP</Text><Feather name="check" size={20} color={Colors.background} /></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={unitModal} transparent animationType="fade" onRequestClose={() => setUnitModal(false)}><Pressable style={styles.overlay} onPress={() => setUnitModal(false)}><Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>DISTANCE UNIT</Text>{units.map((option) => <TouchableOpacity key={option} style={styles.option} onPress={() => { setUnit(option); setUnitModal(false); }}><Text style={styles.optionText}>{option}</Text>{unit === option && <Feather name="check" size={21} color={Colors.primaryLight} />}</TouchableOpacity>)}</Pressable></Pressable></Modal>
      <Modal visible={repeatModal} transparent animationType="fade" onRequestClose={() => setRepeatModal(false)}><Pressable style={styles.overlay} onPress={() => setRepeatModal(false)}><Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>REPEAT COUNT</Text><ScrollView style={styles.repeatScroll}>{Array.from({ length: 40 }, (_, index) => String(index + 1)).map((option) => <TouchableOpacity key={option} style={styles.option} onPress={() => { setRepeat(option); setRepeatModal(false); }}><Text style={styles.optionText}>{option}</Text>{repeat === option && <Feather name="check" size={21} color={Colors.primaryLight} />}</TouchableOpacity>)}</ScrollView></Pressable></Pressable></Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background }, container: { flex: 1, backgroundColor: '#101010' }, header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: '#000' }, headerIcon: { width: 55 }, headerTitle: { color: Colors.text, fontSize: 25, fontWeight: '700' }, doneHeader: { color: Colors.primaryLight, fontSize: 14, fontWeight: '700' }, content: { paddingBottom: 32 }, sectionLabel: { paddingHorizontal: 32, paddingTop: 27, paddingBottom: 12, color: Colors.textSecondary, fontSize: 14, fontWeight: '500' }, section: { padding: 24, backgroundColor: '#202020' }, label: { marginBottom: 9, color: Colors.text, fontSize: 17 }, input: { minHeight: 50, paddingHorizontal: 14, color: Colors.text, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#4A4A4A', borderRadius: 6, fontSize: 17, marginBottom: 20 }, row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, unitButton: { minWidth: 86, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#4A4A4A', borderRadius: 6 }, unitText: { color: Colors.text, fontSize: 17 }, helper: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 }, optional: { color: Colors.textMuted, fontSize: 14 }, repeatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }, rowTitle: { color: Colors.text, fontSize: 19 }, repeatButton: { width: 100, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: Colors.primary, borderRadius: 6 }, repeatValue: { color: Colors.text, fontSize: 18 }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 }, saveButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 24, backgroundColor: Colors.primary, borderRadius: 8 }, saveText: { color: Colors.background, fontSize: 14, fontWeight: '800' }, overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' }, modal: { overflow: 'hidden', backgroundColor: '#252525', borderRadius: 8 }, modalTitle: { padding: 20, color: Colors.textSecondary, fontSize: 14, fontWeight: '600' }, repeatScroll: { maxHeight: 420 }, option: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#3A3A3A' }, optionText: { color: Colors.text, fontSize: 17 },
});
