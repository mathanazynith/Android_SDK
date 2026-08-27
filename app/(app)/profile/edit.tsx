import React, { useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native";
import { router } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../service/auth";
import { AppInput } from "../../../components/common/AppInput";
import { Colors } from "../../../constants/theme";
import { BRAND_GREEN, useTheme } from "../../../contexts/ThemeContext";
import { resolveApiUrl } from "../../../service/api";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getDistanceUnitCode, getDistanceUnitPreference, getHeightUnitLabel, getWeightUnitLabel, getUnitSystemShortLabel } from "../../../utils/distanceUnit";

interface PickerItem { label: string; value: string; }
const dateValue = (value: string) => value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
const ageValue = (value: string) => {
  if (!value) return "--";
  const birthday = new Date(value); const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  if (today.getMonth() < birthday.getMonth() || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate())) age--;
  return String(age);
};
const formatHeight = (value: string, unitSystem: "standard" | "imperial") => {
  const centimeters = Number(value);
  if (!Number.isFinite(centimeters) || centimeters <= 0) return "";
  if (unitSystem === "standard") return String(Math.round(centimeters * 10) / 10);
  const inches = Math.round(centimeters / 2.54);
  return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
};
const formatWeight = (value: string, unitSystem: "standard" | "imperial") => {
  const kilograms = Number(value);
  if (!Number.isFinite(kilograms) || kilograms <= 0) return "";
  return String(Math.round((unitSystem === "imperial" ? kilograms * 2.20462 : kilograms) * 10) / 10);
};
const parseHeight = (value: string, unitSystem: "standard" | "imperial") => {
  const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!numbers.length) return "";
  if (unitSystem === "standard") return String(numbers[0]);
  const inches = numbers.length > 1 ? numbers[0] * 12 + numbers[1] : numbers[0];
  return String(Math.round(inches * 2.54 * 10) / 10);
};

