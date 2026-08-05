import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../../service/auth';
import { AppInput } from '../../../components/common/AppInput';
import { Colors } from '../../../constants/theme';
import { getDistanceUnitCode, getDistanceUnitPreference, getHeightUnitLabel, getWeightUnitLabel, getUnitSystemLabel } from '../../../utils/distanceUnit';

interface PickerItem { label: string; value: string; }

const dateValue = (value: string) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const ageValue = (value: string) => {
  if (!value) return '--';
  const birthday = new Date(value); const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  if (today.getMonth() < birthday.getMonth() || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate())) age--;
  return String(age);
};

export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.profile?.date_of_birth || '');
  const [gender, setGender] = useState(user?.profile?.gender || '');
  const [bloodGroup, setBloodGroup] = useState(user?.profile?.blood_group || '');
  const [heightCm, setHeightCm] = useState(user?.profile?.height_cm?.toString() || '');
  const [weightKg, setWeightKg] = useState(user?.profile?.weight_kg?.toString() || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || user?.profile?.phone_number || '');
  const [unitSystem, setUnitSystem] = useState<'standard' | 'imperial'>(getDistanceUnitPreference(user?.profile?.distance_unit));
  const [loading, setLoading] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showBloodModal, setShowBloodModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const GENDERS: PickerItem[] = [{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }, { label: 'Other', value: 'Other' }];
  const BLOOD_GROUPS: PickerItem[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((value) => ({ label: value, value }));
  const UNIT_SYSTEMS: PickerItem[] = [{ label: 'Standard (Km / cm / kg)', value: 'standard' }, { label: 'Imperial (mile / in / lb)', value: 'imperial' }];

  const handleUpdate = async () => {
    if (!firstName || !lastName || !username) { Alert.alert('Validation Error', 'All fields are required'); return; }
    try {
      setLoading(true);
      await updateProfile({ first_name: firstName, last_name: lastName, username, date_of_birth: dateOfBirth || null, gender: gender || null, blood_group: bloodGroup || null, height_cm: heightCm ? Number(heightCm) : null, weight_kg: weightKg ? Number(weightKg) : null, phone_number: phoneNumber || null, distance_unit: getDistanceUnitCode(unitSystem) });
      Alert.alert('Success', 'Profile updated successfully'); router.back();
    } catch (error: any) {
      console.log(error); Alert.alert('Update Failed', error?.response?.data?.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1), mode: 'date', onChange: (_, date) => {
        if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
      }});
    } else setShowDatePicker(true);
  };

  const Picker = ({ visible, onClose, data, selectedValue, onSelect, title }: { visible: boolean; onClose: () => void; data: PickerItem[]; selectedValue: string; onSelect: (value: string) => void; title: string }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}><View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <FlatList data={data} keyExtractor={(item) => item.value} renderItem={({ item }) => <TouchableOpacity style={[styles.modalItem, selectedValue === item.value && styles.modalItemSelected]} onPress={() => { onSelect(item.value); onClose(); }}><Text style={[styles.modalItemText, selectedValue === item.value && styles.modalItemTextSelected]}>{item.label}</Text>{selectedValue === item.value && <Feather name="check" color={Colors.primary} size={20} />}</TouchableOpacity>} />
        <TouchableOpacity onPress={onClose} style={styles.modalClose}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
      <ScrollView scrollEnabled={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>PROFILE PHOTO</Text>
        <View style={styles.photoCard}><View style={styles.photoPlaceholder}><Text style={styles.photoInitial}>{user?.first_name?.[0] || ''}</Text></View><Text style={styles.selectText}>Select</Text></View>

        <Text style={styles.sectionLabel}>PERSONAL</Text>
        <View style={styles.formCard}>
          <AppInput placeholder="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" containerStyle={styles.phoneInput} inputStyle={styles.flatInput} />
          <Pressable onPress={openDatePicker} style={styles.formRow}><Text style={styles.rowLabel}>Date of Birth</Text><View style={styles.datePill}><Text style={styles.dateText}>{dateValue(dateOfBirth) || 'Select'}</Text></View></Pressable>
          <View style={styles.formRow}><Text style={styles.rowLabel}>Age</Text><Text style={styles.rowValueMuted}>{ageValue(dateOfBirth)}</Text></View>
          <Pressable onPress={() => setShowGenderModal(true)} style={styles.formRow}><Text style={styles.rowLabel}>Gender</Text><View style={styles.selectValue}><Text style={styles.rowValueMuted}>{gender || 'Select'}</Text><Feather name="chevrons-down" size={18} color="#868686" /></View></Pressable>
          <Pressable onPress={() => setShowBloodModal(true)} style={[styles.formRow, styles.lastRow]}><Text style={styles.rowLabel}>Blood Group</Text><View style={styles.selectValue}><Text style={styles.rowValueMuted}>{bloodGroup || 'Select'}</Text><Feather name="chevrons-down" size={18} color="#868686" /></View></Pressable>
        </View>

        <Text style={styles.sectionLabel}>MEASUREMENTS</Text>
        <View style={styles.formCard}>
          <Pressable onPress={() => setShowUnitModal(true)} style={styles.formRow}><Text style={styles.rowLabel}>Unit System</Text><View style={styles.selectValue}><Text style={styles.unitValue}>{getUnitSystemLabel(unitSystem)}</Text><Feather name="chevrons-down" size={18} color="#868686" /></View></Pressable>
          <AppInput placeholder={`Height (${getHeightUnitLabel(unitSystem)})`} value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" containerStyle={styles.measurementInput} inputStyle={styles.flatInput} />
          <AppInput placeholder={`Weight (${getWeightUnitLabel(unitSystem)})`} value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" containerStyle={styles.measurementInput} inputStyle={styles.flatInput} />
        </View>

        <View style={styles.accountFields}>
          <AppInput placeholder="First Name" value={firstName} onChangeText={setFirstName} containerStyle={styles.accountInput} />
          <AppInput placeholder="Last Name" value={lastName} onChangeText={setLastName} containerStyle={styles.accountInput} />
          <AppInput placeholder="Username" value={`@${username}`} editable={false} containerStyle={styles.accountInput} />
          <TouchableOpacity disabled={loading} onPress={handleUpdate} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </SafeAreaView>
      {showDatePicker && Platform.OS !== 'android' && <DateTimePicker value={dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1)} mode="date" display="spinner" onChange={(_, date) => { setShowDatePicker(Platform.OS === 'ios'); if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); }} />}
      <Picker visible={showGenderModal} onClose={() => setShowGenderModal(false)} data={GENDERS} selectedValue={gender} onSelect={setGender} title="Select Gender" />
      <Picker visible={showBloodModal} onClose={() => setShowBloodModal(false)} data={BLOOD_GROUPS} selectedValue={bloodGroup} onSelect={setBloodGroup} title="Select Blood Group" />
      <Picker visible={showUnitModal} onClose={() => setShowUnitModal(false)} data={UNIT_SYSTEMS} selectedValue={unitSystem} onSelect={(value) => setUnitSystem(value === 'imperial' ? 'imperial' : 'standard')} title="Select Unit System" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 14 : 14 },
  content: { paddingHorizontal: 20, paddingBottom: 8 },
  sectionLabel: { color: '#8D8D92', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  photoCard: { height: 52, borderRadius: 14, backgroundColor: '#111111', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#383838', alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: '#E8E8E8', fontSize: 19, fontWeight: '600' },
  selectText: { color: '#099BFF', fontSize: 15, fontWeight: '600' },
  formCard: { borderRadius: 14, backgroundColor: '#111111', paddingHorizontal: 14 },
  phoneInput: { marginBottom: 0 },
  flatInput: { borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: '#282828', minHeight: 44, paddingHorizontal: 0, backgroundColor: 'transparent' },
  formRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#282828' },
  lastRow: { borderBottomWidth: 0 },
  rowLabel: { color: '#EEEEEE', fontSize: 15, fontWeight: '500' },
  rowValueMuted: { color: '#8E8E93', fontSize: 15 },
  selectValue: { maxWidth: '57%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  unitValue: { color: '#8E8E93', fontSize: 15, textAlign: 'right', flexShrink: 1 },
  datePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 17, backgroundColor: '#2B2B2D' },
  dateText: { color: '#F1F1F1', fontSize: 15 },
  measurementInput: { marginBottom: 0 },
  accountFields: { marginTop: 10, gap: 3 },
  accountInput: { opacity: 0.72 },
  saveButton: { minHeight: 42, marginTop: 5, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  modalContent: { backgroundColor: '#242424', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '70%' },
  modalTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  modalItem: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#373737' },
  modalItemSelected: { paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#1A4420' },
  modalItemText: { color: '#EFEFEF', fontSize: 17 },
  modalItemTextSelected: { color: Colors.primary, fontWeight: '700' },
  modalClose: { paddingTop: 20, alignItems: 'center' },
  modalCloseText: { color: '#FF5A5A', fontSize: 17, fontWeight: '700' },
});
