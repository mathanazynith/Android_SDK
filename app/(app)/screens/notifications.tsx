import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotifications } from '../../../contexts/NotificationContext';
import { BRAND_GREEN, useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../service/auth';
import {
  getLocallyDismissedNotificationIds,
  getNotificationDestination,
  saveLocallyDismissedNotification,
  type AppNotification,
} from '../../../service/notificationService';

const EMPTY_IDS = new Set<string>();
  
  type IconName = keyof typeof Feather.glyphMap;
  
  const eventPresentation = (type: string): { icon: IconName; color: string } => {
    switch (type) {
      case 'PLAN_ENDING':
        return { icon: 'clock', color: '#E6B75A' };
      case 'WORKOUT_TODAY':
      case 'WORKOUT_TOMORROW':
        return { icon: 'calendar', color: BRAND_GREEN };
      case 'BENCHMARK_WORKOUT_TODAY':
      case 'BENCHMARK_WORKOUT_TOMORROW':
        return { icon: 'activity', color: '#E6B75A' };
      case 'NEW_DEVICE_LOGIN':
        return { icon: 'smartphone', color: '#8FA6B5' };
      case 'RUN_SAVED_OTHER_DEVICE':
        return { icon: 'activity', color: BRAND_GREEN };
      case 'PASSWORD_CHANGED':
        return { icon: 'lock', color: '#8FA6B5' };
      case 'PLAN_UPDATED_BY_ADMIN':
        return { icon: 'refresh-cw', color: BRAND_GREEN };
      default:
        return { icon: 'bell', color: '#A7ADB0' };
    }
  };
  
  const dateGroupFor = (value: string, now: Date): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
  
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const daysAgo = (today - day) / 86_400_000;
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };
  
  const formatTime = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  
