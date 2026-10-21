import { Alert } from '@/components/ThemedAlert';
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppInput } from "../../../components/common/AppInput";
import ThemedCalendarPicker from "../../../components/common/ThemedCalendarPicker";
import MotionEntrance from "../../../components/MotionEntrance";
import { BRAND_GREEN, useTheme } from "../../../contexts/ThemeContext";
import { resolveApiUrl } from "../../../service/api";
import { useAuth } from "../../../service/auth";
import { getDistanceUnitCode, getDistanceUnitPreference, getHeightUnitLabel, getUnitSystemShortLabel, getWeightUnitLabel } from "../../../utils/distanceUnit";

interface PickerItem { label: string; value: string; }
const parseDateInputValue = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(2000, 0, 1);
};
const formatDateInputValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateValue = (value: string) => value ? parseDateInputValue(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close selector" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
      <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.value}
        contentContainerStyle={styles.modalOptions}
        renderItem={({ item }) => {
          const isSelected = selectedValue === item.value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              android_ripple={{ color: colors.selected }}
              style={[
                styles.modalItem,
                {
                  backgroundColor: isSelected ? colors.selected : colors.surfaceRaised,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { onSelect(item.value); onClose(); }}
            >
              <Text style={[styles.modalItemText, { color: isSelected ? colors.primary : colors.text }]}>{item.label}</Text>
              <View style={[styles.optionCheck, { backgroundColor: isSelected ? colors.primary : "transparent", borderColor: isSelected ? colors.primary : colors.border }]}>
                {isSelected && <Feather name="check" color={colors.primaryText} size={14} />}
              </View>
            </Pressable>
          );
        }}
      />
      <TouchableOpacity onPress={onClose} style={styles.modalClose}><Text style={[styles.modalCloseText, { color: colors.textSecondary }]}>Cancel</Text></TouchableOpacity>
    </View></View></Modal>
  );
}

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { user, updateProfile, uploadProfilePicture, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollContentRef = useRef<View | null>(null);
  const focusedMeasurementInputRef = useRef<TextInput | null>(null);
  const heightInputRef = useRef<TextInput | null>(null);
  const weightInputRef = useRef<TextInput | null>(null);
  const scrollViewportHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const username = user?.username || "";
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
  const [pendingDate, setPendingDate] = useState(() => new Date(2000, 0, 1));
  const [showPictureOptions, setShowPictureOptions] = useState(false);

  const GENDERS: PickerItem[] = [{ label: "Male", value: "Male" }, { label: "Female", value: "Female" }, { label: "Other", value: "Other" }];
  const BLOOD_GROUPS: PickerItem[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((value) => ({ label: value, value }));
  const UNIT_SYSTEMS: PickerItem[] = [{ label: "Standard (km / cm / kg)", value: "standard" }, { label: "Imperial (mile / ft / in / lbs)", value: "imperial" }];
  const hasChanges =
    dateOfBirth !== (user?.profile?.date_of_birth || "") ||
    gender !== (user?.profile?.gender || "") ||
    bloodGroup !== (user?.profile?.blood_group || "") ||
    heightCm !== (user?.profile?.height_cm?.toString() || "") ||
    weightKg !== (user?.profile?.weight_kg?.toString() || "") ||
    phoneNumber !== (user?.phone_number || user?.profile?.phone_number || "") ||
    unitSystem !== getDistanceUnitPreference(user?.profile?.distance_unit);

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

  const openPictureOptions = () => setShowPictureOptions(true);

  const handleClose = () => {
    const returnToProfile = () => {
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/profile");
    };

    if (!hasChanges) {
      returnToProfile();
      return;
    }

    Alert.alert("Discard changes?", "Your profile edits haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: returnToProfile },
    ]);
  };

  const handleUpdate = async () => {
    if (!username.trim()) { Alert.alert("Validation Error", "Username is required"); return; }
    try {
      setLoading(true);
      await updateProfile({ username, date_of_birth: dateOfBirth || null, gender: gender || null, blood_group: bloodGroup || null, height_cm: heightCm ? Number(heightCm) : null, weight_kg: weightKg ? Number(weightKg) : null, phone_number: phoneNumber || null, distance_unit: getDistanceUnitCode(unitSystem) });
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
    const initialDate = dateOfBirth ? parseDateInputValue(dateOfBirth) : new Date(2000, 0, 1);
    setPendingDate(initialDate);
    setShowDatePicker(true);
  };

  const profilePictureUri = resolveApiUrl(user?.profile?.profile_picture_url || user?.profile?.profile_picture);
  const displayName = username.trim() || user?.email?.split("@")[0] || "U";
  const initials = displayName.slice(0, 2).toUpperCase();
  const scrollFocusedInputIntoView = useCallback(() => {
    const input = focusedMeasurementInputRef.current;
    const content = scrollContentRef.current;
    const viewportHeight = scrollViewportHeightRef.current;
    if (!input || !content || viewportHeight <= 0) return;

    input.measureLayout(
      content,
      (_x, y, _width, height) => {
        const scrollOffset = scrollOffsetRef.current;
        const margin = 16;
        const inputTop = y;
        const inputBottom = y + height;
        const visibleTop = scrollOffset;
        const visibleBottom = scrollOffset + viewportHeight;

        if (inputTop < visibleTop + margin) {
          scrollRef.current?.scrollTo({ y: Math.max(0, inputTop - margin), animated: true });
        } else if (inputBottom > visibleBottom - margin) {
          scrollRef.current?.scrollTo({ y: Math.max(0, inputBottom - viewportHeight + margin), animated: true });
        }
      },
      () => undefined,
    );
  }, []);

  useEffect(() => {
    const keyboardSubscription = Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(scrollFocusedInputIntoView);
    });
    return () => keyboardSubscription.remove();
  }, [scrollFocusedInputIntoView]);

  const focusMeasurementInput = (input: TextInput | null) => {
    focusedMeasurementInputRef.current = input;
    requestAnimationFrame(scrollFocusedInputIntoView);
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.screen, { backgroundColor: colors.background }]}>
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.formLayout}>
      <LinearGradient
        colors={[BRAND_GREEN, "#16A600"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={handleClose}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={22} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>
      <ScrollView
        ref={scrollRef}
        style={styles.formScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={styles.content}
        onLayout={(event) => {
          scrollViewportHeightRef.current = event.nativeEvent.layout.height;
          if (focusedMeasurementInputRef.current) requestAnimationFrame(scrollFocusedInputIntoView);
        }}
        onScroll={(event) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
      <View ref={scrollContentRef} collapsable={false}>
      <MotionEntrance>
        <View style={[styles.photoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            {profilePictureUri ? <Image source={{ uri: profilePictureUri }} style={styles.avatarImage} /> : <Text style={[styles.photoInitial, { color: colors.text }]}>{initials}</Text>}
            {isUploadingPicture && <View style={styles.uploadOverlay}><ActivityIndicator color="#FFFFFF" /></View>}
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PROFILE PHOTO</Text>
            <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
            <TouchableOpacity accessibilityLabel="Change profile picture" accessibilityRole="button" onPress={openPictureOptions} style={[styles.photoAction, { backgroundColor: colors.selected }]} disabled={isUploadingPicture}>
              {isUploadingPicture ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="camera" size={15} color={colors.primary} />}
              <Text style={[styles.photoActionText, { color: colors.primary }]}>{isUploadingPicture ? "Uploading" : "Change photo"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </MotionEntrance>

      <MotionEntrance delay={45}>
      <View>
      <View style={styles.sectionHeading}><Feather name="user" size={16} color={colors.primary} /><Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PERSONAL DETAILS</Text></View>
      <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppInput label="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} onFocus={() => { focusedMeasurementInputRef.current = null; }} keyboardType="phone-pad" containerStyle={styles.phoneInput} inputStyle={[styles.flatInput, { borderBottomColor: colors.border }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Choose date of birth" onPress={openDatePicker} android_ripple={{ color: colors.selected }} style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Date of Birth</Text><View style={[styles.selectionPill, { backgroundColor: dateOfBirth ? colors.selected : colors.surfaceRaised }]}><Text style={[styles.dateText, { color: dateOfBirth ? colors.primary : colors.textSecondary }]}>{dateValue(dateOfBirth) || "Select"}</Text><Feather name="calendar" size={14} color={dateOfBirth ? colors.primary : colors.textSecondary} /></View></Pressable>
        <View style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Age</Text><View style={[styles.valuePill, { backgroundColor: dateOfBirth ? colors.selected : colors.surfaceRaised }]}><Text style={[styles.rowValueMuted, { color: dateOfBirth ? colors.primary : colors.textSecondary }]}>{ageValue(dateOfBirth)}</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Gender, ${gender || "not selected"}`} onPress={() => setShowGenderModal(true)} android_ripple={{ color: colors.selected }} style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Gender</Text><View style={styles.selectValue}><View style={[styles.selectionPill, { backgroundColor: gender ? colors.selected : colors.surfaceRaised }]}><Text style={[styles.rowValueMuted, { color: gender ? colors.primary : colors.textSecondary }]}>{gender || "Select"}</Text><Feather name="chevron-down" size={15} color={gender ? colors.primary : colors.textSecondary} /></View></View></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Blood group, ${bloodGroup || "not selected"}`} onPress={() => setShowBloodModal(true)} android_ripple={{ color: colors.selected }} style={[styles.formRow, styles.lastRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Blood Group</Text><View style={styles.selectValue}><View style={[styles.selectionPill, { backgroundColor: bloodGroup ? colors.selected : colors.surfaceRaised }]}><Text style={[styles.rowValueMuted, { color: bloodGroup ? colors.primary : colors.textSecondary }]}>{bloodGroup || "Select"}</Text><Feather name="chevron-down" size={15} color={bloodGroup ? colors.primary : colors.textSecondary} /></View></View></Pressable>
      </View>
      </View>
      </MotionEntrance>

      <MotionEntrance delay={90}>
      <View>
      <View style={styles.sectionHeading}><Feather name="activity" size={16} color={colors.primary} /><Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>MEASUREMENTS</Text></View>
      <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Unit system, ${getUnitSystemShortLabel(unitSystem)}`} onPress={() => setShowUnitModal(true)} android_ripple={{ color: colors.selected }} style={[styles.formRow, { borderBottomColor: colors.border }]}><Text style={[styles.rowLabel, { color: colors.text }]}>Unit System</Text><View style={styles.selectValue}><View style={[styles.selectionPill, { backgroundColor: colors.selected }]}><Text style={[styles.unitValue, { color: colors.primary }]}>{getUnitSystemShortLabel(unitSystem)}</Text><Feather name="chevron-down" size={15} color={colors.primary} /></View></View></Pressable>
        <View style={[styles.measurementRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.measurementLabel, { color: colors.text }]}>Height</Text>
          <View style={styles.measurementValue}>
            <TextInput ref={heightInputRef} value={formatHeight(heightCm, unitSystem)} onChangeText={(value) => setHeightCm(parseHeight(value, unitSystem))} onFocus={() => focusMeasurementInput(heightInputRef.current)} keyboardType="numeric" placeholder="--" placeholderTextColor={colors.textSecondary} style={[styles.measurementTextInput, { color: colors.text }]} />
            <Text style={[styles.measurementUnit, { color: colors.text }]}>{unitSystem === "imperial" ? "ft / in" : getHeightUnitLabel(unitSystem)}</Text>
          </View>
        </View>
        <View style={[styles.measurementRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.measurementLabel, { color: colors.text }]}>Weight</Text>
          <View style={styles.measurementValue}>
            <TextInput ref={weightInputRef} value={formatWeight(weightKg, unitSystem)} onChangeText={(value) => setWeightKg(unitSystem === "imperial" ? String(Math.round(Number(value) / 2.20462 * 10) / 10) : value.replace(/[^0-9.]/g, ""))} onFocus={() => focusMeasurementInput(weightInputRef.current)} keyboardType="numeric" placeholder="--" placeholderTextColor={colors.textSecondary} style={[styles.measurementTextInput, { color: colors.text }]} />
            <Text style={[styles.measurementUnit, { color: colors.text }]}>{unitSystem === "imperial" ? "lbs" : getWeightUnitLabel(unitSystem)}</Text>
          </View>
        </View>
      </View>
      </View>
      </MotionEntrance>

      </View>
    </ScrollView>
      </View>
    </TouchableWithoutFeedback>
    <View style={styles.footer}><TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading || !hasChanges, busy: loading }} disabled={loading || !hasChanges} onPress={handleUpdate} style={[styles.saveButton, { backgroundColor: BRAND_GREEN }, !hasChanges && styles.saveButtonDisabled]}>{loading ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Feather name="check" size={18} color={colors.primaryText} />}<Text style={[styles.saveButtonText, { color: colors.primaryText }]}>{loading ? "Saving..." : hasChanges ? "Save Changes" : "No Changes"}</Text></TouchableOpacity></View>
    </SafeAreaView>
    <Modal visible={showPictureOptions} transparent animationType="slide" onRequestClose={() => setShowPictureOptions(false)}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo options" onPress={() => setShowPictureOptions(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.actionSheetTitle, { color: colors.text }]}>Profile photo</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setShowPictureOptions(false); void selectProfilePicture("camera"); }} style={[styles.actionRow, { borderColor: colors.border }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.selected }]}><Feather name="camera" size={19} color={colors.primary} /></View>
            <Text style={[styles.actionRowText, { color: colors.text }]}>Take a photo</Text>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setShowPictureOptions(false); void selectProfilePicture("gallery"); }} style={[styles.actionRow, { borderColor: colors.border }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.selected }]}><Feather name="image" size={19} color={colors.primary} /></View>
            <Text style={[styles.actionRowText, { color: colors.text }]}>Choose from gallery</Text>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => setShowPictureOptions(false)} style={styles.actionSheetCancel}>
            <Text style={[styles.actionRowText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    {showDatePicker && <ThemedCalendarPicker value={pendingDate} title="Date of birth" maximumDate={new Date()} onCancel={() => setShowDatePicker(false)} onConfirm={(date) => { setDateOfBirth(formatDateInputValue(date)); setShowDatePicker(false); }} />}
    <Picker visible={showGenderModal} onClose={() => setShowGenderModal(false)} data={GENDERS} selectedValue={gender} onSelect={setGender} title="Select Gender" /><Picker visible={showBloodModal} onClose={() => setShowBloodModal(false)} data={BLOOD_GROUPS} selectedValue={bloodGroup} onSelect={setBloodGroup} title="Select Blood Group" /><Picker visible={showUnitModal} onClose={() => setShowUnitModal(false)} data={UNIT_SYSTEMS} selectedValue={unitSystem} onSelect={(value) => setUnitSystem(value === "imperial" ? "imperial" : "standard")} title="Select Unit System" />
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingTop: 8 },
  formLayout: { flex: 1, minHeight: 0 },
  formScroll: { flex: 1 },
  header: { minHeight: 60, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(5,46,22,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 42 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionHeading: { marginTop: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "700" },
  photoCard: { minHeight: 112, padding: 14, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 78, height: 78, borderRadius: 39, borderWidth: 2, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 39 },
  photoInitial: { fontSize: 28, fontWeight: "700" },
  uploadOverlay: { ...StyleSheet.absoluteFill, borderRadius: 39, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.48)" },
  profileDetails: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 4 },
  profileName: { maxWidth: "100%", fontSize: 16, fontWeight: "700" },
  photoAction: { minHeight: 34, marginTop: 3, paddingHorizontal: 10, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 7 },
  photoActionText: { fontSize: 12, fontWeight: "700" },
  formCard: { paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  phoneInput: { marginBottom: 0, gap: 3 },
  flatInput: { minHeight: 44, paddingHorizontal: 0, borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, backgroundColor: "transparent" },
  formRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  lastRow: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: "600" },
  rowValueMuted: { fontSize: 14, fontWeight: "500" },
  selectValue: { maxWidth: "60%", flexDirection: "row", alignItems: "center", gap: 6 },
  unitValue: { fontSize: 14, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  datePill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  selectionPill: { minHeight: 34, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  valuePill: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dateText: { fontSize: 13, fontWeight: "600" },
  measurementRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  measurementLabel: { fontSize: 14, fontWeight: "600" },
  measurementValue: { maxWidth: "70%", flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  measurementTextInput: { minWidth: 70, paddingVertical: 8, paddingHorizontal: 0, fontSize: 15, fontWeight: "600", textAlign: "right" },
  measurementUnit: { marginLeft: 8, fontSize: 13, fontWeight: "600" },
  footer: { marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  saveButton: { minHeight: 54, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  saveButtonDisabled: { opacity: 0.58 },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: { maxHeight: "70%", padding: 20, paddingTop: 12, borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { marginBottom: 12, fontSize: 18, fontWeight: "700", textAlign: "center" },
  sheetHandle: { width: 36, height: 4, marginBottom: 16, borderRadius: 2, alignSelf: "center" },
  modalOptions: { paddingBottom: 4 },
  modalItem: { minHeight: 54, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  modalItemText: { flex: 1, paddingRight: 12, fontSize: 16, fontWeight: "500" },
  optionCheck: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalClose: { paddingTop: 18, alignItems: "center" },
  modalCloseText: { fontSize: 15, fontWeight: "600" },
  actionSheet: { paddingHorizontal: 20, paddingTop: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
  actionSheetTitle: { marginBottom: 8, fontSize: 18, fontWeight: "700", textAlign: "center" },
  datePickerHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  datePickerSide: { width: 64, minHeight: 44, justifyContent: "center" },
  datePickerTitle: { fontSize: 16, fontWeight: "700" },
  datePickerAction: { fontSize: 14, fontWeight: "700" },
  actionRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionRowText: { flex: 1, fontSize: 14, fontWeight: "600" },
  actionSheetCancel: { minHeight: 48, marginTop: 6, alignItems: "center", justifyContent: "center" },
});