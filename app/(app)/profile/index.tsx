import React from "react";
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../service/auth";
import { Colors } from "../../../constants/theme";

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
  const { user, logout } = useAuth();

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

  return (
    <SafeAreaView style={styles.safeArea}>
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
              <Text style={styles.avatarText}>{initials}</Text>
              <View style={styles.cameraBadge}>
                <Feather name="camera" size={16} color={Colors.primaryDark} />
              </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#090B0C",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 14 : 14,
  },
  container: { flex: 1, backgroundColor: "#090B0C" },
  scrollContent: { paddingBottom: Platform.OS === "ios" ? 16 : 10 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090B0C" },
  loadingText: { color: Colors.text, fontSize: 16 },
  hero: {
    minHeight: 218,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: "hidden",
  },
  heroNavigation: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  circleButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  editButton: { minWidth: 68, height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.19)" },
  editButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  profileIdentity: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 15 },
  avatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 7, backgroundColor: "rgba(255,255,255,0.16)" },
  avatarText: { color: "#FFFFFF", fontSize: 31, fontWeight: "600" },
  cameraBadge: { position: "absolute", right: -6, bottom: -4, width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#26B705", backgroundColor: "#FFFFFF" },
  name: { color: "#FFFFFF", fontSize: 20, lineHeight: 25, fontWeight: "700", textAlign: "center" },
  username: { color: "rgba(255,255,255,0.72)", fontSize: 14, fontWeight: "500", marginTop: 0 },
  detailsCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 23, backgroundColor: "#242627", borderWidth: 1.25, borderColor: "#66686A", paddingHorizontal: 17, paddingVertical: 7, shadowColor: "#000000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 6 }, shadowRadius: 10, elevation: 3 },
  detailRow: { minHeight: 37, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#515354" },
  detailLabel: { flex: 0.45, color: "#BDBEC0", fontSize: 14, fontWeight: "500" },
  detailValue: { flex: 0.55, color: "#F7F7F7", fontSize: 14, fontWeight: "700", textAlign: "right" },
  logoutButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7, padding: 7 },
  logoutText: { color: "#B8B8B8", fontSize: 13, fontWeight: "600" },
});
