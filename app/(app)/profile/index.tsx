import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../service/auth";
import { GradientHeader } from "../../../components/GradientHeader";
import { AppCard } from "../../../components/AppCard";
import { Avatar } from "../../../components/Avatar";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { Colors, Spacing, Typography } from "../../../constants/theme";
import { storage } from "../../../service/storage";
import { Feather } from "@expo/vector-icons";

interface WorkoutDay {
  day: string;
  workout: string;
  distance: string;
  intensity: 'Easy' | 'Hard' | 'Medium';
  icon: string;
  color: string;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [savedPlan, setSavedPlan] = useState<any>(null);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutDay | null>(null);

  useEffect(() => {
    loadSavedPlan();
  }, []);

  const loadSavedPlan = async () => {
    try {
      const planData = await storage.getItem(storage.KEYS.TRAINING_PLAN);
      if (planData) {
        const parsed = JSON.parse(planData);
        setSavedPlan(parsed);
        setHasSavedPlan(true);
        
        // Get today's workout
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = days[new Date().getDay()];
        const workout = parsed.weeklyWorkouts?.find((w: WorkoutDay) => w.day === today);
        setTodayWorkout(workout || null);
      } else {
        setHasSavedPlan(false);
        setSavedPlan(null);
        setTodayWorkout(null);
      }
    } catch (error) {
      console.error("Error loading saved plan:", error);
      setHasSavedPlan(false);
    }
  };

  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  const getUnitLabel = (unitSystem: string | undefined) => {
    if (unitSystem === "imperial") return "Imperial (lbs, ft)";
    return "Metric (kg, cm)";
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const isRestDay = todayWorkout?.workout === 'Rest' || todayWorkout?.workout === 'Rest Day';

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ color: Colors.text }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GradientHeader
        title="My Profile"
        rightIcon={
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header */}
        <AppCard variant="elevated" padding={Spacing.xl} style={styles.headerCard}>
          <Avatar
            name={fullName}
            imageUrl={user?.profile?.profile_picture}
            size={80}
            style={styles.avatar}
          />
          <Text style={styles.name}>{fullName || "User"}</Text>
          <Text style={styles.email}>{user?.email || "No email"}</Text>
        </AppCard>