function Picker({ visible, onClose, data, selectedValue, onSelect, title }: { visible: boolean; onClose: () => void; data: PickerItem[]; selectedValue: string; onSelect: (value: string) => void; title: string }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
      <FlatList data={data} keyExtractor={(item) => item.value} renderItem={({ item }) => <TouchableOpacity style={[styles.modalItem, { borderBottomColor: colors.border }, selectedValue === item.value && { backgroundColor: colors.surfaceRaised }]} onPress={() => { onSelect(item.value); onClose(); }}><Text style={[styles.modalItemText, { color: colors.text }, selectedValue === item.value && { color: BRAND_GREEN }]}>{item.label}</Text>{selectedValue === item.value && <Feather name="check" color={BRAND_GREEN} size={20} />}</TouchableOpacity>} />
      <TouchableOpacity onPress={onClose} style={styles.modalClose}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
    </View></View></Modal>
  );
}

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { user, updateProfile, uploadProfilePicture, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
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
  const UNIT_SYSTEMS: PickerItem[] = [{ label: "Standard (km / cm / kg)", value: "standard" }, { label: "Imperial (mile / ft / in / lbs)", value: "imperial" }];

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
      Alert.alert("Success", "Profile updated successfully", [
        {
          text: "OK",
          onPress: () => {
            if (router.canGoBack()) router.back();
            else router.replace("/(app)/profile");
          },
        },
      ]);
    } catch (error: any) { Alert.alert("Update Failed", error?.response?.data?.message || "Something went wrong"); }
    finally { setLoading(false); }
  };

  const openDatePicker = () => {
    if (Platform.OS === "android") DateTimePickerAndroid.open({ value: dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1), mode: "date", onChange: (_, date) => { if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`); } });
    else setShowDatePicker(true);
  };

  const profilePictureUri = resolveApiUrl(user?.profile?.profile_picture_url || user?.profile?.profile_picture);
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "U";
  const scrollToField = (offset: number) => {
    scrollRef.current?.scrollTo({ y: offset, animated: true });
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.screen, { backgroundColor: colors.background }]}>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}><ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={styles.content}
      >
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PROFILE PHOTO</Text><View style={[styles.photoCard, { backgroundColor: colors.surface }]}><View style={styles.avatar}>
        {profilePictureUri ? <Image source={{ uri: profilePictureUri }} style={styles.avatarImage} /> : <Text style={styles.photoInitial}>{initials}</Text>}
        {isUploadingPicture && <View style={styles.uploadOverlay}><ActivityIndicator color="#FFFFFF" /></View>}
        <TouchableOpacity accessibilityLabel="Change profile picture" accessibilityRole="button" onPress={openPictureOptions} style={styles.cameraBadge} disabled={isUploadingPicture}><Feather name="camera" size={18} color="#171717" /></TouchableOpacity>
      </View></View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PERSONAL</Text><View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppInput label="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} onFocus={() => scrollToField(70)} keyboardType="phone-pad" containerStyle={styles.phoneInput} inputStyle={styles.flatInput} />
        <Pressable onPress={openDatePicker} style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Date of Birth</Text><View style={[styles.datePill, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.dateText, { color: colors.text }]}>{dateValue(dateOfBirth) || "Select"}</Text></View></Pressable>
        <View style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Age</Text><Text style={[styles.rowValueMuted, { color: colors.text }]}>{ageValue(dateOfBirth)}</Text></View>
        <Pressable onPress={() => setShowGenderModal(true)} style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Gender</Text><View style={styles.selectValue}><Text style={[styles.rowValueMuted, { color: colors.text }]}>{gender || "Select"}</Text><Feather name="chevrons-down" size={18} color={colors.textSecondary} /></View></Pressable>
        <Pressable onPress={() => setShowBloodModal(true)} style={[styles.formRow, styles.lastRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Blood Group</Text><View style={styles.selectValue}><Text style={[styles.rowValueMuted, { color: colors.text }]}>{bloodGroup || "Select"}</Text><Feather name="chevrons-down" size={18} color={colors.textSecondary} /></View></Pressable>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>MEASUREMENTS</Text><View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={() => setShowUnitModal(true)} style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Unit System</Text><View style={styles.selectValue}><Text style={[styles.unitValue, { color: colors.text }]}>{getUnitSystemShortLabel(unitSystem)}</Text><Feather name="chevrons-down" size={18} color={colors.textSecondary} /></View></Pressable>
        <View style={[styles.measurementRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.measurementLabel, { color: colors.text }]}>Height</Text>
          <View style={styles.measurementValue}>
            <TextInput value={formatHeight(heightCm, unitSystem)} onChangeText={(value) => setHeightCm(parseHeight(value, unitSystem))} onFocus={() => scrollToField(280)} keyboardType="numeric" placeholder="--" placeholderTextColor={colors.textSecondary} style={[styles.measurementTextInput, { color: colors.text }]} />
            <Text style={[styles.measurementUnit, { color: colors.text }]}>{unitSystem === "imperial" ? "ft / in" : getHeightUnitLabel(unitSystem)}</Text>
          </View>
        </View>
        <View style={styles.measurementRow}>
          <Text style={[styles.measurementLabel, { color: colors.text }]}>Weight</Text>
          <View style={styles.measurementValue}>
            <TextInput value={formatWeight(weightKg, unitSystem)} onChangeText={(value) => setWeightKg(unitSystem === "imperial" ? String(Math.round(Number(value) / 2.20462 * 10) / 10) : value.replace(/[^0-9.]/g, ""))} onFocus={() => scrollToField(340)} keyboardType="numeric" placeholder="--" placeholderTextColor={colors.textSecondary} style={[styles.measurementTextInput, { color: colors.text }]} />
            <Text style={[styles.measurementUnit, { color: colors.text }]}>{unitSystem === "imperial" ? "lbs" : getWeightUnitLabel(unitSystem)}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACCOUNT INFO</Text><View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.accountRow}><AppInput label="First Name" value={firstName} editable={false} onChangeText={setFirstName} onFocus={() => scrollToField(440)} containerStyle={styles.accountInput} /><AppInput label="Last Name" value={lastName} editable={false} onChangeText={setLastName} onFocus={() => scrollToField(440)} containerStyle={styles.accountInput} /></View>
        <AppInput label="User Name" value={`${username}`} editable={false} containerStyle={styles.usernameInput} inputStyle={styles.flatInput} /><Feather name="star" size={25} color="#9B9B9D" style={styles.sparkle} />
      </View><View style={styles.footerSpacer} />
    </ScrollView></SafeAreaView>
    </TouchableWithoutFeedback>
    <View style={[styles.footer, { bottom: 12 + insets.bottom }]}><TouchableOpacity disabled={loading} onPress={handleUpdate} style={[styles.saveButton, { backgroundColor: BRAND_GREEN }]}><Text style={[styles.saveButtonText, { color: colors.background }]}>{loading ? "Saving..." : "Save Changes"}</Text></TouchableOpacity></View>
    {showDatePicker && Platform.OS !== "android" && <DateTimePicker value={dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1)} mode="date" display="spinner" onChange={(_, date) => { setShowDatePicker(false); if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`); }} />}
    <Picker visible={showGenderModal} onClose={() => setShowGenderModal(false)} data={GENDERS} selectedValue={gender} onSelect={setGender} title="Select Gender" /><Picker visible={showBloodModal} onClose={() => setShowBloodModal(false)} data={BLOOD_GROUPS} selectedValue={bloodGroup} onSelect={setBloodGroup} title="Select Blood Group" /><Picker visible={showUnitModal} onClose={() => setShowUnitModal(false)} data={UNIT_SYSTEMS} selectedValue={unitSystem} onSelect={(value) => setUnitSystem(value === "imperial" ? "imperial" : "standard")} title="Select Unit System" />
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" }, safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 8 }, content: { paddingHorizontal: 15, paddingBottom: 82 },
  sectionLabel: { color: "#8D8D92", fontSize: 13, fontWeight: "600", marginTop: 10, marginBottom: 6 }, photoCard: { height: 171, borderRadius: 16, backgroundColor: "#171717", alignItems: "center", justifyContent: "center" },
  avatar: { width: 132, height: 132, borderRadius: 66, borderWidth: 3, borderColor: "#DCE9ED", backgroundColor: "#68747B", alignItems: "center", justifyContent: "center", position: "relative" }, avatarImage: { width: "100%", height: "100%", borderRadius: 66 }, photoInitial: { color: "#F7F7F7", fontSize: 42, fontWeight: "500" }, uploadOverlay: { top: 0, right: 0, bottom: 0, left: 0, borderRadius: 66, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.48)", position: "absolute" }, cameraBadge: { position: "absolute", right: -2, bottom: -2, width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F4F4", borderWidth: 1, borderColor: "#C9C9C9" },
  formCard: { borderRadius: 18, backgroundColor: "#171717", paddingHorizontal: 15, borderWidth: 1, borderColor: "#303030" }, phoneInput: { marginBottom: 0, gap: 3 }, flatInput: { borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: "#303030", minHeight: 42, paddingHorizontal: 0, backgroundColor: "transparent" }, lastInput: { borderWidth: 0, borderRadius: 0, minHeight: 42, paddingHorizontal: 0, backgroundColor: "transparent" }, formRow: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#303030" }, lastRow: { borderBottomWidth: 0 }, rowLabel: { color: "#D3D3D5", fontSize: 16, fontStyle: "italic" }, rowValueMuted: { color: "#A8A8AA", fontSize: 15, fontStyle: "italic" }, selectValue: { maxWidth: "60%", flexDirection: "row", alignItems: "center", gap: 6 }, unitValue: { color: "#A8A8AA", fontSize: 15, fontStyle: "italic", textAlign: "right", flexShrink: 1 }, datePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: "#454547" }, dateText: { color: "#F1F1F1", fontSize: 14 }, measurementInput: { marginBottom: 0, gap: 0 }, measurementRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1 }, measurementLabel: { fontSize: 16, fontWeight: "600" }, measurementValue: { maxWidth: "70%", flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }, measurementTextInput: { minWidth: 70, paddingVertical: 8, paddingHorizontal: 0, fontSize: 16, fontWeight: "600", textAlign: "right" }, measurementUnit: { marginLeft: 8, fontSize: 15, fontWeight: "600" },
  accountCard: { borderRadius: 18, backgroundColor: "#171717", borderWidth: 1, borderColor: "#303030", paddingHorizontal: 15, position: "relative" }, accountRow: { flexDirection: "row", gap: 16 }, accountInput: { flex: 1, gap: 4 }, usernameInput: { marginTop: 1, gap: 4 }, sparkle: { position: "absolute", right: 14, bottom: 15, transform: [{ rotate: "20deg" }] }, footerSpacer: { height: 68 }, footer: { position: "absolute", left: 15, right: 15 }, saveButton: { minHeight: 49, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#4910c4" }, saveButtonText: { color: "#DDFBEA", fontSize: 16, fontWeight: "500" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.64)" }, modalContent: { backgroundColor: "#242424", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: "70%" }, modalTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", textAlign: "center", marginBottom: 12 }, modalItem: { minHeight: 54, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#373737" }, modalItemSelected: { paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#1A4420" }, modalItemText: { flex: 1, paddingRight: 12, color: "#EFEFEF", fontSize: 17 }, modalItemTextSelected: { color: Colors.primary, fontWeight: "700" }, modalClose: { paddingTop: 20, alignItems: "center" }, modalCloseText: { color: "#FF5A5A", fontSize: 17, fontWeight: "700" },
});