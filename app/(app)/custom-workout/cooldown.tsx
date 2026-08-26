import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollTimePicker } from '../../../components/ScrollTimePicker';
import { Colors } from '../../../constants/theme';
import { useCustomWorkout } from './workout-context';

type Mode = 'time' | 'distance';
const units = ['Kilometers (km)', 'Miles (mi)'];
const numeric = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0;

export default function Cooldown() {
  const { setCooldown } = useCustomWorkout();
  const [mode, setMode] = useState<Mode>('time');
  const [unit, setUnit] = useState(units[0]);
  const [picker, setPicker] = useState<'mode' | 'unit' | 'target' | null>(null);
  const [target, setTarget] = useState('No Target');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [distance, setDistance] = useState('');
  const [pace, setPace] = useState('');
  const [notes, setNotes] = useState('');

  const select = (value: string) => {
    if (picker === 'mode') setMode(value === 'Time' ? 'time' : 'distance');
    if (picker === 'unit') setUnit(value);
    if (picker === 'target') setTarget(value);
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
    const valid = mode === 'time' ? numeric(hours) * 3600 + numeric(minutes) * 60 + numeric(seconds) > 0 : numeric(distance) > 0;
    if (!valid) {
      Alert.alert('Duration required', mode === 'time' ? 'Set the Cool Down time before finishing.' : 'Enter the Cool Down distance before finishing.');
      return;
    }
    setCooldown({
      title: 'Cool Down',
      duration: timeValue,
      distance,
      unit,
      pace,
      repeat: 1,
      rest: '',
      skipLastRest: true,
    });
    router.push('/custom-workout/overview');
  };
  const options = picker === 'mode' ? ['Time', 'Distance'] : picker === 'unit' ? units : ['No Target', 'Heart Rate'];
  const current = picker === 'mode' ? mode === 'time' ? 'Time' : 'Distance' : picker === 'unit' ? unit : target;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.back}><Feather name="arrow-left" size={28} color={Colors.text} /></TouchableOpacity><Text style={styles.headerTitle}>Cool Down</Text><TouchableOpacity onPress={save}><Text style={styles.done}>DONE</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>DURATION</Text>
          <View style={styles.section}>
            <PickerRow label="Duration Type" value={mode === 'time' ? 'Time' : 'Distance'} onPress={() => setPicker('mode')} />
            {mode === 'time' ? <ScrollTimePicker value={timeValue} allowEmpty={!timeValue} onChange={updateTime} /> : <View style={styles.field}><Text style={styles.label}>Distance</Text><View style={styles.row}><TextInput value={distance} onChangeText={setDistance} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" style={[styles.input, styles.flex]} /><TouchableOpacity style={styles.unitButton} onPress={() => setPicker('unit')}><Text style={styles.unitText}>{unit.includes('Miles') ? 'mi' : 'km'}</Text><Feather name="chevron-down" size={18} color={Colors.textSecondary} /></TouchableOpacity></View></View>}
          </View>
          <Text style={styles.sectionLabel}>INTENSITY TARGET</Text>
          <View style={styles.section}>
            <View style={styles.field}><View style={styles.paceHeader}><Text style={styles.label}>Pace</Text><Text style={styles.optional}>Optional</Text></View><TextInput value={pace} onChangeText={setPace} placeholder="Enter pace (optional)" placeholderTextColor={Colors.textMuted} keyboardType="numbers-and-punctuation" style={styles.input} /></View>
          </View>
          <TouchableOpacity style={styles.finish} onPress={save}><Text style={styles.finishText}>FINISH WORKOUT</Text><Feather name="check" size={20} color={Colors.background} /></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}><Pressable style={styles.overlay} onPress={() => setPicker(null)}><Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>SELECT OPTION</Text>{options.map((option) => <TouchableOpacity key={option} style={styles.option} onPress={() => select(option)}><Text style={styles.optionText}>{option}</Text>{current === option && <Feather name="check" size={21} color={Colors.primaryLight} />}</TouchableOpacity>)}</Pressable></Pressable></Modal>
    </SafeAreaView>
  );
}

function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <TouchableOpacity style={styles.pickerRow} onPress={onPress}><View><Text style={styles.rowTitle}>{label}</Text><Text style={styles.value}>{value}</Text></View><Feather name="chevron-down" size={24} color={Colors.textSecondary} /></TouchableOpacity>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background }, container: { flex: 1, backgroundColor: '#101010' }, header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: '#000' }, back: { width: 55 }, headerTitle: { color: Colors.text, fontSize: 25, fontWeight: '700' }, done: { color: Colors.primaryLight, fontSize: 14, fontWeight: '700' }, content: { paddingBottom: 32 }, sectionLabel: { paddingHorizontal: 32, paddingTop: 27, paddingBottom: 12, color: Colors.textSecondary, fontSize: 14, fontWeight: '500' }, section: { backgroundColor: '#202020' }, fixedRow: { minHeight: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 }, pickerRow: { minHeight: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 }, rowTitle: { color: Colors.text, fontSize: 21 }, value: { marginTop: 5, color: Colors.textSecondary, fontSize: 18 }, notesRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 }, input: { minHeight: 50, flex: 1, marginHorizontal: 24, marginBottom: 20, paddingHorizontal: 14, color: Colors.text, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#4A4A4A', borderRadius: 6, fontSize: 17 }, field: { padding: 24 }, label: { marginBottom: 9, color: Colors.text, fontSize: 17 }, row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, unitButton: { minWidth: 86, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#4A4A4A', borderRadius: 6 }, unitText: { color: Colors.text, fontSize: 17 }, paceHeader: { flexDirection: 'row', justifyContent: 'space-between' }, optional: { color: Colors.textMuted, fontSize: 14 }, finish: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 24, backgroundColor: Colors.primary, borderRadius: 8 }, finishText: { color: Colors.background, fontSize: 14, fontWeight: '800' }, overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' }, modal: { overflow: 'hidden', backgroundColor: '#252525', borderRadius: 8 }, modalTitle: { padding: 20, color: Colors.textSecondary, fontSize: 14, fontWeight: '600' }, option: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#3A3A3A' }, optionText: { color: Colors.text, fontSize: 17 },
});
