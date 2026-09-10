import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { customWorkoutAPI } from '../../service/customWorkout';
import { activityAPI, BackendActivity } from '../../src/services/activityApi';
import ActivityStore from '../../src/services/activityStore';
import {
  AggregatedStats,
  calculatePeriodStats,
  calculateWeekCompletion,
  calculateYearStats,
  ChartBarPoint,
  formatKm,
  formatPaceMinutes,
  formatTimeHoursMins,
  getAvailableYears,
  normalizeActivities,
  PeriodFilter,
  UnifiedActivity,
} from '../../src/utils/statsCalculations';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const [activities, setActivities] = useState<UnifiedActivity[]>([]);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  const [benchmarkCount, setBenchmarkCount] = useState(3);

  const loadActivities = useCallback(async () => {
    try {
      let backendList: BackendActivity[] = [];
      try {
        backendList = await activityAPI.list();
      } catch (err) {
        console.warn('Could not fetch backend activities for stats:', err);
      }

      const localList = ActivityStore.list();
      const unified = normalizeActivities(backendList, localList);
      setActivities(unified);

      try {
        const customRes = await customWorkoutAPI.list();
        const customList = customRes.data || [];
        if (Array.isArray(customList) && customList.length > 0) {
          setBenchmarkCount(customList.length);
        } else {
          setBenchmarkCount(3);
        }
      } catch {
        setBenchmarkCount(3);
      }
    } catch (e) {
      console.warn('Error loading stats activities:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [loadActivities])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActivities();
  }, [loadActivities]);

  // Aggregate stats based on active period and selectedYear
  const stats: AggregatedStats = useMemo(() => {
    return calculatePeriodStats(activities, period, selectedYear);
  }, [activities, period, selectedYear]);

  // Available years from recorded activities
  const availableYears = useMemo(() => {
    return getAvailableYears(activities);
  }, [activities]);

  // Stats for the selected calendar year (Summary List Card)
  const yearStats = useMemo(() => {
    return calculateYearStats(activities, selectedYear);
  }, [activities, selectedYear]);

  // Stats for the current week (This Week Completion Card)
  const weekCompletion = useMemo(() => {
    return calculateWeekCompletion(activities);
  }, [activities]);

  // Active selected chart point (or current/latest active point by default)
  const activePoint: ChartBarPoint | null = useMemo(() => {
    if (!stats.chartData.length) return null;
    if (selectedPointKey) {
      const found = stats.chartData.find((p) => p.key === selectedPointKey);
      if (found) return found;
    }
    const current = stats.chartData.find((p) => p.isCurrent && p.value > 0);
    if (current) return current;
    const lastActive = [...stats.chartData].reverse().find((p) => p.value > 0);
    return lastActive || stats.chartData[0];
  }, [stats.chartData, selectedPointKey]);

  const periodLabels: { id: PeriodFilter; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All Time' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Screen Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Statistics</Text>
          <Text style={styles.headerSubtitle}>
            {stats.totalWorkouts > 0
              ? `${stats.totalWorkouts} activities recorded`
              : 'Track your running performance'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          disabled={loading || refreshing}
          accessibilityLabel="Refresh Statistics"
        >
          {loading || refreshing ? (
            <ActivityIndicator size="small" color="#30D158" />
          ) : (
            <Feather name="rotate-cw" size={18} color="#8E8E93" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#30D158"
            colors={['#30D158']}
          />
        }
      >
        {/* 1. Year Selector Pill */}
        <TouchableOpacity
          style={styles.yearPill}
          onPress={() => setShowYearModal(true)}
          activeOpacity={0.8}
          accessibilityLabel={`Select Year, currently ${selectedYear}`}
        >
          <Text style={styles.yearPillLabel}>Year</Text>
          <View style={styles.yearPillValueRow}>
            <Text style={styles.yearPillValue}>{selectedYear}</Text>
            <Feather name="chevron-down" size={16} color="#8E8E93" style={{ marginLeft: 6 }} />
          </View>
        </TouchableOpacity>

        {/* 2. Benchmark Workouts Card */}
        <TouchableOpacity
          style={styles.benchmarkCard}
          onPress={() => setShowBenchmarkModal(true)}
          activeOpacity={0.8}
          accessibilityLabel="Benchmark workouts"
        >
          <View style={styles.benchmarkLeft}>
            <View style={styles.benchmarkIconWrapper}>
              <Feather name="trending-up" size={24} color="#30D158" />
            </View>
            <View style={styles.benchmarkTextCol}>
              <Text style={styles.benchmarkTitle}>Benchmark workouts</Text>
              <Text style={styles.benchmarkSubtitle}>{benchmarkCount} saved</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color="#8E8E93" />
        </TouchableOpacity>

        {/* 2. This Week Completion Card */}
        <View style={styles.weekCompletionWrapper}>
          <View style={styles.weekCompletionCard}>
            <Text style={styles.weekCompletionTitle}>This Week Completion</Text>
            <Text style={styles.weekCompletionCount}>
              {weekCompletion.workouts} {weekCompletion.workouts === 1 ? 'workout' : 'workouts'} completed
            </Text>
            <Text style={styles.weekCompletionDistance}>
              {weekCompletion.distanceKm.toFixed(1)} km completed
            </Text>
          </View>
        </View>

        {/* Section Header: Trends & Detailed Visualizations */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Performance Trends & Charts</Text>
        </View>

        {/* Period Selector Tabs */}
        <View style={styles.periodTabsContainer}>
          {periodLabels.map((tab) => {
            const active = period === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.periodTab, active && styles.periodTabActive]}
                onPress={() => {
                  setPeriod(tab.id);
                  setSelectedPointKey(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.periodTabText, active && styles.periodTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Hero Interactive Distance & Bar Chart Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroLabel}>
                {period === 'week'
                  ? 'DISTANCE THIS WEEK'
                  : period === 'month'
                  ? 'DISTANCE THIS MONTH'
                  : period === 'year'
                  ? 'DISTANCE THIS YEAR'
                  : 'TOTAL DISTANCE'}
              </Text>
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>
                  {stats.totalDistanceKm.toFixed(1)}
                </Text>
                <Text style={styles.heroUnit}>km</Text>
              </View>
            </View>

            {/* Streak & Consistency Badge */}
            <View style={styles.streakBadge}>
              <Feather name="zap" size={14} color="#30D158" />
              <Text style={styles.streakText}>
                {stats.streakDays > 0 ? `${stats.streakDays} Day Streak` : `${stats.activeDaysCount} Days Active`}
              </Text>
            </View>
          </View>

          {/* Point Tooltip */}
          {activePoint && activePoint.value > 0 ? (
            <View style={styles.tooltipBox}>
              <View style={styles.tooltipLeft}>
                <Text style={styles.tooltipTitle}>{activePoint.fullLabel}</Text>
                <Text style={styles.tooltipSub}>
                  {activePoint.workoutCount} {activePoint.workoutCount === 1 ? 'activity' : 'activities'}
                </Text>
              </View>
              <View style={styles.tooltipRight}>
                <Text style={styles.tooltipValue}>{activePoint.value.toFixed(2)} km</Text>
                <Text style={styles.tooltipPace}>
                  {formatPaceMinutes(activePoint.paceSecondsPerKm)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.tooltipBoxPlaceholder}>
              <Text style={styles.tooltipHint}>
                {stats.totalDistanceKm > 0
                  ? 'Tap any bar below to view details'
                  : 'No activities recorded in this period'}
              </Text>
            </View>
          )}

          {/* Interactive Native Bar Chart */}
          <View style={styles.chartArea}>
            <View style={styles.barsRow}>
              {stats.chartData.map((bar) => {
                const isSelected = activePoint?.key === bar.key;
                const ratio = stats.chartMax > 0 ? bar.value / stats.chartMax : 0;
                const barHeight = bar.value > 0 ? Math.max(8, Math.round(ratio * 125)) : 4;

                return (
                  <TouchableOpacity
                    key={bar.key}
                    style={styles.barColumn}
                    onPress={() => setSelectedPointKey(bar.key)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: barHeight,
                            backgroundColor: isSelected
                              ? '#30D158'
                              : bar.value > 0
                              ? '#0A84FF'
                              : '#2A2A2E',
                            opacity: bar.value === 0 ? 0.35 : 1,
                          },
                        ]}
                      >
                        {bar.value > 0 && (
                          <LinearGradient
                            colors={
                              isSelected
                                ? ['#30D158', '#28CD41']
                                : ['#388BFF', '#0A84FF']
                            }
                            style={StyleSheet.absoluteFill}
                          />
                        )}
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.barLabel,
                        bar.isCurrent && styles.barLabelCurrent,
                        isSelected && styles.barLabelSelected,
                      ]}
                    >
                      {bar.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Key Running Metrics Grid (2 x 3) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Overview Metrics ({selectedYear})</Text>
          <Text style={styles.sectionSubBadge}>
            {yearStats.totalWorkouts > 0 ? `${yearStats.totalWorkouts} activities` : '0 activities'}
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          {/* 1. Runs */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
              <MaterialCommunityIcons name="run" size={20} color="#30D158" />
            </View>
            <Text style={styles.metricCardValue}>{yearStats.runs}</Text>
            <Text style={styles.metricCardLabel}>Runs</Text>
          </View>

          {/* 2. Distance */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
              <Feather name="navigation" size={18} color="#30D158" />
            </View>
            <Text style={styles.metricCardValue}>{yearStats.distanceKm.toFixed(1)} km</Text>
            <Text style={styles.metricCardLabel}>Distance</Text>
          </View>

          {/* 3. Calories */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(255, 159, 10, 0.15)' }]}>
              <Ionicons name="flame" size={20} color="#FF9F0A" />
            </View>
            <Text style={styles.metricCardValue}>
              {yearStats.calories > 0 ? `${yearStats.calories.toLocaleString()} kcal` : '0 kcal'}
            </Text>
            <Text style={styles.metricCardLabel}>Calories</Text>
          </View>

          {/* 4. Average Pace */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
              <Ionicons name="speedometer-outline" size={19} color="#30D158" />
            </View>
            <Text style={styles.metricCardValue}>
              {formatPaceMinutes(yearStats.avgPaceSeconds)}
            </Text>
            <Text style={styles.metricCardLabel}>Avg Pace</Text>
          </View>

          {/* 5. Active Time */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(10, 132, 255, 0.15)' }]}>
              <Feather name="clock" size={18} color="#0A84FF" />
            </View>
            <Text style={styles.metricCardValue}>
              {formatTimeHoursMins(yearStats.totalDurationSeconds)}
            </Text>
            <Text style={styles.metricCardLabel}>Active Time</Text>
          </View>

          {/* 6. Total Workouts */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(191, 90, 242, 0.15)' }]}>
              <Feather name="award" size={18} color="#BF5AF2" />
            </View>
            <Text style={styles.metricCardValue}>
              {yearStats.totalWorkouts}
            </Text>
            <Text style={styles.metricCardLabel}>Workouts</Text>
          </View>
        </View>

        {/* Activity Distribution: Runs vs Walks */}
        {stats.totalWorkouts > 0 && (
          <View style={styles.cardContainer}>
            <View style={styles.splitHeader}>
              <Text style={styles.cardTitle}>Activity Breakdown</Text>
              <Text style={styles.splitSubtext}>
                {stats.runCount} Runs · {stats.walkCount} Walks
              </Text>
            </View>

            <View style={styles.splitBarTrack}>
              <View
                style={[
                  styles.splitBarFill,
                  {
                    flex: Math.max(stats.runCount, 0.05),
                    backgroundColor: '#0A84FF',
                  },
                ]}
              />
              <View
                style={[
                  styles.splitBarFill,
                  {
                    flex: Math.max(stats.walkCount, 0.05),
                    backgroundColor: '#30D158',
                  },
                ]}
              />
            </View>

            <View style={styles.splitLegendRow}>
              <View style={styles.splitLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#0A84FF' }]} />
                <Text style={styles.legendText}>
                  Runs ({stats.totalWorkouts > 0 ? Math.round((stats.runCount / stats.totalWorkouts) * 100) : 0}%)
                </Text>
              </View>

              <View style={styles.splitLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#30D158' }]} />
                <Text style={styles.legendText}>
                  Walks ({stats.totalWorkouts > 0 ? Math.round((stats.walkCount / stats.totalWorkouts) * 100) : 0}%)
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Personal Bests & Milestones */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>All-Time Personal Records</Text>
        </View>

        <View style={styles.bestsGrid}>
          {/* Longest Distance */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>🥇</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Longest Run</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.longestDistanceKm > 0
                  ? formatKm(stats.personalBests.longestDistanceKm)
                  : '--'}
              </Text>
            </View>
          </View>

          {/* Fastest Pace */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>⚡</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Fastest Pace</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.fastestPaceSeconds > 0
                  ? formatPaceMinutes(stats.personalBests.fastestPaceSeconds)
                  : '--'}
              </Text>
            </View>
          </View>

          {/* Longest Duration */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>⏳</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Longest Time</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.longestDurationSeconds > 0
                  ? formatTimeHoursMins(stats.personalBests.longestDurationSeconds)
                  : '--'}
              </Text>
            </View>
          </View>

          {/* Max Calories */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>🔥</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Max Burn</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.maxCalories > 0
                  ? `${stats.personalBests.maxCalories} kcal`
                  : '--'}
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Workouts Shortcut */}
        {activities.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Activities</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/activity')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            {activities.slice(0, 3).map((act) => (
              <TouchableOpacity
                key={act.id}
                style={styles.recentCard}
                onPress={() => router.push(`/(app)/activity/${act.id}`)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.recentBar,
                    { backgroundColor: act.activityType === 'RUN' ? '#0A84FF' : '#30D158' },
                  ]}
                />
                <View style={styles.recentContent}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentTitle}>
                      {act.activityType === 'RUN' ? 'Run' : 'Walk'}
                    </Text>
                    <Text style={styles.recentDate}>
                      {act.date.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>

                  <View style={styles.recentMetrics}>
                    <Text style={styles.recentDist}>{formatKm(act.distanceKm)}</Text>
                    <Text style={styles.recentMeta}>
                      {formatTimeHoursMins(act.durationSeconds)} · {formatPaceMinutes(act.paceSecondsPerKm)}
                    </Text>
                  </View>

                  <Feather name="chevron-right" size={16} color="#8E8E93" style={{ marginLeft: 8 }} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Empty State */}
        {activities.length === 0 && !loading && (
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyIconCircle}>
              <Feather name="bar-chart-2" size={32} color="#30D158" />
            </View>
            <Text style={styles.emptyStateTitle}>Start Your Running Journey</Text>
            <Text style={styles.emptyStateSubtext}>
              Once you start recording workouts or outdoor runs, detailed pace trends, weekly graphs, and personal bests will automatically appear here.
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => router.replace('/(app)/dashboard')}
              activeOpacity={0.85}
            >
              <Feather name="play" size={16} color="#000000" />
              <Text style={styles.emptyStateButtonText}>Start a Run</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom padding for floating navigation */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Year Picker Modal */}
      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowYearModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Year</Text>
              <TouchableOpacity
                onPress={() => setShowYearModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {availableYears.map((yr) => (
              <TouchableOpacity
                key={yr}
                style={[styles.modalItemRow, selectedYear === yr && styles.modalItemRowActive]}
                onPress={() => {
                  setSelectedYear(yr);
                  setShowYearModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalItemText, selectedYear === yr && styles.modalItemTextActive]}>
                  {yr}
                </Text>
                {selectedYear === yr && <Feather name="check" size={18} color="#30D158" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Benchmark Workouts Modal */}
      <Modal
        visible={showBenchmarkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBenchmarkModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBenchmarkModal(false)}>
          <View style={styles.benchmarkSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Benchmark Workouts</Text>
                <Text style={styles.modalSubtitle}>Measure your progress against standardized baselines</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowBenchmarkModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {/* Benchmark items */}
            <View style={styles.benchmarkList}>
              <View style={styles.benchmarkItem}>
                <View style={[styles.benchmarkItemIcon, { backgroundColor: 'rgba(48, 209, 88, 0.12)' }]}>
                  <Feather name="zap" size={18} color="#30D158" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benchmarkItemTitle}>1 km Benchmark</Text>
                  <Text style={styles.benchmarkItemDesc}>All-out test to evaluate peak aerobic speed & baseline pace</Text>
                </View>
              </View>

              <View style={styles.benchmarkItem}>
                <View style={[styles.benchmarkItemIcon, { backgroundColor: 'rgba(10, 132, 255, 0.12)' }]}>
                  <Feather name="activity" size={18} color="#0A84FF" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benchmarkItemTitle}>5 km Benchmark</Text>
                  <Text style={styles.benchmarkItemDesc}>Aerobic threshold test to optimize personal pacing zones</Text>
                </View>
              </View>

              <View style={[styles.benchmarkItem, { borderBottomWidth: 0 }]}>
                <View style={[styles.benchmarkItemIcon, { backgroundColor: 'rgba(191, 90, 242, 0.12)' }]}>
                  <Feather name="clock" size={18} color="#BF5AF2" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benchmarkItemTitle}>12-Minute Cooper Test</Text>
                  <Text style={styles.benchmarkItemDesc}>Measure maximal distance covered in 12 continuous minutes</Text>
                </View>
              </View>
            </View>

            {/* Action button: view saved custom workouts */}
            <TouchableOpacity
              style={styles.benchmarkActionBtn}
              onPress={() => {
                setShowBenchmarkModal(false);
                router.push('/(app)/custom-workout/cards');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.benchmarkActionBtnText}>Manage Custom Workouts</Text>
              <Feather name="arrow-right" size={18} color="#000000" />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  periodTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#161618',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242428',
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  periodTabActive: {
    backgroundColor: '#2C2C30',
  },
  periodTabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: '#141416',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#26262B',
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    gap: 6,
  },
  heroValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroUnit: {
    color: '#30D158',
    fontSize: 18,
    fontWeight: '700',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  streakText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E22',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A30',
  },
  tooltipLeft: {
    flex: 1,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  tooltipSub: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 1,
  },
  tooltipRight: {
    alignItems: 'flex-end',
  },
  tooltipValue: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '700',
  },
  tooltipPace: {
    color: '#8E8E93',
    fontSize: 11,
  },
  tooltipBoxPlaceholder: {
    paddingVertical: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  tooltipHint: {
    color: '#636366',
    fontSize: 12,
    fontStyle: 'italic',
  },
  chartArea: {
    height: 160,
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 150,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barTrack: {
    width: '55%',
    maxWidth: 24,
    height: 125,
    backgroundColor: '#1E1E22',
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barLabel: {
    color: '#636366',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  barLabelCurrent: {
    color: '#8E8E93',
    fontWeight: '700',
  },
  barLabelSelected: {
    color: '#30D158',
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  seeAllText: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionSubBadge: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 36 - 12) / 2,
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242428',
  },
  metricIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricCardValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricCardLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  cardContainer: {
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242428',
    marginBottom: 16,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  splitSubtext: {
    color: '#8E8E93',
    fontSize: 12,
  },
  splitBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1E1E22',
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
  },
  splitBarFill: {
    height: '100%',
  },
  splitLegendRow: {
    flexDirection: 'row',
    gap: 20,
  },
  splitLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },
  bestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  bestItemCard: {
    width: (SCREEN_WIDTH - 36 - 10) / 2,
    backgroundColor: '#141416',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#242428',
  },
  bestIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestContent: {
    flex: 1,
  },
  bestTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
  },
  bestValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#242428',
  },
  recentBar: {
    width: 5,
    height: '100%',
  },
  recentContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recentTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  recentDate: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  recentMetrics: {
    alignItems: 'flex-end',
  },
  recentDist: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  recentMeta: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  emptyStateCard: {
    backgroundColor: '#141416',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242428',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#30D158',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },

  /* New Mockup Elements Styles */
  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1E24',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262930',
  },
  yearPillLabel: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  yearPillValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearPillValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  benchmarkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1E24',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#262930',
  },
  benchmarkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  benchmarkIconWrapper: {
    marginRight: 14,
  },
  benchmarkTextCol: {
    flex: 1,
  },
  benchmarkTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  benchmarkSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },

  summaryListCard: {
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#262930',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIcon: {
    width: 24,
    textAlign: 'center',
    marginRight: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },

  weekCompletionWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  weekCompletionCard: {
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262930',
    minWidth: 260,
  },
  weekCompletionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  weekCompletionCount: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E5E7EB',
    marginTop: 8,
    textAlign: 'center',
  },
  weekCompletionDistance: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2D313A',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  modalItemRowActive: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  modalItemTextActive: {
    color: '#30D158',
    fontWeight: '700',
  },

  benchmarkSheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2D313A',
  },
  benchmarkList: {
    marginTop: 6,
    marginBottom: 20,
  },
  benchmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  benchmarkItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchmarkItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  benchmarkItemDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 16,
  },
  benchmarkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#30D158',
    borderRadius: 16,
    paddingVertical: 14,
  },
  benchmarkActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginRight: 8,
  },
});
