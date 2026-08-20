import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { router } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../service/auth";
import { AppInput } from "../../../components/common/AppInput";
import { Colors } from "../../../constants/theme";
import { resolveApiUrl } from "../../../service/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDistanceUnitCode, getDistanceUnitPreference, getHeightUnitLabel, getWeightUnitLabel, getUnitSystemLabel } from "../../../utils/distanceUnit";

interface PickerItem { label: string; value: string; }
const dateValue = (value: string) => value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
const ageValue = (value: string) => {
  if (!value) return "--";
  const birthday = new Date(value); const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  if (today.getMonth() < birthday.getMonth() || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate())) age--;
  return String(age);
};

function Picker({ visible, onClose, data, selectedValue, onSelect, title }: { visible: boolean; onClose: () => void; data: PickerItem[]; selectedValue: string; onSelect: (value: string) => void; title: string }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalContent}>
      <Text style={styles.modalTitle}>{title}</Text>
      <FlatList data={data} keyExtractor={(item) => item.value} renderItem={({ item }) => <TouchableOpacity style={[styles.modalItem, selectedValue === item.value && styles.modalItemSelected]} onPress={() => { onSelect(item.value); onClose(); }}><Text style={[styles.modalItemText, selectedValue === item.value && styles.modalItemTextSelected]}>{item.label}</Text>{selectedValue === item.value && <Feather name="check" color={Colors.primary} size={20} />}</TouchableOpacity>} />
      <TouchableOpacity onPress={onClose} style={styles.modalClose}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
    </View></View></Modal>
  );
}

