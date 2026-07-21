import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { trainingStyles as styles } from "./styles";
import { Feather, Ionicons } from "@expo/vector-icons";
import { storage } from "../../../service/storage";

interface WorkoutDay {
  day: string;
  workout: string;
  distance: string;
  intensity: 'Easy' | 'Hard' | 'Medium';
  icon: string;
  color: string;
}

// 5K Training Plan - Full 4 Week Program
const FIVE_K_PLAN_WEEKS: { [key: number]: WorkoutDay[] } = {
  1: [
    { day: 'Mon', workout: 'Easy Run', distance: '3 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Wed', workout: 'Easy Run', distance: '3 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Thu', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Fri', workout: 'Easy Run', distance: '3 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Sat', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
  2: [
    { day: 'Mon', workout: 'Easy Run', distance: '4 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Wed', workout: 'Easy Run', distance: '4 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Thu', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Fri', workout: 'Easy Run', distance: '4 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Sat', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
  3: [
    { day: 'Mon', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Wed', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Thu', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Fri', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Sat', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
  4: [
    { day: 'Mon', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Wed', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Thu', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Fri', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Sat', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
};

// Custom Plan for users with 3+ days
const CUSTOM_PLAN_WEEKS: { [key: number]: WorkoutDay[] } = {
  1: [
    { day: 'Mon', workout: 'Easy Run', distance: '5 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Intervals', distance: '8 km', intensity: 'Hard', icon: '⚡', color: '#FF3B30' },
    { day: 'Wed', workout: 'Recovery', distance: '3 km', intensity: 'Easy', icon: '🔄', color: '#8E8E93' },
    { day: 'Thu', workout: 'Tempo Run', distance: '7 km', intensity: 'Medium', icon: '🏃', color: '#FF9500' },
    { day: 'Fri', workout: 'Rest Day', distance: 'Active recovery', intensity: 'Easy', icon: '🧘', color: '#34C759' },
    { day: 'Sat', workout: 'Long Run', distance: '15 km', intensity: 'Medium', icon: '⭐', color: '#34C759' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
  2: [
    { day: 'Mon', workout: 'Easy Run', distance: '6 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Intervals', distance: '9 km', intensity: 'Hard', icon: '⚡', color: '#FF3B30' },
    { day: 'Wed', workout: 'Recovery', distance: '4 km', intensity: 'Easy', icon: '🔄', color: '#8E8E93' },
    { day: 'Thu', workout: 'Tempo Run', distance: '8 km', intensity: 'Medium', icon: '🏃', color: '#FF9500' },
    { day: 'Fri', workout: 'Rest Day', distance: 'Active recovery', intensity: 'Easy', icon: '🧘', color: '#34C759' },
    { day: 'Sat', workout: 'Long Run', distance: '16 km', intensity: 'Medium', icon: '⭐', color: '#34C759' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
  3: [
    { day: 'Mon', workout: 'Easy Run', distance: '7 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Intervals', distance: '10 km', intensity: 'Hard', icon: '⚡', color: '#FF3B30' },
    { day: 'Wed', workout: 'Recovery', distance: '5 km', intensity: 'Easy', icon: '🔄', color: '#8E8E93' },
    { day: 'Thu', workout: 'Tempo Run', distance: '9 km', intensity: 'Medium', icon: '🏃', color: '#FF9500' },
    { day: 'Fri', workout: 'Rest Day', distance: 'Active recovery', intensity: 'Easy', icon: '🧘', color: '#34C759' },
    { day: 'Sat', workout: 'Long Run', distance: '18 km', intensity: 'Medium', icon: '⭐', color: '#34C759' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
  4: [
    { day: 'Mon', workout: 'Easy Run', distance: '8 km', intensity: 'Easy', icon: '😊', color: '#34C759' },
    { day: 'Tue', workout: 'Intervals', distance: '12 km', intensity: 'Hard', icon: '⚡', color: '#FF3B30' },
    { day: 'Wed', workout: 'Recovery', distance: '5 km', intensity: 'Easy', icon: '🔄', color: '#8E8E93' },
    { day: 'Thu', workout: 'Tempo Run', distance: '10 km', intensity: 'Medium', icon: '🏃', color: '#FF9500' },
    { day: 'Fri', workout: 'Rest Day', distance: 'Active recovery', intensity: 'Easy', icon: '🧘', color: '#34C759' },
    { day: 'Sat', workout: 'Long Run', distance: '20 km', intensity: 'Medium', icon: '⭐', color: '#34C759' },
    { day: 'Sun', workout: 'Rest', distance: 'Rest', intensity: 'Easy', icon: '🧘', color: '#8E8E93' },
  ],
};

export default function TrainingPlanScreen() {
  const params = useLocalSearchParams();
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isFiveKPlan, setIsFiveKPlan] = useState(false);
  const [isBeginner, setIsBeginner] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<WorkoutDay[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const isFiveK = params.isFiveKPlan === 'true';
    const beginner = params.isBeginner === 'true';
    
    setIsFiveKPlan(isFiveK);
    setIsBeginner(beginner);
    
    const plan = isFiveK ? FIVE_K_PLAN_WEEKS : CUSTOM_PLAN_WEEKS;
    setWeeklyWorkouts(plan[selectedWeek] || plan[1]);

    checkIfSaved();
  }, [params, selectedWeek]);

  const checkIfSaved = async () => {
    try {
      const savedPlan = await storage.getItem(storage.KEYS.TRAINING_PLAN);
      if (savedPlan) {
        const planData = JSON.parse(savedPlan);
        if (planData.weeklyWorkouts && planData.weeklyWorkouts.length > 0) {
          setIsSaved(true);
        }
      }
    } catch (error) {
      console.error("Error checking saved plan:", error);
    }
  };

  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'Easy': return '#34C759';
      case 'Hard': return '#FF3B30';
      case 'Medium': return '#FF9500';
      default: return '#8E8E93';
    }
  };

  const getWeekLabel = (week: number) => `Week${week}`;

  const handleWeekChange = (week: number) => {
    setSelectedWeek(week);
    const plan = isFiveKPlan ? FIVE_K_PLAN_WEEKS : CUSTOM_PLAN_WEEKS;
    setWeeklyWorkouts(plan[week] || plan[1]);
  };

  const handleSavePlan = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      const planData = {
        weeklyWorkouts,
        isFiveKPlan,
        isBeginner,
        selectedWeek,
        savedAt: new Date().toISOString(),
      };
      
      await storage.setItem(storage.KEYS.TRAINING_PLAN, JSON.stringify(planData));
      setIsSaved(true);
      
      Alert.alert(
        "✅ Plan Saved!",
        "Your training plan has been saved successfully.",
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Error saving plan:", error);
      Alert.alert("Error", "Failed to save your training plan. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ NEW: Navigate to Dashboard
  const goToDashboard = () => {
    router.replace("/(app)/dashboard");
  };

  const renderDayCard = (day: WorkoutDay, index: number) => {
    const isRestDay = day.workout === 'Rest' || day.workout === 'Rest Day';
    
    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.weekDayCard,
          isRestDay && styles.weekDayCardRest,
        ]}
        activeOpacity={0.7}
      >
        <View style={styles.weekDayHeader}>
          <Text style={styles.weekDayName}>{day.day}</Text>
          {!isRestDay && (
            <View style={[styles.intensityBadge, { backgroundColor: getIntensityColor(day.intensity) }]}>
              <Text style={styles.intensityBadgeText}>{day.intensity}</Text>
            </View>
          )}
        </View>

        <View style={styles.weekDayContent}>
          <Text style={[styles.weekDayWorkout, isRestDay && styles.weekDayWorkoutRest]}>
            {day.workout}
          </Text>
          <Text style={[styles.weekDayDistance, isRestDay && styles.weekDayDistanceRest]}>
            {day.distance}
          </Text>
        </View>

        {!isRestDay && (
          <View style={[styles.weekDayIconContainer, { backgroundColor: `${day.color}20` }]}>
            <Text style={styles.weekDayIcon}>{day.icon}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Calculate total stats
  const totalDistance = weeklyWorkouts
    .filter(w => w.distance !== 'Rest' && w.distance !== 'Active recovery')
    .reduce((sum, w) => {
      const dist = parseFloat(w.distance);
      return sum + (isNaN(dist) ? 0 : dist);
    }, 0);

  const totalWorkouts = weeklyWorkouts.filter(w => w.workout !== 'Rest' && w.workout !== 'Rest Day').length;
  const totalTime = totalDistance * 0.1;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greetingText}>🏃 Weekly Plan</Text>
              <View style={styles.headerTitleRow}>
                <Text style={styles.userName}>AI Coach</Text>
                {isFiveKPlan && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>5K Plan</Text>
                  </View>
                )}
                {isBeginner && (
                  <View style={[styles.planBadge, styles.beginnerBadge]}>
                    <Text style={styles.planBadgeText}>Beginner</Text>
                  </View>
                )}
                {isSaved && (
                  <View style={[styles.planBadge, styles.savedBadge]}>
                    <Feather name="check" size={12} color="#1A1A1A" />
                    <Text style={styles.planBadgeText}>Saved</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity 
              style={styles.profileIcon}
              onPress={() => router.push("./calendar")}
            >
              <Ionicons name="calendar-outline" size={24} color="#34C759" />
            </TouchableOpacity>
          </View>

          {(isFiveKPlan || isBeginner) && (
            <View style={styles.planInfoContainer}>
              <Text style={styles.planInfoText}>
                {isBeginner ? '🎯 Beginner 5K Training Plan - 4 Weeks' : '🎯 5K Training Plan - 4 Weeks'}
              </Text>
              <Text style={styles.planInfoSubtext}>
                {isBeginner 
                  ? 'Build up to running 5K with 3 easy runs per week. Start slow, stay consistent!' 
                  : 'Build up to running 5K with 3 runs per week'}
              </Text>
            </View>
          )}

          {/* Save Plan Button */}
          <TouchableOpacity
            style={[styles.saveButton, isSaved && styles.saveButtonSaved]}
            onPress={handleSavePlan}
            disabled={isSaving || isSaved}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#1A1A1A" />
            ) : isSaved ? (
              <>
                <Feather name="check-circle" size={18} color="#1A1A1A" />
                <Text style={styles.saveButtonText}>Plan Saved</Text>
              </>
            ) : (
              <>
                <Feather name="save" size={18} color="#1A1A1A" />
                <Text style={styles.saveButtonText}>Save Plan</Text>
              </>
            )}
          </TouchableOpacity>

          {/* ✅ NEW: Go to Dashboard Button */}
          <TouchableOpacity
            style={styles.dashboardButton}
            onPress={goToDashboard}
          >
            <Feather name="home" size={18} color="#1A1A1A" />
            <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>

        {/* Week Selector */}
        <View style={styles.weekSelector}>
          {[1, 2, 3, 4].map((week) => (
            <TouchableOpacity
              key={week}
              style={[
                styles.weekTab,
                selectedWeek === week && styles.weekTabActive,
              ]}
              onPress={() => handleWeekChange(week)}
            >
              <Text style={[
                styles.weekTabText,
                selectedWeek === week && styles.weekTabTextActive,
              ]}>
                {getWeekLabel(week)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Weekly Schedule */}
        <View style={styles.weeklySchedule}>
          <Text style={styles.sectionTitle}>
            {isFiveKPlan ? 'This Week\'s 5K Training' : 'This Week\'s Workouts'}
          </Text>
          {weeklyWorkouts.map((day, index) => renderDayCard(day, index))}
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStatsContainer}>
          <View style={styles.quickStat}>
            <Text style={styles.quickStatValue}>{totalDistance.toFixed(1)} km</Text>
            <Text style={styles.quickStatLabel}>Total Distance</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStat}>
            <Text style={styles.quickStatValue}>{totalWorkouts}</Text>
            <Text style={styles.quickStatLabel}>Workouts</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStat}>
            <Text style={styles.quickStatValue}>{totalTime.toFixed(1)} hrs</Text>
            <Text style={styles.quickStatLabel}>Total Time</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}