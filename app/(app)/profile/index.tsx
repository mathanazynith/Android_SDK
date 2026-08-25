import React from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../../service/auth";
import { Colors } from "../../../constants/theme";
import { resolveApiUrl } from "../../../service/api";
import { SafeAreaView } from "react-native-safe-area-context";
import GlobalBottomNav from "../../../components/navigation/GlobalBottomNav";

type DetailRowProps = { label: string; value: string };

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const formatDate = (value?: string) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const calculateAge = (dateOfBirth?: string) => {
  if (!dateOfBirth) return "--";
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return "--";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return String(age);
};

export default function ProfileScreen() {
  const { user, logout, uploadProfilePicture } = useAuth();
  const [isUploadingPicture, setIsUploadingPicture] = React.useState(false);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const selectProfilePicture = async (source: "camera" | "gallery") => {
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo library"} access to choose a profile picture.`);
        return;
      }

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85, mediaTypes: ImagePicker.MediaTypeOptions.Images });

      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;

      setIsUploadingPicture(true);
      await uploadProfilePicture({
        uri: asset.uri,
        name: asset.fileName || `profile-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
    } catch (error: any) {
      Alert.alert("Upload failed", error?.response?.data?.detail || "Unable to update your profile picture.");
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const openPictureOptions = () => {
    Alert.alert("Profile picture", "Choose a source", [
      { text: "Camera", onPress: () => selectProfilePicture("camera") },
      { text: "Gallery", onPress: () => selectProfilePicture("gallery") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const profile = user.profile as any;
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User";
  const initials = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase() || "U";
  const account = user as any;
  const memberSince = profile?.member_since || profile?.created_at || account?.date_joined || account?.created_at;
  const profilePicture = profile?.profile_picture_url || profile?.profile_picture;
  const profilePictureUri = resolveApiUrl(profilePicture);

  return (
    <SafeAreaView edges={[]} style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      >
        <LinearGradient
          colors={["#39C80B", "#16A600"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroNavigation}>
            <TouchableOpacity
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.circleButton}
            >
              <Feather name="chevron-left" size={29} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Profile</Text>
            <TouchableOpacity
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
              onPress={() => router.push("/(app)/profile/edit")}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileIdentity}>
            <View style={styles.avatar}>
              {profilePictureUri ? <Image source={{ uri: profilePictureUri }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}
              {isUploadingPicture ? <View style={styles.uploadOverlay}><ActivityIndicator color="#FFFFFF" /></View> : null}
              <TouchableOpacity accessibilityLabel="Change profile picture" accessibilityRole="button" onPress={openPictureOptions} style={styles.cameraBadge} disabled={isUploadingPicture}>
                <Feather name="camera" size={16} color={Colors.primaryDark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.username}>@{user.username || "user"}</Text>
          </View>
        </LinearGradient>

        <View style={styles.detailsCard}>
          <DetailRow label="Email" value={user.email || "--"} />
          <DetailRow label="Phone Number" value={user.phone_number || profile?.phone_number || "--"} />
          <DetailRow label="Date of Birth" value={formatDate(profile?.date_of_birth)} />
          <DetailRow label="Age" value={calculateAge(profile?.date_of_birth)} />
          <DetailRow label="Gender" value={profile?.gender || "--"} />
          <DetailRow label="Blood Group" value={profile?.blood_group || "--"} />
          <DetailRow label="Height" value={profile?.height_cm ? `${profile.height_cm} cm` : "--"} />
          <DetailRow label="Weight" value={profile?.weight_kg ? `${profile.weight_kg} kg` : "--"} />
          <DetailRow label="Member Since" value={formatDate(memberSince)} />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleLogout}
          style={styles.logoutButton}
        >
          <Feather name="log-out" size={17} color="#B8B8B8" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
      <GlobalBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#090B0C",
  },
  container: { flex: 1, backgroundColor: "#090B0C" },
  scrollContent: { paddingBottom: 118 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090B0C" },
  loadingText: { color: Colors.text, fontSize: 16 },
  hero: {
    minHeight: 184,
    paddingHorizontal: 18,
    paddingTop: 4,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: "hidden",
  },
  heroNavigation: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  circleButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  editButton: { minWidth: 68, height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.19)" },
  editButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  profileIdentity: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 10 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 6, backgroundColor: "rgba(255,255,255,0.16)" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 41 },
  avatarText: { color: "#FFFFFF", fontSize: 31, fontWeight: "600" },
  uploadOverlay: { ...StyleSheet.absoluteFill, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.42)" },
  cameraBadge: { position: "absolute", right: -6, bottom: -4, width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#26B705", backgroundColor: "#FFFFFF" },
  name: { color: "#FFFFFF", fontSize: 18, lineHeight: 23, fontWeight: "700", textAlign: "center" },
  username: { color: "rgba(255,255,255,0.72)", fontSize: 14, fontWeight: "500", marginTop: 0 },
  detailsCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, backgroundColor: "#242627", borderWidth: 1.25, borderColor: "#66686A", paddingHorizontal: 15, paddingVertical: 5, shadowColor: "#000000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 6 }, shadowRadius: 10, elevation: 3 },
  detailRow: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#515354" },
  detailLabel: { flex: 0.45, color: "#BDBEC0", fontSize: 13, fontWeight: "500" },
  detailValue: { flex: 0.55, color: "#F7F7F7", fontSize: 13, fontWeight: "700", textAlign: "right" },
  logoutButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7, padding: 7 },
  logoutText: { color: "#B8B8B8", fontSize: 13, fontWeight: "600" },
});