        {/* ✅ NEW: Saved Training Plan Section */}
        <AppCard variant="elevated" padding={Spacing.md} style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.cardTitle}>📋 My Training Plan</Text>
            {hasSavedPlan && (
              <View style={styles.savedBadge}>
                <Feather name="check-circle" size={14} color="#1A1A1A" />
                <Text style={styles.savedBadgeText}>Saved</Text>
              </View>
            )}
          </View>

          {hasSavedPlan && savedPlan ? (
            <>
              <View style={styles.planInfo}>
                <View style={styles.planInfoItem}>
                  <Text style={styles.planInfoLabel}>Plan Type</Text>
                  <Text style={styles.planInfoValue}>
                    {savedPlan.isFiveKPlan ? '5K Plan' : savedPlan.isBeginner ? 'Beginner Plan' : 'Custom Plan'}
                  </Text>
                </View>
                <View style={styles.planInfoItem}>
                  <Text style={styles.planInfoLabel}>Current Week</Text>
                  <Text style={styles.planInfoValue}>Week {savedPlan.selectedWeek || 1}</Text>
                </View>
                <View style={styles.planInfoItem}>
                  <Text style={styles.planInfoLabel}>Total Workouts</Text>
                  <Text style={styles.planInfoValue}>
                    {savedPlan.weeklyWorkouts?.filter((w: WorkoutDay) => w.workout !== 'Rest' && w.workout !== 'Rest Day').length || 0} per week
                  </Text>
                </View>
              </View>

              {/* Today's Workout Preview */}
              {todayWorkout && (
                <View style={styles.todayPreview}>
                  <Text style={styles.todayPreviewTitle}>Today's Workout</Text>
                  {isRestDay ? (
                    <View style={styles.restDayContainer}>
                      <Text style={styles.restDayEmoji}>🧘</Text>
                      <Text style={styles.restDayText}>Rest Day</Text>
                      <Text style={styles.restDaySubtext}>Active Recovery</Text>
                    </View>
                  ) : (
                    <View style={styles.todayWorkoutPreview}>
                      <View style={styles.todayWorkoutRow}>
                        <Text style={styles.todayWorkoutName}>{todayWorkout.workout}</Text>
                        <View style={[styles.todayIntensityBadge, { backgroundColor: todayWorkout.color }]}>
                          <Text style={styles.todayIntensityText}>{todayWorkout.intensity}</Text>
                        </View>
                      </View>
                      <Text style={styles.todayWorkoutDistance}>{todayWorkout.distance}</Text>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.viewPlanButton}
                onPress={() => router.push('/(app)/training-plan')}
              >
                <Feather name="eye" size={18} color="#1A1A1A" />
                <Text style={styles.viewPlanButtonText}>View Full Training Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deletePlanButton}
                onPress={() => {
                  Alert.alert(
                    "Delete Plan",
                    "Are you sure you want to delete your saved training plan?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await storage.removeItem(storage.KEYS.TRAINING_PLAN);
                            setHasSavedPlan(false);
                            setSavedPlan(null);
                            setTodayWorkout(null);
                            Alert.alert("Deleted", "Your training plan has been deleted.");
                          } catch (error) {
                            Alert.alert("Error", "Failed to delete plan. Please try again.");
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Feather name="trash-2" size={16} color="#FF3B30" />
                <Text style={styles.deletePlanText}>Delete Plan</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.noPlanContainer}>
              <Text style={styles.noPlanEmoji}>📋</Text>
              <Text style={styles.noPlanTitle}>No Training Plan Saved</Text>
              <Text style={styles.noPlanSubtext}>
                Complete the questionnaire to generate your personalized training plan.
              </Text>
              <TouchableOpacity
                style={styles.generatePlanButton}
                onPress={() => router.push('/(app)/questionnaire')}
              >
                <Text style={styles.generatePlanButtonText}>Generate Plan</Text>
              </TouchableOpacity>
            </View>
          )}
        </AppCard>

        {/* Personal Information */}
        <AppCard variant="elevated" padding={Spacing.md} style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>First Name</Text>
            <Text style={styles.value}>{user?.first_name || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Last Name</Text>
            <Text style={styles.value}>{user?.last_name || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.value}>{user?.username || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user?.email || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>
              {user?.phone_number || user?.profile?.phone_number || "N/A"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Date of Birth</Text>
            <Text style={styles.value}>{formatDate(user?.profile?.date_of_birth)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Gender</Text>
            <Text style={styles.value}>{user?.profile?.gender || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Blood Group</Text>
            <Text style={styles.value}>{user?.profile?.blood_group || "N/A"}</Text>
          </View>
        </AppCard>

        {/* Body Measurements */}
        <AppCard variant="elevated" padding={Spacing.md} style={styles.card}>
          <Text style={styles.cardTitle}>Body Measurements</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Unit System</Text>
            <Text style={styles.value}>{getUnitLabel(user?.profile?.unit_system)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Height</Text>
            <Text style={styles.value}>
              {user?.profile?.height_cm
                ? `${user.profile.height_cm} ${user?.profile?.unit_system === "imperial" ? "ft/in" : "cm"}`
                : "N/A"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Weight</Text>
            <Text style={styles.value}>
              {user?.profile?.weight_kg
                ? `${user.profile.weight_kg} ${user?.profile?.unit_system === "imperial" ? "lbs" : "kg"}`
                : "N/A"}
            </Text>
          </View>
        </AppCard>

        <PrimaryButton
          title="Edit Profile"
          onPress={() => router.push("/(app)/profile/edit")}
          style={styles.editButton}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  headerCard: { alignItems: "center", marginBottom: Spacing.md },
  avatar: { marginBottom: Spacing.md },
  name: { ...Typography.h2, color: Colors.text },
  email: { ...Typography.body, color: Colors.textSecondary },
  logoutText: { color: Colors.primary, ...Typography.button, fontSize: 14 },
  card: { marginBottom: Spacing.md },
  cardTitle: { ...Typography.h4, color: Colors.text, marginBottom: Spacing.sm },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { ...Typography.bodySmall, color: Colors.textSecondary, flex: 0.4 },
  value: { ...Typography.bodySmall, color: Colors.text, fontWeight: "500", flex: 0.6, textAlign: "right" },
  editButton: { marginTop: Spacing.md },

  // Plan Card Styles
  planCard: { marginBottom: Spacing.md, borderLeftWidth: 4, borderLeftColor: '#34C759' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  savedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#34C759', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  savedBadgeText: { fontSize: 12, fontWeight: '600', color: '#1A1A1A' },
  planInfo: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: Spacing.sm },
  planInfoItem: { flex: 1, minWidth: '30%', marginBottom: Spacing.xs },
  planInfoLabel: { fontSize: 12, color: Colors.textSecondary },
  planInfoValue: { fontSize: 14, fontWeight: '600', color: Colors.text },

  // Today Preview
  todayPreview: { backgroundColor: '#F5F7FA', borderRadius: 10, padding: Spacing.sm, marginBottom: Spacing.sm },
  todayPreviewTitle: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  todayWorkoutPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayWorkoutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  todayWorkoutName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  todayIntensityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  todayIntensityText: { fontSize: 10, color: '#FFFFFF', fontWeight: '600' },
  todayWorkoutDistance: { fontSize: 14, color: Colors.textSecondary },

  // Rest Day
  restDayContainer: { alignItems: 'center', paddingVertical: Spacing.xs },
  restDayEmoji: { fontSize: 28 },
  restDayText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  restDaySubtext: { fontSize: 12, color: Colors.textSecondary },

  // View Plan Button
  viewPlanButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, backgroundColor: '#34C75920', borderRadius: 8 },
  viewPlanButtonText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },

  // Delete Plan Button
  deletePlanButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  deletePlanText: { fontSize: 14, color: '#FF3B30' },

  // No Plan
  noPlanContainer: { alignItems: 'center', paddingVertical: Spacing.md },
  noPlanEmoji: { fontSize: 40 },
  noPlanTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, marginTop: Spacing.xs },
  noPlanSubtext: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: Spacing.sm },
  generatePlanButton: { backgroundColor: '#34C759', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: 8 },
  generatePlanButtonText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
});