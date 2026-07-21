import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../service/auth";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { AppInput } from "../../../components/common/AppInput";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { Colors, Spacing, Typography, BorderRadius } from "../../../constants/theme";
import "../../../service/auth"; // Ensure auth service is imported for context

interface PickerItem {
  label: string;
  value: string;
}

export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [dateOfBirth, setDateOfBirth] = useState(user?.profile?.date_of_birth || "");
  const [gender, setGender] = useState(user?.profile?.gender || "");
  const [bloodGroup, setBloodGroup] = useState(user?.profile?.blood_group || "");
  const [heightCm, setHeightCm] = useState(user?.profile?.height_cm?.toString() || "");
  const [weightKg, setWeightKg] = useState(user?.profile?.weight_kg?.toString() || "");
  const [phoneNumber, setPhoneNumber] = useState(
    user?.phone_number || user?.profile?.phone_number || ""
  );
  const [unitSystem, setUnitSystem] = useState(user?.profile?.unit_system || "metric");

  const [loading, setLoading] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showBloodModal, setShowBloodModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ✅ Correct gender values (capitalized)
  const GENDERS: PickerItem[] = [
    { label: "Male", value: "Male" },
    { label: "Female", value: "Female" },
    { label: "Other", value: "Other" },
  ];

  const BLOOD_GROUPS: PickerItem[] = [
    { label: "A+", value: "A+" },
    { label: "A-", value: "A-" },
    { label: "B+", value: "B+" },
    { label: "B-", value: "B-" },
    { label: "O+", value: "O+" },
    { label: "O-", value: "O-" },
    { label: "AB+", value: "AB+" },
    { label: "AB-", value: "AB-" },
  ];

  const UNIT_SYSTEMS: PickerItem[] = [
    { label: "Metric (kg, cm)", value: "metric" },
    { label: "Imperial (lbs, ft)", value: "imperial" },
  ];

  const handleUpdate = async () => {
    if (!firstName || !lastName || !username) {
      Alert.alert("Validation Error", "All fields are required");
      return;
    }

    try {
      setLoading(true);
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        username,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        blood_group: bloodGroup || null,
        height_cm: heightCm ? Number(heightCm) : null,
        weight_kg: weightKg ? Number(weightKg) : null,
        phone_number: phoneNumber || null,
        unit_system: unitSystem || null,
      });
      Alert.alert("Success", "Profile updated successfully");
      router.back();
    } catch (error: any) {
      console.log(error);
      Alert.alert("Update Failed", error?.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const ModalPicker = ({
    visible,
    onClose,
    data,
    selectedValue,
    onSelect,
    title,
  }: {
    visible: boolean;
    onClose: () => void;
    data: PickerItem[];
    selectedValue: string;
    onSelect: (value: string) => void;
    title: string;
  }) => (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={data}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => {
              const isSelected = selectedValue === item.value;
              return (
                <TouchableOpacity
                  style={[styles.modalItem, isSelected ? styles.modalItemSelected : undefined]}
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                >
                  <Text
                    style={[styles.modalItemText, isSelected ? styles.modalItemTextSelected : undefined]}
                  >
                    {item.label}
                  </Text>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Edit Profile</Text>

      <Text style={styles.sectionTitle}>Personal Information</Text>

      <AppInput
        placeholder="First Name *"
        value={firstName}
        onChangeText={setFirstName}
        containerStyle={styles.inputContainer}
      />
      <AppInput
        placeholder="Last Name *"
        value={lastName}
        onChangeText={setLastName}
        containerStyle={styles.inputContainer}
      />
      <AppInput
        placeholder="Username *"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        containerStyle={styles.inputContainer}
      />
      <AppInput
        placeholder="Phone Number"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
        containerStyle={styles.inputContainer}
      />

      {/* Date of Birth */}
      <Pressable
        onPress={() => {
          if (Platform.OS === "android") {
            const current = dateOfBirth ? new Date(dateOfBirth) : new Date();
            DateTimePickerAndroid.open({
              value: current,
              onChange: (event, selectedDate) => {
                if (!selectedDate) return;
                const yyyy = selectedDate.getFullYear();
                const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
                const dd = String(selectedDate.getDate()).padStart(2, "0");
                setDateOfBirth(`${yyyy}-${mm}-${dd}`);
              },
              mode: "date",
            });
            return;
          }
          setShowDatePicker(true);
        }}
      >
        <View pointerEvents="none">
          <AppInput
            placeholder="Date of Birth"
            value={dateOfBirth ? new Date(dateOfBirth).toLocaleDateString() : ""}
            editable={false}
            containerStyle={styles.pressableInputContainer}
          />
        </View>
      </Pressable>

      {showDatePicker && Platform.OS !== "android" && (
        <DateTimePicker
          value={dateOfBirth ? new Date(dateOfBirth) : new Date()}
          mode="date"
          display="spinner"
          onChange={(event, selectedDate) => {
            setShowDatePicker(Platform.OS === "ios");
            if (selectedDate) {
              const yyyy = selectedDate.getFullYear();
              const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
              const dd = String(selectedDate.getDate()).padStart(2, "0");
              setDateOfBirth(`${yyyy}-${mm}-${dd}`);
            }
          }}
        />
      )}

      {/* Gender */}
      <Pressable onPress={() => setShowGenderModal(true)}>
        <View pointerEvents="none">
          <AppInput
            placeholder="Gender"
            value={GENDERS.find((g) => g.value === gender)?.label || ""}
            editable={false}
            containerStyle={styles.pressableInputContainer}
          />
        </View>
      </Pressable>

      {/* Blood Group */}
      <Pressable onPress={() => setShowBloodModal(true)}>
        <View pointerEvents="none">
          <AppInput
            placeholder="Blood Group"
            value={BLOOD_GROUPS.find((b) => b.value === bloodGroup)?.label || ""}
            editable={false}
            containerStyle={styles.pressableInputContainer}
          />
        </View>
      </Pressable>

      <Text style={styles.sectionTitle}>Body Measurements</Text>

      <AppInput
        placeholder={`Height (${unitSystem === "metric" ? "cm" : "ft/in"})`}
        value={heightCm}
        onChangeText={setHeightCm}
        keyboardType="numeric"
        containerStyle={styles.inputContainer}
      />
      <AppInput
        placeholder={`Weight (${unitSystem === "metric" ? "kg" : "lbs"})`}
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="numeric"
        containerStyle={styles.inputContainer}
      />

      <Text style={styles.subLabel}>Unit System</Text>
      <Pressable onPress={() => setShowUnitModal(true)}>
        <View pointerEvents="none">
          <AppInput
            placeholder="Unit System"
            value={UNIT_SYSTEMS.find((u) => u.value === unitSystem)?.label || "Metric"}
            editable={false}
            containerStyle={styles.pressableInputContainer}
          />
        </View>
      </Pressable>

      <Text style={styles.sectionTitle}>Account Information</Text>
      <AppInput value={user?.email || ""} editable={false} containerStyle={styles.disabledInputContainer} />

      <ModalPicker
        visible={showGenderModal}
        onClose={() => setShowGenderModal(false)}
        data={GENDERS}
        selectedValue={gender}
        onSelect={setGender}
        title="Select Gender"
      />
      <ModalPicker
        visible={showBloodModal}
        onClose={() => setShowBloodModal(false)}
        data={BLOOD_GROUPS}
        selectedValue={bloodGroup}
        onSelect={setBloodGroup}
        title="Select Blood Group"
      />
      <ModalPicker
        visible={showUnitModal}
        onClose={() => setShowUnitModal(false)}
        data={UNIT_SYSTEMS}
        selectedValue={unitSystem}
        onSelect={setUnitSystem}
        title="Select Unit System"
      />

      <PrimaryButton title="Update Profile" onPress={handleUpdate} loading={loading} style={styles.updateButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg, backgroundColor: Colors.background },
  title: { ...Typography.h1, color: Colors.text, marginBottom: Spacing.lg, marginTop: Spacing.sm },
  sectionTitle: { ...Typography.h4, color: Colors.text, marginTop: Spacing.md, marginBottom: Spacing.sm },
  subLabel: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.xs },
  inputContainer: { marginBottom: Spacing.sm },
  pressableInputContainer: { marginBottom: Spacing.sm, opacity: 0.8 },
  disabledInputContainer: { marginBottom: Spacing.sm, opacity: 0.6 },
  updateButton: { marginTop: Spacing.md, marginBottom: 30 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxHeight: "70%",
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalTitle: { ...Typography.h4, color: Colors.text, textAlign: "center", marginBottom: Spacing.md },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalItemSelected: { backgroundColor: Colors.primary + "20" },
  modalItemText: { ...Typography.body, color: Colors.text },
  modalItemTextSelected: { color: Colors.primary, fontWeight: "600" },
  modalClose: { marginTop: Spacing.md, paddingVertical: Spacing.md, alignItems: "center" },
  modalCloseText: { ...Typography.body, color: Colors.error, fontWeight: "600" },
  checkmark: { fontSize: 18, color: Colors.primary, fontWeight: "bold" },
});