export default function NotificationsScreen() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const {
      notifications,
      unreadCount,
      isLoading,
      isLoadingMore,
      error,
      hasMore,
      refresh,
      loadMore,
      markRead,
      markAllRead,
    } = useNotifications();
    const [actionError, setActionError] = useState<string | null>(null);
    const [dismissalState, setDismissalState] = useState<{
      userId: number | null;
      dismissedIds: Set<string>;
      loaded: boolean;
    }>({ userId: null, dismissedIds: new Set(), loaded: false });
    const [dismissalRetry, setDismissalRetry] = useState(0);
    const [dismissalReadError, setDismissalReadError] = useState<{
      userId: number;
      message: string;
    } | null>(null);
    const activeUserId = useRef(userId);
    useEffect(() => {
      activeUserId.current = userId;
    }, [userId]);
    const dismissedIds = dismissalState.userId === userId ? dismissalState.dismissedIds : EMPTY_IDS;
    const dismissalsLoaded = dismissalState.userId === userId && dismissalState.loaded;
    const currentDismissalReadError = dismissalReadError?.userId === userId
      ? dismissalReadError.message
      : null;

    useEffect(() => {
      if (userId == null) return;
      let cancelled = false;
      void getLocallyDismissedNotificationIds(userId).then((storedDismissedIds) => {
        if (cancelled) return;
        setDismissalState({
          userId,
          dismissedIds: storedDismissedIds,
          loaded: true,
        });
      }).catch((error) => {
        if (cancelled) return;
        setDismissalReadError({
          userId,
          message: 'Saved notification dismissals could not be loaded. Please try again.',
        });
        console.warn('[Notifications] Local dismissal lookup failed', error);
      });

      return () => {
        cancelled = true;
      };
    }, [dismissalRetry, userId]);

    const visibleNotifications = useMemo(
      () => notifications.filter((item) => dismissalsLoaded && !dismissedIds.has(String(item.id))),
      [dismissalsLoaded, dismissedIds, notifications],
    );
    const isCheckingDismissals = userId !== null && !dismissalsLoaded && currentDismissalReadError === null;
    const unreadInList = visibleNotifications.some((item) => !item.is_read);
    const dismissNotification = async (id: AppNotification['id']) => {
      if (userId === null || !dismissalsLoaded) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDismissalState((current) => {
        if (current.userId !== userId || !current.loaded) return current;
        return { ...current, dismissedIds: new Set(current.dismissedIds).add(String(id)) };
      });
      try {
        await saveLocallyDismissedNotification(userId, id);
      } catch (error) {
        if (activeUserId.current === userId) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setDismissalState((current) => {
            if (current.userId !== userId || !current.loaded) return current;
            const nextDismissedIds = new Set(current.dismissedIds);
            nextDismissedIds.delete(String(id));
            return { ...current, dismissedIds: nextDismissedIds };
          });
          setActionError('This notification could not be dismissed on this device. Please try again.');
        }
        console.warn('[Notifications] Local dismissal save failed', error);
      }
    };
    const sections = useMemo(() => {
      const now = new Date();
      const groups = new Map<string, AppNotification[]>();
      for (const notification of visibleNotifications) {
        const label = dateGroupFor(notification.created_at, now);
        const group = groups.get(label) ?? [];
        group.push(notification);
        groups.set(label, group);
      }
      return Array.from(groups, ([title, items]) => ({ title, items }))
        .sort((first, second) => (
          new Date(second.items[0].created_at).getTime() - new Date(first.items[0].created_at).getTime()
        ));
    }, [visibleNotifications]);
  
    const openNotification = async (notification: AppNotification) => {
      setActionError(null);
      try {
        await markRead(notification);
      } catch (requestError) {
        setActionError('This notification could not be marked as read.');
        console.warn('[Notifications] Mark read failed', requestError);
      }
  
      const destination = getNotificationDestination(notification.type, notification.data);
      if (destination) router.push(destination as never);
    };
  
    const handleMarkAllRead = async () => {
      setActionError(null);
      try {
        await markAllRead();
      } catch (requestError) {
        setActionError('Notifications could not be marked as read. Please try again.');
        console.warn('[Notifications] Mark all read failed', requestError);
      }
    };
  
    return (
      <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Feather name="arrow-left" size={21} color={colors.text} />
          </Pressable>
          <View style={styles.headingBlock}>
            <Text style={[styles.heading, { color: colors.text }]}>Notifications</Text>
            {unreadCount !== null && unreadCount > 0 ? (
              <Text style={[styles.unreadSummary, { color: colors.textSecondary }]}>{unreadCount} unread</Text>
            ) : null}
          </View>
          {(unreadCount ?? 0) > 0 || unreadInList ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleMarkAllRead()}
              style={styles.markAllButton}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : <View style={styles.headerSpacer} />}
        </View>
  
        {actionError ? <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text> : null}
  
        {isLoading && notifications.length === 0 ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color={BRAND_GREEN} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>Loading notifications...</Text>
          </View>
        ) : error && notifications.length === 0 ? (
          <View style={styles.stateContainer}>
            <Feather name="wifi-off" size={27} color={colors.textSecondary} />
            <Text style={[styles.stateText, { color: colors.text }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : currentDismissalReadError ? (
          <View style={styles.stateContainer}>
            <Feather name="alert-circle" size={27} color={colors.textSecondary} />
            <Text style={[styles.stateText, { color: colors.text }]}>
              {currentDismissalReadError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDismissalReadError(null);
                setDismissalRetry((attempt) => attempt + 1);
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : isCheckingDismissals ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color={BRAND_GREEN} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>Loading notifications...</Text>
          </View>
        ) : visibleNotifications.length === 0 ? (
          <View style={styles.stateContainer}>
            <View style={styles.emptyIcon}>
              <Feather name="bell" size={24} color={BRAND_GREEN} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>You&apos;re all caught up</Text>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>New notifications will appear here.</Text>
            {hasMore ? (
              <Pressable
                accessibilityRole="button"
                disabled={isLoadingMore}
                onPress={() => void loadMore()}
                style={styles.loadMoreButton}
              >
                {isLoadingMore
                  ? <ActivityIndicator size="small" color={BRAND_GREEN} />
                  : <Text style={styles.markAllText}>Load older notifications</Text>}
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={() => void refresh()}
                tintColor={BRAND_GREEN}
                colors={[BRAND_GREEN]}
              />
            }
          >
            {sections.map((section) => (
              <View key={section.title}>
                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>{section.title}</Text>
                {section.items.map((notification) => {
                  const presentation = eventPresentation(notification.type);
                  return (
                    <ReanimatedSwipeable
                      key={String(notification.id)}
                      overshootRight={false}
                      overshootLeft={false}
                      rightThreshold={40}
                      leftThreshold={40}
                      renderLeftActions={() => (
                        <View style={styles.dismissAction}>
                          <Feather name="trash-2" size={18} color="#FFFFFF" />
                          <Text style={styles.dismissActionText}>Dismiss</Text>
                        </View>
                      )}
                      renderRightActions={() => (
                        <View style={styles.dismissAction}>
                          <Feather name="trash-2" size={18} color="#FFFFFF" />
                          <Text style={styles.dismissActionText}>Dismiss</Text>
                        </View>
                      )}
                      onSwipeableOpen={() => dismissNotification(notification.id)}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${notification.title}. ${notification.is_read ? 'Read' : 'Unread'}`}
                        accessibilityActions={[{ name: 'dismiss', label: 'Dismiss notification' }]}
                        onAccessibilityAction={({ nativeEvent }) => {
                          if (nativeEvent.actionName === 'dismiss') void dismissNotification(notification.id);
                        }}
                        onPress={() => void openNotification(notification)}
                        style={({ pressed }) => [
                          styles.notificationRow,
                          {
                            backgroundColor: colors.background,
                            borderBottomColor: colors.border,
                            opacity: pressed ? 0.72 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.eventIcon, { backgroundColor: `${presentation.color}18` }]}>
                          <Feather name={presentation.icon} size={18} color={presentation.color} />
                        </View>
                        <View style={styles.notificationContent}>
                          <View style={styles.titleLine}>
                            {!notification.is_read ? <View style={styles.unreadDot} /> : null}
                            <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={2}>
                              {notification.title}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[styles.timestamp, { color: colors.textSecondary }]}
                            >
                              {formatTime(notification.created_at)}
                            </Text>
                          </View>
                          <Text style={[styles.message, { color: colors.textSecondary }]}>{notification.message}</Text>
                        </View>
                      </Pressable>
                    </ReanimatedSwipeable>
                  );
                })}
              </View>
            ))}
            {hasMore ? (
              <Pressable
                accessibilityRole="button"
                disabled={isLoadingMore}
                onPress={() => void loadMore()}
                style={styles.loadMoreButton}
              >
                {isLoadingMore
                  ? <ActivityIndicator size="small" color={BRAND_GREEN} />
                  : <Text style={styles.markAllText}>Load older notifications</Text>}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
      </GestureHandlerRootView>
    );
  }
  
const styles = StyleSheet.create({
    gestureRoot: { flex: 1 },
    screen: { flex: 1 },
    header: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 17,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 12,
    },
    backButton: { width: 38, height: 42, justifyContent: 'center' },
    headingBlock: { flex: 1 },
    heading: { fontSize: 22, fontWeight: '700' },
    unreadSummary: { fontSize: 12, marginTop: 2 },
    markAllButton: { paddingVertical: 10, paddingLeft: 8 },
    markAllText: { color: BRAND_GREEN, fontSize: 13, fontWeight: '700' },
    headerSpacer: { width: 70 },
    actionError: { color: '#F08D82', fontSize: 13, paddingHorizontal: 18, paddingTop: 12 },
    listContent: { paddingHorizontal: 18, paddingBottom: 36 },
    sectionHeading: { marginTop: 22, marginBottom: 7, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    notificationRow: { minHeight: 82, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
    dismissAction: { width: 88, minHeight: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9534F', gap: 4 },
    dismissActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    eventIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    notificationContent: { flex: 1, minWidth: 0 },
    titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND_GREEN, marginTop: 6 },
    notificationTitle: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    timestamp: { width: 64, flexShrink: 0, fontSize: 11, marginTop: 2, textAlign: 'right' },
    message: { fontSize: 13, lineHeight: 19, marginTop: 5 },
    loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    stateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 35, gap: 12 },
    stateText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
    emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#63C72B18' },
    emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 3 },
    retryButton: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 16 },
    retryText: { color: BRAND_GREEN, fontSize: 14, fontWeight: '700' },
    inlineError: { color: '#F08D82', fontSize: 13, paddingTop: 12 },
});