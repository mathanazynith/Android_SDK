import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../../constants/theme";
import {
  customWorkoutAPI,
  secondsToTimeString,
  type UserWorkoutResponse,
  type UserWorkoutSegmentResponse,
} from "../../../service/customWorkout";
import { useCustomWorkout } from "./workout-context";

const formatDuration = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  if (m > 0 && s > 0) return `${m}min ${s}s`;
  if (m > 0) return `${m} min`;
  return `${s}s`;
};

const formatDistance = (
  distInMeters?: number | null,
  displayDist?: number | null,
  unit = "km"
) => {
  if (displayDist != null && displayDist > 0) {
    return `${displayDist.toFixed(2)} ${unit}`;
  }
  if (distInMeters != null && distInMeters > 0) {
    if (distInMeters < 1000 && unit === "m") {
      return `${distInMeters} m`;
    }
    return `${(distInMeters / 1000).toFixed(2)} km`;
  }
  return "--";
};

const getTargetPace = (item: UserWorkoutResponse) => {
  const directPace = item.target_pace || item.pace;
  if (directPace && directPace !== "--:--") return directPace;

  // Search run segments
  const runSeg = item.segments?.find(
    (s) => s.segment_type === "Run" && (s.pace || s.target_pace)
  );
  if (runSeg) {
    const p = runSeg.target_pace || runSeg.pace;
    if (p) {
      const suffix = runSeg.distance_unit === "mi" ? " / mi" : " / km";
      return p.includes("/") ? p : `${p}${suffix}`;
    }
  }
  return "--:--";
};

const formatSegmentSummary = (seg: UserWorkoutSegmentResponse) => {
  const type = seg.segment_type;
  const dur = seg.duration ? formatDuration(seg.duration) : null;
  const dist =
    seg.display_distance != null && seg.display_distance > 0
      ? `${seg.display_distance} ${seg.distance_unit || "km"}`
      : seg.rep_distance != null && seg.rep_distance > 0
      ? `${seg.rep_distance} m`
      : seg.distance != null && seg.distance > 0
      ? `${seg.distance} m`
      : null;

  let main = "";
  if (dist && dur) {
    main = `${dist} in ${dur}`;
  } else if (dist) {
    main = dist;
  } else if (dur) {
    main = dur;
  } else {
    main = "Open";
  }

  const paceStr = seg.pace || seg.target_pace;
  const pacePart = paceStr ? ` @ ${paceStr}` : "";
  const repeat = seg.repeats && seg.repeats > 1 ? ` (${seg.repeats}x)` : "";
  const rest = seg.rest_duration ? ` + Rest ${formatDuration(seg.rest_duration)}` : "";

  return `${type}: ${main}${pacePart}${repeat}${rest}`;
};

