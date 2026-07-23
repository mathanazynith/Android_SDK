import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../service/auth";
import { GradientHeader } from "../../../components/GradientHeader";
import { AppCard } from "../../../components/AppCard";
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

  const calculateAge = (dateOfBirth: string | undefined) => {
    if (!dateOfBirth) return null;
    try {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
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

  const age = calculateAge(user?.profile?.date_of_birth);

  const profileData = user?.profile as any;

  // Get user stats with fallback values
  // You can replace these with actual data from your API when available
  const totalRuns = profileData?.total_runs ?? 0;
  const totalKm = profileData?.total_km ?? 0;
  const following = profileData?.following ?? 0;
  const followers = profileData?.followers ?? 0;
  const weight = profileData?.weight_kg ?? 72;
  const height = profileData?.height_cm ?? 178;

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Profile"
        rightIcon={
          <TouchableOpacity onPress={handleLogout}>
            <Feather name="log-out" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header - Like the image */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </Text>
          </View>
          <Text style={styles.userName}>{fullName || "User"}</Text>
          <Text style={styles.userUsername}>@{user?.username || "user"}</Text>
          
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingText}>⭐️⭐️⭐️⭐️ Elite Runner</Text>
          </View>
        </View>

        {/* Stats Row - Like the image */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalRuns || 184}</Text>
            <Text style={styles.statLabel}>Runs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalKm || 1247}</Text>
            <Text style={styles.statLabel}>Total km</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{following || 48}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{followers || 132}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
        </View>

        {/* Body Measurements Grid - Like the image */}
        <View style={styles.measurementsContainer}>
          <View style={styles.measurementItem}>
            <Text style={styles.measurementValue}>{weight} kg</Text>
            <Text style={styles.measurementLabel}>Weight</Text>
          </View>
          <View style={styles.measurementItem}>
            <Text style={styles.measurementValue}>{height} cm</Text>
            <Text style={styles.measurementLabel}>Height</Text>
          </View>
          <View style={styles.measurementItem}>
            <Text style={styles.measurementValue}>40 km</Text>
            <Text style={styles.measurementLabel}>Weekly Goal</Text>
          </View>
          <View style={styles.measurementItem}>
            <Text style={styles.measurementValue}>{age || 28} years</Text>
            <Text style={styles.measurementLabel}>Age</Text>
          </View>
        </View>

        {/* Achievements & Badges - Like the image */}
        <View style={styles.badgesContainer}>
          <Text style={styles.badgesTitle}>ACHIEVEMENTS & BADGES</Text>
          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeEmoji}>🏃</Text>
              <Text style={styles.badgeLabel}>First 5K</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeEmoji}>🎯</Text>
              <Text style={styles.badgeLabel}>10K Club</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeEmoji}>🔥</Text>
              <Text style={styles.badgeLabel}>30-Day Streak</Text>
            </View>
          </View>
          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeEmoji}>🌅</Text>
              <Text style={styles.badgeLabel}>Early Bird</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeEmoji}>⚡</Text>
              <Text style={styles.badgeLabel}>Speed Demon</Text>
            </View>
          </View>
        </View>

        {/* Premium Badge - Like the image
        <View style={styles.premiumContainer}>
          <Text style={styles.premiumText}>🏅 Premium</Text>
        </View> */}

        {/* Edit Profile Button */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push("/(app)/profile/edit")}
        >
          <Feather name="edit-2" size={18} color="#FFFFFF" />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        
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
                        <View style={[styles.todayIntensityBadge, { backgroundColor: todayWorkout.color || '#34C759' }]}>
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
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: Colors.background,
  },
  scrollContent: { 
    padding: Spacing.md, 
    paddingBottom: Spacing.xxl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },

  // Profile Header - Like the image
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.primary,
  },
  userName: {
    ...Typography.h2,
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  userUsername: {
    ...Typography.body,
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  ratingContainer: {
    marginTop: 4,
  },
  ratingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },

  // Stats Row - Like the image
  statsContainer: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },

  // Measurements Grid - Like the image
  measurementsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  measurementItem: {
    width: "50%",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  measurementValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  measurementLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Badges Section - Like the image
  badgesContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  badgesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  badge: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  badgeEmoji: {
    fontSize: 14,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.text,
  },

  // Premium Badge - Like the image
  premiumContainer: {
    backgroundColor: "#FFD700",
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  premiumText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },

  // Edit Button
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Plan Card (existing)
  planCard: { 
    marginBottom: Spacing.md, 
    borderLeftWidth: 4, 
    borderLeftColor: '#34C759' 
  },
  planHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: Spacing.sm 
  },
  cardTitle: { 
    ...Typography.h4, 
    color: Colors.text,
    fontSize: 16,
  },
  savedBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#34C759', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 12, 
    gap: 4 
  },
  savedBadgeText: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#1A1A1A' 
  },
  planInfo: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    flexWrap: 'wrap', 
    marginBottom: Spacing.sm 
  },
  planInfoItem: { 
    flex: 1, 
    minWidth: '30%', 
    marginBottom: Spacing.xs 
  },
  planInfoLabel: { 
    fontSize: 12, 
    color: Colors.textSecondary 
  },
  planInfoValue: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: Colors.text 
  },
  todayPreview: { 
    backgroundColor: '#F5F7FA', 
    borderRadius: 10, 
    padding: Spacing.sm, 
    marginBottom: Spacing.sm 
  },
  todayPreviewTitle: { 
    fontSize: 12, 
    color: Colors.textSecondary, 
    marginBottom: 4 
  },
  todayWorkoutPreview: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  todayWorkoutRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: Spacing.xs 
  },
  todayWorkoutName: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: Colors.text 
  },
  todayIntensityBadge: { 
    paddingHorizontal: 8, 
    paddingVertical: 2, 
    borderRadius: 10 
  },
  todayIntensityText: { 
    fontSize: 10, 
    color: '#FFFFFF', 
    fontWeight: '600' 
  },
  todayWorkoutDistance: { 
    fontSize: 14, 
    color: Colors.textSecondary 
  },
  restDayContainer: { 
    alignItems: 'center', 
    paddingVertical: Spacing.xs 
  },
  restDayEmoji: { 
    fontSize: 28 
  },
  restDayText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: Colors.text 
  },
  restDaySubtext: { 
    fontSize: 12, 
    color: Colors.textSecondary 
  },
  viewPlanButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: Spacing.xs, 
    paddingVertical: Spacing.sm, 
    backgroundColor: '#34C75920', 
    borderRadius: 8 
  },
  viewPlanButtonText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#1A1A1A' 
  },
  noPlanContainer: { 
    alignItems: 'center', 
    paddingVertical: Spacing.md 
  },
  noPlanEmoji: { 
    fontSize: 40 
  },
  noPlanTitle: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: Colors.text, 
    marginTop: Spacing.xs 
  },
  noPlanSubtext: { 
    fontSize: 14, 
    color: Colors.textSecondary, 
    textAlign: 'center', 
    marginTop: 4, 
    marginBottom: Spacing.sm 
  },
  generatePlanButton: { 
    backgroundColor: '#34C759', 
    paddingVertical: Spacing.sm, 
    paddingHorizontal: Spacing.lg, 
    borderRadius: 8 
  },
  generatePlanButtonText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#1A1A1A' 
  },
});