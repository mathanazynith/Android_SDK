import { Alert } from '@/components/ThemedAlert';
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  LayoutAnimation,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BenchmarkBadgeIcon from "../../../components/BenchmarkBadgeIcon";
import { Colors } from "../../../constants/theme";
import { getBackendErrorMessage } from "../../../service/api";
import {
  customWorkoutAPI,
  type UserWorkoutResponse,
  type UserWorkoutSegmentResponse,
} from "../../../service/customWorkout";
import { BenchmarkStore } from "../../../src/services/benchmarkStore";
import { buildWorkoutExecutionPlan } from "../../../src/utils/workoutPlanBuilder";
import { useCustomWorkout } from "./workout-context";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

export default function CustomWorkoutCards() {
  const { loadWorkout, reset } = useCustomWorkout();
  const [workouts, setWorkouts] = useState<UserWorkoutResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<{
    id: number;
    action: "edit" | "start";
  } | null>(null);
  const [benchmarkIds, setBenchmarkIds] = useState<number[]>([]);

  // Selection & Bulk Delete state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedWorkoutIds, setSelectedWorkoutIds] = useState<Set<number>>(() => new Set());
  const [deletingWorkoutIds, setDeletingWorkoutIds] = useState<Set<number>>(() => new Set());
  const [isDeletingWorkouts, setIsDeletingWorkouts] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [selectionToast, setSelectionToast] = useState<string | null>(null);

  // Animations
  const selectionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteButtonStateProgress] = useState(() => new Animated.Value(0));
  const [deleteTrayOpacity] = useState(() => new Animated.Value(0));
  const [deleteTrayTranslateY] = useState(() => new Animated.Value(24));
  const [deleteSuccessScale] = useState(() => new Animated.Value(0.65));

  const showSelectionToast = useCallback((message: string) => {
    if (selectionToastTimerRef.current) clearTimeout(selectionToastTimerRef.current);
    setSelectionToast(message);
    selectionToastTimerRef.current = setTimeout(() => {
      setSelectionToast(null);
      selectionToastTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => () => {
    if (selectionToastTimerRef.current) clearTimeout(selectionToastTimerRef.current);
    if (deleteSuccessTimerRef.current) clearTimeout(deleteSuccessTimerRef.current);
  }, []);

  useEffect(() => {
    const enabled = selectedWorkoutIds.size > 0 || deleteSuccess;
    const targetState = deleteSuccess ? 0.55 : enabled ? 0.55 : 0;
    Animated.timing(deleteButtonStateProgress, {
      toValue: targetState,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [deleteButtonStateProgress, deleteSuccess, selectedWorkoutIds.size]);

  useEffect(() => {
    if (selectionMode) {
      deleteTrayOpacity.setValue(0);
      deleteTrayTranslateY.setValue(24);
      Animated.parallel([
        Animated.timing(deleteTrayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.spring(deleteTrayTranslateY, {
          toValue: 0,
          damping: 16,
          stiffness: 180,
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(deleteTrayOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(deleteTrayTranslateY, {
        toValue: 24,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [deleteTrayOpacity, deleteTrayTranslateY, selectionMode]);

  useEffect(() => {
    Animated.spring(deleteSuccessScale, {
      toValue: deleteSuccess ? 1 : 0.65,
      damping: 14,
      stiffness: 220,
      useNativeDriver: false,
    }).start();
  }, [deleteSuccess, deleteSuccessScale]);

  useFocusEffect(
    useCallback(() => {
      BenchmarkStore.getBenchmarkIds().then(setBenchmarkIds);
      const unsub = BenchmarkStore.subscribe(setBenchmarkIds);
      return () => unsub();
    }, [])
  );

  const handleToggleBenchmark = async (id: number, title?: string) => {
    const currentWorkout = workouts.find((w) => w.id === id);
    const currentlyBenchmark = Boolean(currentWorkout?.is_benchmark ?? benchmarkIds.includes(id));
    const nextState = !currentlyBenchmark;

    // Optimistically update state
    setWorkouts((prev) =>
      prev.map((w) => (w.id === id ? { ...w, is_benchmark: nextState } : w))
    );
    setBenchmarkIds((prev) =>
      nextState ? [...prev, id] : prev.filter((item) => item !== id)
    );

    // Call backend API to persist is_benchmark in workouts table
    try {
      await customWorkoutAPI.setBenchmark(id, nextState);
    } catch (err) {
      console.warn("Failed to persist is_benchmark to backend:", err);
    }

    // Sync with local store
    await BenchmarkStore.setBenchmark(id, nextState);

    Alert.alert(
      nextState ? "Marked as Benchmark" : "Benchmark Removed",
      nextState
        ? `"${title || "Workout"}" is now set as a Benchmark Workout in Statistics.`
        : `"${title || "Workout"}" removed from Benchmark Workouts in Statistics.`
    );
  };

  const toggleWorkoutSelection = useCallback((workoutId: number) => {
    if (Platform.OS === "android") {
      Vibration.vibrate(20);
    } else {
      void Haptics.selectionAsync().catch(() => {});
    }
    setSelectedWorkoutIds((current) => {
      const next = new Set(current);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  }, []);

  const startWorkoutSelection = useCallback((workoutId: number) => {
    if (Platform.OS === "android") {
      Vibration.vibrate(35);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectionMode(true);
    setSelectedWorkoutIds((current) => new Set(current).add(workoutId));
  }, []);

  const cancelWorkoutSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectionMode(false);
    setSelectedWorkoutIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (workouts.length === 0) return;
    const allIds = workouts.map((w) => w.id);
    setSelectedWorkoutIds((current) => {
      if (allIds.every((id) => current.has(id))) return new Set();
      return new Set(allIds);
    });
  }, [workouts]);

  // Handle hardware back press on Android
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectionMode) {
          cancelWorkoutSelection();
          return true;
        }
        router.replace("/(app)/dashboard");
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [selectionMode, cancelWorkoutSelection])
  );

  const fetchWorkouts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const response = await customWorkoutAPI.list();
      const list: UserWorkoutResponse[] = Array.isArray(response.data)
        ? response.data
        : ((response.data as any)?.results || []);
      // Filter only custom workouts (is_custom !== false and plan == null)
      setWorkouts(list.filter((w) => w.is_custom !== false && w.plan == null));
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
    const plan = buildWorkoutExecutionPlan(workout);
    router.push({
      pathname: "/(app)/screens/map",
      params: {
        workoutTitle: workout.title || "Custom Workout",
        workoutPlan: JSON.stringify(plan),
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

  const handleCreateNew = () => {
    reset();
    router.push("/custom-workout/overview");
  };

  const deleteSelectedWorkouts = useCallback(
    async (targets: UserWorkoutResponse[]) => {
      if (targets.length === 0 || isDeletingWorkouts) return;

      if (deleteSuccessTimerRef.current) {
        clearTimeout(deleteSuccessTimerRef.current);
        deleteSuccessTimerRef.current = null;
      }
      setDeleteSuccess(false);

      const targetIds = targets.map((w) => w.id);
      setIsDeletingWorkouts(true);
      setDeletingWorkoutIds(new Set(targetIds));

      try {
        // 1. Call custom workout bulk-delete API
        await customWorkoutAPI.bulkDelete(targetIds);

        // 2. Feedback
        if (Platform.OS === "android") {
          Vibration.vibrate([0, 35, 45, 35]);
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => {}
          );
        }

        setDeleteSuccess(true);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setWorkouts((prev) => prev.filter((w) => !targetIds.includes(w.id)));

        for (const id of targetIds) {
          void BenchmarkStore.setBenchmark(id, false);
        }
        setBenchmarkIds((prev) => prev.filter((id) => !targetIds.includes(id)));

        showSelectionToast(
          targetIds.length === 1 ? "Workout deleted." : `${targetIds.length} workouts deleted.`
        );

        deleteSuccessTimerRef.current = setTimeout(() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSelectionMode(false);
          setSelectedWorkoutIds(new Set());
          setDeletingWorkoutIds(new Set());
          setDeleteSuccess(false);
          setIsDeletingWorkouts(false);
          deleteSuccessTimerRef.current = null;
        }, 620);
      } catch (err: any) {
        // Fallback: If bulk delete endpoint returns an error, fallback to individual deletes
        console.warn(
          "[CustomWorkouts] Bulk delete endpoint error, attempting individual delete fallback:",
          err
        );
        try {
          const results = await Promise.allSettled(
            targetIds.map((id) => customWorkoutAPI.delete(id))
          );
          const deletedIds = targetIds.filter((_, idx) => results[idx].status === "fulfilled");

          if (deletedIds.length > 0) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setWorkouts((prev) => prev.filter((w) => !deletedIds.includes(w.id)));
            for (const id of deletedIds) {
              void BenchmarkStore.setBenchmark(id, false);
            }
            setBenchmarkIds((prev) => prev.filter((id) => !deletedIds.includes(id)));
            setSelectedWorkoutIds((prev) => {
              const next = new Set(prev);
              deletedIds.forEach((id) => next.delete(id));
              return next;
            });
          }

          if (deletedIds.length === targetIds.length) {
            setDeleteSuccess(true);
            showSelectionToast(
              targetIds.length === 1 ? "Workout deleted." : `${targetIds.length} workouts deleted.`
            );
            deleteSuccessTimerRef.current = setTimeout(() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setSelectionMode(false);
              setSelectedWorkoutIds(new Set());
              setDeleteSuccess(false);
              setIsDeletingWorkouts(false);
              deleteSuccessTimerRef.current = null;
            }, 620);
            return;
          }

          Alert.alert(
            "Could not delete some workouts",
            getBackendErrorMessage(err, "Please try again.")
          );
        } catch (fallbackErr: any) {
          Alert.alert(
            "Could not delete workouts",
            getBackendErrorMessage(err || fallbackErr, "Please try again.")
          );
        } finally {
          setIsDeletingWorkouts(false);
          setDeletingWorkoutIds(new Set());
        }
      }
    },
    [isDeletingWorkouts, showSelectionToast]
  );

  const confirmDeleteSelected = useCallback(() => {
    if (selectedWorkoutIds.size === 0) {
      showSelectionToast("Please select at least one workout to delete.");
      return;
    }
    const count = selectedWorkoutIds.size;
    Alert.alert(
      count === 1 ? "Delete workout?" : "Delete selected workouts?",
      count === 1
        ? "Delete this custom workout? This cannot be undone."
        : `Delete ${count} custom workouts? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const targets = workouts.filter((w) => selectedWorkoutIds.has(w.id));
            void deleteSelectedWorkouts(targets);
          },
        },
      ],
      { cancelable: true }
    );
  }, [deleteSelectedWorkouts, selectedWorkoutIds, showSelectionToast, workouts]);

  const renderWorkoutCard = ({ item }: { item: UserWorkoutResponse }) => {
    const isEditing = actionLoading?.id === item.id && actionLoading?.action === "edit";
    const isStarting = actionLoading?.id === item.id && actionLoading?.action === "start";
    const isAnyLoading = Boolean(actionLoading);
    const isBenchmark = Boolean(item.is_benchmark ?? benchmarkIds.includes(item.id));
    const isSelected = selectedWorkoutIds.has(item.id);
    const isDeleting = deletingWorkoutIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isSelected && styles.cardSelected,
        ]}
        activeOpacity={0.9}
        onLongPress={() => {
          if (!selectionMode) {
            startWorkoutSelection(item.id);
          }
        }}
        onPress={() => {
          if (selectionMode) {
            toggleWorkoutSelection(item.id);
          } else {
            handleEditWorkout(item.id);
          }
        }}
        disabled={isAnyLoading}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBox}>
            <View style={styles.badgeRow}>
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>CUSTOM</Text>
              </View>
              {isBenchmark ? (
                <View style={styles.benchmarkBadge}>
                  <BenchmarkBadgeIcon size={12} color="#30D158" />
                  <Text style={styles.benchmarkBadgeText}>BENCHMARK</Text>
                </View>
              ) : null}
              {item.workout_date ? (
                <View style={styles.dateBadge}>
                  <Feather name="calendar" size={11} color={Colors.primaryLight} />
                  <Text style={styles.dateBadgeText}>{item.workout_date}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title || "Custom Workout"}
            </Text>
          </View>

          {selectionMode ? (
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${item.title || "workout"}`}
              onPress={(e) => {
                e.stopPropagation();
                toggleWorkoutSelection(item.id);
              }}
              style={[styles.cardCheckbox, isSelected && styles.cardCheckboxSelected]}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FF6B6B" />
              ) : (
                <Feather
                  name={isSelected ? "check-square" : "square"}
                  size={20}
                  color={isSelected ? "#30D158" : "#FFFFFF"}
                />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.cardHeaderRight}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleBenchmark(item.id, item.title);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.cardBenchmarkBtn}
                accessibilityLabel={isBenchmark ? "Remove from benchmark" : "Set as benchmark"}
              >
                <BenchmarkBadgeIcon
                  size={18}
                  color={isBenchmark ? "#30D158" : "#8E8E93"}
                />
              </TouchableOpacity>

              {isEditing ? (
                <ActivityIndicator size="small" color={Colors.primaryLight} />
              ) : (
                <Feather name="chevron-right" size={20} color={Colors.textSecondary} />
              )}
            </View>
          )}
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
            <Text style={styles.metricValue}>{getTargetPace(item)}</Text>
          </View>
        </View>

        {/* Notes if any */}
        {item.notes ? (
          <Text style={styles.cardNotes} numberOfLines={2}>
            📝 {item.notes}
          </Text>
        ) : null}

        {/* Tap to Edit Hint & Start Workout Button */}
        <View style={styles.cardFooter}>
          <View style={styles.editHintRow}>
            <Feather
              name={selectionMode ? "check-circle" : "edit-3"}
              size={13}
              color={selectionMode ? "#30D158" : Colors.textMuted}
            />
            <Text style={[styles.editHintText, selectionMode && { color: "#30D158" }]}>
              {selectionMode
                ? isSelected
                  ? "Selected for deletion"
                  : "Tap card to select"
                : "Tap card to view & edit"}
            </Text>
          </View>

          {!selectionMode && (
            <TouchableOpacity
              style={styles.startButton}
              onPress={(e) => {
                e.stopPropagation();
                handleStartWorkout(item);
              }}
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
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Top App Header or Selection Toolbar */}
      {selectionMode ? (
        <View style={styles.selectionToolbar}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            disabled={isDeletingWorkouts}
            onPress={cancelWorkoutSelection}
            style={styles.cancelSelectionButton}
          >
            <Feather name="x" size={20} color="#E53935" />
          </TouchableOpacity>

          <Text style={styles.selectionCount}>
            {selectedWorkoutIds.size} selected
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            disabled={isDeletingWorkouts || workouts.length === 0}
            onPress={toggleSelectAll}
            style={styles.selectAllButton}
          >
            <Text style={styles.selectAllButtonText}>
              {workouts.length > 0 && workouts.every((w) => selectedWorkoutIds.has(w.id))
                ? "Deselect all"
                : "Select all"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/dashboard")}
            style={styles.homeButton}
            accessibilityLabel="Return to Home"
          >
            <Feather name="home" size={24} color={Colors.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>My Workouts</Text>

          <View style={styles.headerRightButtons}>
            {workouts.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSelectionMode(true);
                }}
                style={styles.selectModeButton}
                accessibilityLabel="Select workouts"
              >
                <Feather name="check-square" size={18} color={Colors.text} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleCreateNew}
              style={styles.newButton}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={18} color="#000000" />
              <Text style={styles.newButtonText}>NEW</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          contentContainerStyle={[
            styles.listContent,
            selectionMode && styles.listContentWithDeleteTray,
          ]}
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

      {/* Floating Bottom Delete Tray */}
      <Animated.View
        pointerEvents={selectionMode ? "auto" : "none"}
        style={[
          styles.deleteTray,
          {
            opacity: deleteTrayOpacity,
            transform: [{ translateY: deleteTrayTranslateY }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.deleteButton,
            {
              backgroundColor: deleteButtonStateProgress.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: ["#737373", "#E53935", "#B91C1C"],
              }),
              borderColor: deleteButtonStateProgress.interpolate({
                inputRange: [0, 0.55, 1],
                outputRange: ["#737373", "#E53935", "#FFFFFF"],
              }),
              opacity: deleteButtonStateProgress.interpolate({
                inputRange: [0, 0.55],
                outputRange: [0.62, 1],
                extrapolate: "clamp",
              }),
            },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              deleteSuccess
                ? "Workouts deleted successfully"
                : selectedWorkoutIds.size > 0
                ? `Delete ${selectedWorkoutIds.size} selected workouts`
                : "Delete disabled: no workouts selected"
            }
            disabled={!selectionMode || isDeletingWorkouts || deleteSuccess || selectedWorkoutIds.size === 0}
            onPress={() => void confirmDeleteSelected()}
            style={styles.deleteButtonAction}
          >
            {deleteSuccess ? (
              <Animated.View
                style={{
                  opacity: deleteSuccessScale,
                  transform: [{ scale: deleteSuccessScale }],
                }}
              >
                <Feather name="check-circle" size={22} color="#FFFFFF" />
              </Animated.View>
            ) : isDeletingWorkouts ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="trash-2" size={22} color="#FFFFFF" />
            )}
            <Text style={styles.deleteButtonText}>
              {deleteSuccess
                ? "Deleted"
                : isDeletingWorkouts
                ? "Deleting…"
                : `Delete selected · ${selectedWorkoutIds.size}`}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Selection Toast */}
      {selectionToast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{selectionToast}</Text>
        </View>
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
  selectionToolbar: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  cancelSelectionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229, 57, 53, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(229, 57, 53, 0.35)",
  },
  selectionCount: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  selectAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#333336",
  },
  selectAllButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
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
  headerRightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectModeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#2C2C2E",
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
  listContentWithDeleteTray: {
    paddingBottom: 110,
  },
  card: {
    backgroundColor: "#1C1C1E",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: "#2C2C2E",
  },
  cardSelected: {
    backgroundColor: "#142519",
    borderColor: "#30D158",
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
  benchmarkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(48, 209, 88, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(48, 209, 88, 0.35)",
  },
  benchmarkBadgeText: {
    color: "#30D158",
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
  dateBadgeText: { color: Colors.primaryLight, fontSize: 11, fontWeight: "600" },
  cardTitle: { color: Colors.text, fontSize: 19, fontWeight: "700" },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
  },
  cardBenchmarkBtn: {
    padding: 6,
    marginRight: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  cardCheckbox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  cardCheckboxSelected: {
    backgroundColor: "#132E1D",
    borderColor: "#30D158",
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
  cardNotes: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  cardFooter: {
    gap: 10,
  },
  editHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 2,
  },
  editHintText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
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
  deleteTray: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
    zIndex: 30,
    alignItems: "center",
  },
  deleteButton: {
    minWidth: 200,
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: "#E53935",
    borderWidth: 2,
    borderColor: "#E53935",
    elevation: 10,
    shadowColor: "#E53935",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  deleteButtonAction: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    borderRadius: 26,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    bottom: 96,
    maxWidth: "90%",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "#252A27",
    borderWidth: 1,
    borderColor: "#3C4B3F",
    zIndex: 40,
  },
  toastText: {
    color: "#F7F7F7",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