export default function CustomWorkoutCards() {
  const { loadWorkout, reset } = useCustomWorkout();
  const [workouts, setWorkouts] = useState<UserWorkoutResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<{
    id: number;
    action: "edit" | "duplicate" | "delete" | "start";
  } | null>(null);

  // Handle hardware back press on Android to return to Dashboard/Home
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace("/(app)/dashboard");
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [])
  );

  const fetchWorkouts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const response = await customWorkoutAPI.list();
      const list = Array.isArray(response.data) ? response.data : [];
      setWorkouts(list);
    } catch (err: any) {
      console.error("[CustomWorkouts] Error fetching:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchWorkouts();
    }, [fetchWorkouts])
  );

  const handleStartWorkout = (workout: UserWorkoutResponse) => {
    setActionLoading({ id: workout.id, action: "start" });
    router.push({
      pathname: "/(app)/screens/map",
      params: {
        workoutTitle: workout.title || "Custom Workout",
      },
    });
    setTimeout(() => setActionLoading(null), 1000);
  };

  const handleEditWorkout = async (id: number) => {
    try {
      setActionLoading({ id, action: "edit" });
      await loadWorkout(id);
      router.push("/custom-workout/overview");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to load workout for editing.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicateWorkout = async (id: number) => {
    try {
      setActionLoading({ id, action: "duplicate" });
      await customWorkoutAPI.duplicate(id);
      await fetchWorkouts(true);
      Alert.alert("Duplicated", "Workout duplicated successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to duplicate workout.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteWorkout = (workout: UserWorkoutResponse) => {
    Alert.alert(
      "Delete Workout?",
      `Are you sure you want to delete "${workout.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading({ id: workout.id, action: "delete" });
              await customWorkoutAPI.delete(workout.id);
              await fetchWorkouts(true);
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to delete workout.");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleCreateNew = () => {
    reset();
    router.push("/custom-workout/overview");
  };

  const renderWorkoutCard = ({ item }: { item: UserWorkoutResponse }) => {
    const isEditing = actionLoading?.id === item.id && actionLoading?.action === "edit";
    const isDuplicating = actionLoading?.id === item.id && actionLoading?.action === "duplicate";
    const isDeleting = actionLoading?.id === item.id && actionLoading?.action === "delete";
    const isStarting = actionLoading?.id === item.id && actionLoading?.action === "start";
    const isAnyLoading = Boolean(actionLoading);
    const segmentCount = (item.segments || []).length;

    return (
      <View style={styles.card}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBox}>
            <View style={styles.badgeRow}>
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>CUSTOM</Text>
              </View>
              {item.workout_date ? (
                <View style={styles.dateBadge}>
                  <Feather name="calendar" size={11} color={Colors.textSecondary} />
                  <Text style={styles.dateBadgeText}>{item.workout_date}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title || "Custom Workout"}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => handleDuplicateWorkout(item.id)}
              style={styles.iconButton}
              disabled={isAnyLoading}
              accessibilityLabel="Duplicate workout"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDuplicating ? (
                <ActivityIndicator size="small" color={Colors.textSecondary} />
              ) : (
                <Feather name="copy" size={17} color={Colors.textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleEditWorkout(item.id)}
              style={styles.iconButton}
              disabled={isAnyLoading}
              accessibilityLabel="Edit workout"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isEditing ? (
                <ActivityIndicator size="small" color={Colors.primaryLight} />
              ) : (
                <Feather name="edit-3" size={17} color={Colors.primaryLight} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteWorkout(item)}
              style={styles.iconButton}
              disabled={isAnyLoading}
              accessibilityLabel="Delete workout"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FF453A" />
              ) : (
                <Feather name="trash-2" size={17} color="#FF453A" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Metrics Row */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DURATION</Text>
            <Text style={styles.metricValue}>{formatDuration(item.duration)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DISTANCE</Text>
            <Text style={styles.metricValue}>
              {formatDistance(item.distance, item.display_distance, item.distance_unit)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>TARGET PACE</Text>
            <Text style={styles.metricValue}>
              {getTargetPace(item)}
            </Text>
          </View>
        </View>

        {/* Segments Preview */}
        {segmentCount > 0 && (
          <View style={styles.segmentsContainer}>
            <Text style={styles.segmentsHeader}>
              {segmentCount} {segmentCount === 1 ? "SEGMENT" : "SEGMENTS"}
            </Text>
            <View style={styles.segmentsPillsRow}>
              {item.segments.map((seg, idx) => (
                <View
                  key={seg.id || idx}
                  style={[
                    styles.segmentPill,
                    seg.segment_type === "Warmup"
                      ? styles.warmupPill
                      : seg.segment_type === "Cooldown"
                      ? styles.cooldownPill
                      : styles.runPill,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentPillText,
                      seg.segment_type === "Warmup"
                        ? styles.warmupPillText
                        : seg.segment_type === "Cooldown"
                        ? styles.cooldownPillText
                        : styles.runPillText,
                    ]}
                    numberOfLines={1}
                  >
                    {formatSegmentSummary(seg)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes if any */}
        {item.notes ? (
          <Text style={styles.cardNotes} numberOfLines={2}>
            📝 {item.notes}
          </Text>
        ) : null}

        {/* Start Workout Button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => handleStartWorkout(item)}
          disabled={isAnyLoading}
          activeOpacity={0.85}
        >
          {isStarting ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <>
              <Feather name="play" size={18} color="#000000" />
              <Text style={styles.startButtonText}>START WORKOUT</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Top App Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/(app)/dashboard")}
          style={styles.homeButton}
          accessibilityLabel="Return to Home"
        >
          <Feather name="home" size={24} color={Colors.text} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>My Workouts</Text>

        <TouchableOpacity
          onPress={handleCreateNew}
          style={styles.newButton}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color="#000000" />
          <Text style={styles.newButtonText}>NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Content Body */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading your workouts...</Text>
        </View>
      ) : workouts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="activity" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No Custom Workouts Yet</Text>
          <Text style={styles.emptySubtitle}>
            Build your personalized running plan with custom warmups, interval runs, and cooldowns.
          </Text>
          <TouchableOpacity
            style={styles.createFirstButton}
            onPress={handleCreateNew}
            activeOpacity={0.85}
          >
            <Feather name="plus-circle" size={20} color="#000000" />
            <Text style={styles.createFirstButtonText}>CREATE FIRST WORKOUT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderWorkoutCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchWorkouts(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  homeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1C1E",
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  newButtonText: {
    color: "#000000",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 15 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#1C1C1E",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  createFirstButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  createFirstButtonText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: "#1C1C1E",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitleBox: { flex: 1, marginRight: 10 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  customBadge: {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
  },
  customBadgeText: {
    color: Colors.primaryLight,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2A2A2D",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateBadgeText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "500" },
  cardTitle: { color: Colors.text, fontSize: 19, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#2A2A2D",
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#252528",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  metricItem: { alignItems: "center", flex: 1 },
  metricDivider: { width: 1, height: 24, backgroundColor: "#3A3A3D" },
  metricLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metricValue: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  segmentsContainer: { marginBottom: 14 },
  segmentsHeader: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  segmentsPillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segmentPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  warmupPill: {
    backgroundColor: "rgba(255, 59, 48, 0.12)",
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  warmupPillText: { color: "#FF6961", fontSize: 12, fontWeight: "600" },
  runPill: {
    backgroundColor: "rgba(10, 132, 255, 0.12)",
    borderColor: "rgba(10, 132, 255, 0.3)",
  },
  runPillText: { color: "#5AC8FA", fontSize: 12, fontWeight: "600" },
  cooldownPill: {
    backgroundColor: "rgba(48, 209, 88, 0.12)",
    borderColor: "rgba(48, 209, 88, 0.3)",
  },
  cooldownPillText: { color: "#30D158", fontSize: 12, fontWeight: "600" },
  segmentPillText: { fontSize: 12, fontWeight: "600" },
  cardNotes: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  startButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
  },
  startButtonText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});

