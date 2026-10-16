import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../service/auth';
import {
  AppNotification,
  getNotificationDestination,
  getNotificationPage,
  getNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../service/notificationService';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notification: AppNotification) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const BUSINESS_NOTIFICATION_CHANNEL_ID = 'zyrun-business-notifications';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const userId = user?.id;
  const pendingNotificationTap = useRef<{
    data: Record<string, unknown>;
    responseId: string;
  } | null>(null);
  const handledRemoteMessageIds = useRef(new Set<string>());
  const [dataUserId, setDataUserId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isAuthLoading || userId == null) return;

    setIsLoading(true);
    setError(null);
    try {
      const page = await getNotificationPage();
      setNotifications(page.results);
      setNextPageUrl(page.next);
      setDataUserId(userId);

      try {
        setUnreadCount(await getNotificationUnreadCount());
      } catch (countError) {
        setUnreadCount(null);
        console.warn('[Notifications] Unread count unavailable', countError);
      }
    } catch (requestError) {
      setError('Unable to load notifications. Check your connection and try again.');
      console.warn('[Notifications] List request failed', requestError);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthLoading, userId]);

  const loadMore = useCallback(async () => {
    if (!nextPageUrl || isLoadingMore || userId == null) return;

    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await getNotificationPage(nextPageUrl);
      setNotifications((current) => {
        const existingIds = new Set(current.map((item) => String(item.id)));
        return [...current, ...page.results.filter((item) => !existingIds.has(String(item.id)))];
      });
      setNextPageUrl(page.next);
    } catch (requestError) {
      setError('Unable to load more notifications. Please try again.');
      console.warn('[Notifications] Next page request failed', requestError);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextPageUrl, userId]);

  const markRead = useCallback(async (notification: AppNotification) => {
    if (notification.is_read) return;

    await markNotificationRead(notification.id);
    setNotifications((current) => current.map((item) => (
      String(item.id) === String(notification.id)
        ? { ...item, is_read: true, read_at: new Date().toISOString() }
        : item
    )));
    setUnreadCount((current) => current == null ? null : Math.max(0, current - 1));
    try {
      setUnreadCount(await getNotificationUnreadCount());
    } catch (countError) {
      console.warn('[Notifications] Unread count refresh failed', countError);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((item) => ({
      ...item,
      is_read: true,
      read_at: item.read_at || new Date().toISOString(),
    })));
    setUnreadCount(0);
    try {
      setUnreadCount(await getNotificationUnreadCount());
    } catch (countError) {
      console.warn('[Notifications] Unread count refresh failed', countError);
    }
  }, []);

  const handleNotificationTap = useCallback((data: Record<string, unknown>, responseId: string) => {
    const notificationType = data.type;
    if (typeof notificationType !== 'string') return;

    const destination = getNotificationDestination(notificationType, data);
    if (!destination) return;

    if (isAuthLoading || userId == null || !navigationState?.key) {
      pendingNotificationTap.current = { data, responseId };
      return;
    }

    if (handledRemoteMessageIds.current.has(responseId)) return;
    handledRemoteMessageIds.current.add(responseId);
    if (handledRemoteMessageIds.current.size > 100) {
      const oldestId = handledRemoteMessageIds.current.values().next().value;
      if (oldestId) handledRemoteMessageIds.current.delete(oldestId);
    }
    router.push(destination as never);
  }, [isAuthLoading, navigationState?.key, router, userId]);

  const handleRemoteMessageTap = useCallback((message: RemoteMessage) => {
    const data = message.data ?? {};
    const responseId = message.messageId || `${data.type}:${JSON.stringify(data)}`;
    handleNotificationTap(data, responseId);
  }, [handleNotificationTap]);

  useEffect(() => {
    if (!isAuthLoading && userId != null) {
      void Promise.resolve().then(refresh);
    }
  }, [isAuthLoading, refresh, userId]);

  useEffect(() => {
    if (isAuthLoading || userId == null) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [isAuthLoading, refresh, userId]);

  useEffect(() => {
    if (isAuthLoading || userId == null || !navigationState?.key) return;
    const pendingTap = pendingNotificationTap.current;
    if (!pendingTap) return;
    pendingNotificationTap.current = null;
    handleNotificationTap(pendingTap.data, pendingTap.responseId);
  }, [handleNotificationTap, isAuthLoading, navigationState?.key, userId]);

  useEffect(() => {
    if (isAuthLoading || userId == null) return;

    const messaging = getMessaging();
    const unsubscribeForeground = onMessage(messaging, async (message) => {
      void refresh();
      const titleValue = message.notification?.title ?? message.data?.title;
      const bodyValue = message.notification?.body ?? message.data?.body ?? message.data?.message;
      const title = typeof titleValue === 'string' ? titleValue : undefined;
      const body = typeof bodyValue === 'string' ? bodyValue : undefined;
      if (!title && !body) {
        console.warn('[FCM] Foreground message has no title or body to display.');
        return;
      }

      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(BUSINESS_NOTIFICATION_CHANNEL_ID, {
            name: 'ZYRun notifications',
            description: 'Updates from Zy-Run',
            importance: Notifications.AndroidImportance.DEFAULT,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }

        const content = {
          title,
          body,
          data: { ...message.data, _zyrunLocal: true },
        } satisfies Notifications.NotificationContentInput;
        const notificationId = await Notifications.scheduleNotificationAsync({
          content,
          trigger: { channelId: BUSINESS_NOTIFICATION_CHANNEL_ID },
        });
      } catch (notificationError) {
        console.warn('[Notifications] Foreground notification presentation failed', notificationError);
      }
    });

    const handleLocalNotificationTap = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (data?._zyrunLocal !== true) return;
      const responseId = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      handleNotificationTap(data, responseId);
    };
    const unsubscribeLocalNotificationTap = Notifications.addNotificationResponseReceivedListener(
      handleLocalNotificationTap,
    );
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleLocalNotificationTap(response);
    }).catch((error) => {
      console.warn('[Notifications] Local notification response lookup failed', error);
    });

    const unsubscribeOpened = onNotificationOpenedApp(messaging, handleRemoteMessageTap);
    void getInitialNotification(messaging).then((message) => {
      if (message) handleRemoteMessageTap(message);
    }).catch((error) => {
      console.warn('[Notifications] Initial notification lookup failed', error);
    });

    return () => {
      unsubscribeForeground();
      unsubscribeLocalNotificationTap.remove();
      unsubscribeOpened();
    };
  }, [handleNotificationTap, handleRemoteMessageTap, isAuthLoading, refresh, userId]);

  const value = useMemo<NotificationContextValue>(() => ({
    notifications: dataUserId === userId ? notifications : [],
    unreadCount: dataUserId === userId ? unreadCount : null,
    isLoading: isAuthLoading || isLoading,
    isLoadingMore,
    error,
    hasMore: dataUserId === userId && nextPageUrl !== null,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  }), [
    dataUserId,
    error,
    isAuthLoading,
    isLoading,
    isLoadingMore,
    loadMore,
    markAllRead,
    markRead,
    nextPageUrl,
    notifications,
    refresh,
    unreadCount,
    userId,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};