export default function EditProfileScreen() {
  const { user, updateProfile, uploadProfilePicture, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [username] = useState(user?.username || "");
  const [dateOfBirth, setDateOfBirth] = useState(user?.profile?.date_of_birth || "");
  const [gender, setGender] = useState(user?.profile?.gender || "");
  const [bloodGroup, setBloodGroup] = useState(user?.profile?.blood_group || "");
  const [heightCm, setHeightCm] = useState(user?.profile?.height_cm?.toString() || "");
  const [weightKg, setWeightKg] = useState(user?.profile?.weight_kg?.toString() || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || user?.profile?.phone_number || "");
  const [unitSystem, setUnitSystem] = useState<"standard" | "imperial">(getDistanceUnitPreference(user?.profile?.distance_unit));
  const [loading, setLoading] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showBloodModal, setShowBloodModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const GENDERS: PickerItem[] = [{ label: "Male", value: "Male" }, { label: "Female", value: "Female" }, { label: "Other", value: "Other" }];
  const BLOOD_GROUPS: PickerItem[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((value) => ({ label: value, value }));
  const UNIT_SYSTEMS: PickerItem[] = [{ label: "Standard (Km / cm / kg)", value: "standard" }, { label: "Imperial (mile / in / lb)", value: "imperial" }];

  const selectProfilePicture = async (source: "camera" | "gallery") => {
    try {
      const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo library"} access to choose a profile picture.`); return; }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setIsUploadingPicture(true);
      await uploadProfilePicture({ uri: asset.uri, name: asset.fileName || `profile-${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" });
      await refreshProfile();
    } catch (error: any) {
      Alert.alert("Upload failed", error?.response?.data?.detail || "Unable to update your profile picture.");
    } finally { setIsUploadingPicture(false); }
  };

  const openPictureOptions = () => Alert.alert("Profile picture", "Choose a source", [
    { text: "Camera", onPress: () => selectProfilePicture("camera") },
    { text: "Gallery", onPress: () => selectProfilePicture("gallery") },
    { text: "Cancel", style: "cancel" },
  ]);

  const handleUpdate = async () => {
    if (!firstName || !lastName || !username) { Alert.alert("Validation Error", "All fields are required"); return; }
    try {
      setLoading(true);
      await updateProfile({ first_name: firstName, last_name: lastName, username, date_of_birth: dateOfBirth || null, gender: gender || null, blood_group: bloodGroup || null, height_cm: heightCm ? Number(heightCm) : null, weight_kg: weightKg ? Number(weightKg) : null, phone_number: phoneNumber || null, distance_unit: getDistanceUnitCode(unitSystem) });
      Alert.alert("Success", "Profile updated successfully"); router.back();
    } catch (error: any) { Alert.alert("Update Failed", error?.response?.data?.message || "Something went wrong"); }
    finally { setLoading(false); }
  };

  const openDatePicker = () => {
    if (Platform.OS === "android") DateTimePickerAndroid.open({ value: dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1), mode: "date", onChange: (_, date) => { if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`); } });
    else setShowDatePicker(true);
  };

  const profilePictureUri = resolveApiUrl(user?.profile?.profile_picture_url || user?.profile?.profile_picture);
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "U";

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.screen}>
    <SafeAreaView style={styles.safeArea}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>PROFILE PHOTO</Text><View style={styles.photoCard}><View style={styles.avatar}>
        {profilePictureUri ? <Image source={{ uri: profilePictureUri }} style={styles.avatarImage} /> : <Text style={styles.photoInitial}>{initials}</Text>}
        {isUploadingPicture && <View style={styles.uploadOverlay}><ActivityIndicator color="#FFFFFF" /></View>}
        <TouchableOpacity accessibilityLabel="Change profile picture" accessibilityRole="button" onPress={openPictureOptions} style={styles.cameraBadge} disabled={isUploadingPicture}><Feather name="camera" size={18} color="#171717" /></TouchableOpacity>
      </View></View>

      <Text style={styles.sectionLabel}>PERSONAL</Text><View style={styles.formCard}>
        <AppInput label="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" containerStyle={styles.phoneInput} inputStyle={styles.flatInput} />
        <Pressable onPress={openDatePicker} style={styles.formRow}><Text style={styles.rowLabel}>Date of Birth</Text><View style={styles.datePill}><Text style={styles.dateText}>{dateValue(dateOfBirth) || "Select"}</Text></View></Pressable>
        <View style={styles.formRow}><Text style={styles.rowLabel}>Age</Text><Text style={styles.rowValueMuted}>{ageValue(dateOfBirth)}</Text></View>
        <Pressable onPress={() => setShowGenderModal(true)} style={styles.formRow}><Text style={styles.rowLabel}>Gender</Text><View style={styles.selectValue}><Text style={styles.rowValueMuted}>{gender || "Select"}</Text><Feather name="chevrons-down" size={18} color="#868686" /></View></Pressable>
        <Pressable onPress={() => setShowBloodModal(true)} style={[styles.formRow, styles.lastRow]}><Text style={styles.rowLabel}>Blood Group</Text><View style={styles.selectValue}><Text style={styles.rowValueMuted}>{bloodGroup || "Select"}</Text><Feather name="chevrons-down" size={18} color="#868686" /></View></Pressable>
      </View>

      <Text style={styles.sectionLabel}>MEASUREMENTS</Text><View style={styles.formCard}>
        <Pressable onPress={() => setShowUnitModal(true)} style={styles.formRow}><Text style={styles.rowLabel}>Unit System</Text><View style={styles.selectValue}><Text style={styles.unitValue}>{getUnitSystemLabel(unitSystem)}</Text><Feather name="chevrons-down" size={18} color="#868686" /></View></Pressable>
        <AppInput placeholder={`Height (${getHeightUnitLabel(unitSystem)})`} value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" containerStyle={styles.measurementInput} inputStyle={styles.flatInput} />
        <AppInput placeholder={`Weight (${getWeightUnitLabel(unitSystem)})`} value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" containerStyle={styles.measurementInput} inputStyle={styles.lastInput} />
      </View>

      <Text style={styles.sectionLabel}>ACCOUNT INFO</Text><View style={styles.accountCard}>
        <View style={styles.accountRow}><AppInput label="First Name" value={firstName} onChangeText={setFirstName} containerStyle={styles.accountInput} /><AppInput label="Last Name" value={lastName} onChangeText={setLastName} containerStyle={styles.accountInput} /></View>
        <AppInput label="User Name" value={`@${username}`} editable={false} containerStyle={styles.usernameInput} inputStyle={styles.flatInput} /><Feather name="star" size={25} color="#9B9B9D" style={styles.sparkle} />
      </View><View style={styles.footerSpacer} />
    </ScrollView></SafeAreaView>
    <View style={[styles.footer, { bottom: 12 + insets.bottom }]}><TouchableOpacity disabled={loading} onPress={handleUpdate} style={styles.saveButton}><Text style={styles.saveButtonText}>{loading ? "Saving..." : "Save Changes"}</Text></TouchableOpacity></View>
    {showDatePicker && Platform.OS !== "android" && <DateTimePicker value={dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1)} mode="date" display="spinner" onChange={(_, date) => { setShowDatePicker(false); if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`); }} />}
    <Picker visible={showGenderModal} onClose={() => setShowGenderModal(false)} data={GENDERS} selectedValue={gender} onSelect={setGender} title="Select Gender" /><Picker visible={showBloodModal} onClose={() => setShowBloodModal(false)} data={BLOOD_GROUPS} selectedValue={bloodGroup} onSelect={setBloodGroup} title="Select Blood Group" /><Picker visible={showUnitModal} onClose={() => setShowUnitModal(false)} data={UNIT_SYSTEMS} selectedValue={unitSystem} onSelect={(value) => setUnitSystem(value === "imperial" ? "imperial" : "standard")} title="Select Unit System" />
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" }, safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 8 }, content: { paddingHorizontal: 15, paddingBottom: 82 },
  sectionLabel: { color: "#8D8D92", fontSize: 14, fontWeight: "600", marginTop: 11, marginBottom: 7 }, photoCard: { height: 171, borderRadius: 16, backgroundColor: "#171717", alignItems: "center", justifyContent: "center" },
  avatar: { width: 132, height: 132, borderRadius: 66, borderWidth: 3, borderColor: "#DCE9ED", backgroundColor: "#68747B", alignItems: "center", justifyContent: "center", position: "relative" }, avatarImage: { width: "100%", height: "100%", borderRadius: 66 }, photoInitial: { color: "#F7F7F7", fontSize: 42, fontWeight: "500" }, uploadOverlay: { top: 0, right: 0, bottom: 0, left: 0, borderRadius: 66, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.48)", position: "absolute" }, cameraBadge: { position: "absolute", right: -2, bottom: -2, width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F4F4", borderWidth: 1, borderColor: "#C9C9C9" },
  formCard: { borderRadius: 18, backgroundColor: "#171717", paddingHorizontal: 15, borderWidth: 1, borderColor: "#303030" }, phoneInput: { marginBottom: 0, gap: 4 }, flatInput: { borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: "#303030", minHeight: 45, paddingHorizontal: 0, backgroundColor: "transparent" }, lastInput: { borderWidth: 0, borderRadius: 0, minHeight: 45, paddingHorizontal: 0, backgroundColor: "transparent" }, formRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#303030" }, lastRow: { borderBottomWidth: 0 }, rowLabel: { color: "#D3D3D5", fontSize: 18, fontStyle: "italic" }, rowValueMuted: { color: "#A8A8AA", fontSize: 17, fontStyle: "italic" }, selectValue: { maxWidth: "60%", flexDirection: "row", alignItems: "center", gap: 7 }, unitValue: { color: "#A8A8AA", fontSize: 17, fontStyle: "italic", textAlign: "right", flexShrink: 1 }, datePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: "#454547" }, dateText: { color: "#F1F1F1", fontSize: 16 }, measurementInput: { marginBottom: 0, gap: 0 },
  accountCard: { borderRadius: 18, backgroundColor: "#171717", borderWidth: 1, borderColor: "#303030", paddingHorizontal: 15, position: "relative" }, accountRow: { flexDirection: "row", gap: 16 }, accountInput: { flex: 1, gap: 4 }, usernameInput: { marginTop: 1, gap: 4 }, sparkle: { position: "absolute", right: 14, bottom: 15, transform: [{ rotate: "20deg" }] }, footerSpacer: { height: 68 }, footer: { position: "absolute", left: 15, right: 15 }, saveButton: { minHeight: 49, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#10C463" }, saveButtonText: { color: "#DDFBEA", fontSize: 16, fontWeight: "500" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.64)" }, modalContent: { backgroundColor: "#242424", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: "70%" }, modalTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", textAlign: "center", marginBottom: 12 }, modalItem: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#373737" }, modalItemSelected: { paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#1A4420" }, modalItemText: { color: "#EFEFEF", fontSize: 17 }, modalItemTextSelected: { color: Colors.primary, fontWeight: "700" }, modalClose: { paddingTop: 20, alignItems: "center" }, modalCloseText: { color: "#FF5A5A", fontSize: 17, fontWeight: "700" },
});