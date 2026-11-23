// components/SettingsMenu.tsx
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { useActiveRun } from '../contexts/ActiveRunContext';
import { usePauseSettings } from '../contexts/PauseSettingsContext';
import { useTheme, type ThemePreference } from '../contexts/ThemeContext';
import type { BackgroundLocationSessionState } from '../src/services/backgroundLocationTask';
import { getBackendErrorMessage } from '../service/api';
import {
  connectionsAPI,
  extractApiResults,
  socialAPI,
  type ConnectionUser,
  type PrivacyZone,
  type RoutePrivacySettings,
  type SharingSettings,
} from '../src/services/socialApi';
import ActiveRunBanner from './navigation/ActiveRunBanner';
import { useResponsive } from '../utils/responsive';

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
  hasPassword: boolean | null;
  initialPage?: 'home' | 'privacy';
  onInitialPageApplied?: () => void;
}

type SettingsPage = 'home' | 'pause' | 'appearance' | 'privacy' | 'requests' | 'blocked' | 'followers' | 'following' | 'zones';

export default function SettingsMenu({
  visible,
  onClose,
  onSelect,
  hasPassword,
  initialPage = 'home',
  onInitialPageApplied,
}: SettingsMenuProps) {
  const { colors, isDark, preference, setPreference } = useTheme();
  const activeRun = useActiveRun();
  const [navigateToRunAfterDismiss, setNavigateToRunAfterDismiss] = useState(false);
  const [runToNavigateTo, setRunToNavigateTo] = useState<BackgroundLocationSessionState | null>(null);
  const {
    autoPauseEnabled,
    isLoaded: pauseSettingsLoaded,
    setVoiceAlertsEnabled,
    setAutoPauseEnabled,
    voiceAlertsEnabled,
  } = usePauseSettings();
  const { spacing, fontSize } = useResponsive();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<SettingsPage>('home');
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [sharingSettings, setSharingSettings] = useState<SharingSettings | null>(null);
  const [routePrivacy, setRoutePrivacy] = useState<RoutePrivacySettings | null>(null);
  const [followRequests, setFollowRequests] = useState<ConnectionUser[]>([]);
  const [blockedAccounts, setBlockedAccounts] = useState<ConnectionUser[]>([]);
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [following, setFollowing] = useState<ConnectionUser[]>([]);
  const [privacyZones, setPrivacyZones] = useState<PrivacyZone[]>([]);
  const [privacyListLoading, setPrivacyListLoading] = useState(false);
  const [privacyListError, setPrivacyListError] = useState<string | null>(null);
  const [privacyActionIds, setPrivacyActionIds] = useState<Set<number>>(() => new Set());
  const [zoneFormVisible, setZoneFormVisible] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneLatitude, setZoneLatitude] = useState('');
  const [zoneLongitude, setZoneLongitude] = useState('');
  const [zoneRadius, setZoneRadius] = useState('200');
  const [zoneSaving, setZoneSaving] = useState(false);
  const accountOptions = [
    { label: hasPassword === null ? 'Password' : hasPassword ? 'Change Password' : 'Set Password', icon: 'key-variant' },
  ];
  const themeOptions = [
    { value: 'system', label: 'Phone Default', icon: 'cellphone' },
    { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
    { value: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
  ] as const;

  useEffect(() => {
    if (!visible || page !== 'privacy') return;
    let active = true;
    Promise.all([
      connectionsAPI.getPrivacy(),
      socialAPI.getSharingSettings(),
      socialAPI.getRoutePrivacy(),
    ])
      .then(([privacyResponse, sharingResponse, routeResponse]) => {
        if (!active) return;
        setPrivateAccount(privacyResponse.data.data.is_private);
        setSharingSettings(sharingResponse.data.data);
        setRoutePrivacy(routeResponse.data.data);
      })
      .catch((error) => {
        if (active) Alert.alert('Unable to load privacy settings', getBackendErrorMessage(error));
      })
      .finally(() => {
        if (active) setPrivacyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, visible]);

  const handlePrivateAccountChange = useCallback(async (value: boolean) => {
    setPrivacySaving(true);
    try {
      const response = await connectionsAPI.setPrivacy(value);
      setPrivateAccount(response.data.data.is_private);
    } catch (error) {
      Alert.alert('Unable to update account privacy', getBackendErrorMessage(error));
    } finally {
      setPrivacySaving(false);
    }
  }, []);

  const handleDefaultAudienceChange = useCallback(() => {
    const options: { label: string; value: SharingSettings['default_audience'] }[] = [
      { label: 'Everyone', value: 'ALL' },
      { label: 'Followers', value: 'FOLLOWERS' },
      { label: "Don't share", value: 'NONE' },
    ];
    Alert.alert('Who can see future workouts?', 'This applies to future uploads. You can still change sharing for an individual workout.', [
      ...options.map((option) => ({
        text: option.label,
        onPress: async () => {
          setPrivacySaving(true);
          try {
            const response = await socialAPI.setDefaultAudience(option.value);
            setSharingSettings(response.data.data);
          } catch (error) {
            Alert.alert('Unable to update sharing', getBackendErrorMessage(error));
          } finally {
            setPrivacySaving(false);
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const handleRoutePrivacyChange = useCallback(async (changes: Partial<Pick<RoutePrivacySettings, 'hide_map' | 'hide_radius_m'>>) => {
    setPrivacySaving(true);
    try {
      const response = await socialAPI.setRoutePrivacy(changes);
      setRoutePrivacy(response.data.data);
    } catch (error) {
      Alert.alert('Unable to update route privacy', getBackendErrorMessage(error));
    } finally {
      setPrivacySaving(false);
    }
  }, []);

  const handleRadiusChange = useCallback(() => {
    const choices: { label: string; value: number | null }[] = [
      { label: 'Default (200 m)', value: null },
      { label: '0 m', value: 0 },
      { label: '200 m', value: 200 },
      { label: '400 m', value: 400 },
      { label: '800 m', value: 800 },
      { label: '1,600 m', value: 1600 },
    ];
    Alert.alert('Hide start & finish', 'Choose how much route detail to hide around the start and finish.', [
      ...choices.map((choice) => ({
        text: choice.label,
        onPress: () => void handleRoutePrivacyChange({ hide_radius_m: choice.value }),
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleRoutePrivacyChange]);

  const handleFollowRequest = useCallback(async (userId: number, accept: boolean) => {
    setPrivacyActionIds((current) => new Set(current).add(userId));
    try {
      if (accept) await connectionsAPI.acceptFollowRequest(userId);
      else await connectionsAPI.declineFollowRequest(userId);
      setFollowRequests((current) => current.filter((user) => user.id !== userId));
    } catch (error) {
      Alert.alert('Unable to update follow request', getBackendErrorMessage(error));
    } finally {
      setPrivacyActionIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }, []);

  const handleUnblock = useCallback(async (userId: number) => {
    setPrivacyActionIds((current) => new Set(current).add(userId));
    try {
      await connectionsAPI.unblockAccount(userId);
      setBlockedAccounts((current) => current.filter((user) => user.id !== userId));
    } catch (error) {
      Alert.alert('Unable to unblock account', getBackendErrorMessage(error));
    } finally {
      setPrivacyActionIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }, []);

  const handleAddPrivacyZone = useCallback(async () => {
    const latitude = Number(zoneLatitude);
    const longitude = Number(zoneLongitude);
    const radius_m = Number(zoneRadius);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isInteger(radius_m) || radius_m < 100 || radius_m > 1600) {
      Alert.alert('Check zone details', 'Enter valid coordinates and a radius from 100 to 1,600 metres.');
      return;
    }
    setZoneSaving(true);
    try {
      const response = await socialAPI.addPrivacyZone({
        name: zoneName.trim(),
        latitude,
        longitude,
        radius_m,
      });
      setPrivacyZones((current) => [response.data.data, ...current]);
      setZoneName('');
      setZoneLatitude('');
      setZoneLongitude('');
      setZoneRadius('200');
      setZoneFormVisible(false);
    } catch (error) {
      Alert.alert('Unable to add privacy zone', getBackendErrorMessage(error));
    } finally {
      setZoneSaving(false);
    }
  }, [zoneLatitude, zoneLongitude, zoneName, zoneRadius]);

  const handleDeletePrivacyZone = useCallback((zoneId: number) => {
    Alert.alert('Delete privacy zone?', 'Routes will no longer be hidden around this location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setPrivacyActionIds((current) => new Set(current).add(zoneId));
          try {
            await socialAPI.deletePrivacyZone(zoneId);
            setPrivacyZones((current) => current.filter((zone) => zone.id !== zoneId));
          } catch (error) {
            Alert.alert('Unable to delete privacy zone', getBackendErrorMessage(error));
          } finally {
            setPrivacyActionIds((current) => {
              const next = new Set(current);
              next.delete(zoneId);
              return next;
            });
          }
        },
      },
    ]);
  }, []);

  const audienceLabel = (audience: SharingSettings['default_audience'] | undefined) => (
    audience === 'ALL' ? 'Everyone' : audience === 'NONE' ? "Don't share" : 'Followers'
  );
  const openPrivacySettings = () => {
    setPrivacyLoading(true);
    setPage('privacy');
  };
  const openPrivacyList = useCallback(async (nextPage: 'requests' | 'blocked' | 'followers' | 'following' | 'zones') => {
    if (privacyListLoading) return;
    setPrivacyListError(null);
    setPrivacyListLoading(true);
    setPage(nextPage);
    try {
      if (nextPage === 'requests') {
        const response = await connectionsAPI.getFollowRequests();
        const results = extractApiResults<ConnectionUser>(response.data);
        setFollowRequests(results);
      } else if (nextPage === 'blocked') {
        const response = await connectionsAPI.getBlockedAccounts();
        const results = extractApiResults<ConnectionUser>(response.data);
        setBlockedAccounts(results);
      } else if (nextPage === 'followers') {
        const response = await connectionsAPI.getFollowers();
        const results = extractApiResults<ConnectionUser>(response.data);
        setFollowers(results);
      } else if (nextPage === 'following') {
        const response = await connectionsAPI.getFollowing();
        const results = extractApiResults<ConnectionUser>(response.data);
        setFollowing(results);
      } else {
        const response = await socialAPI.getPrivacyZones();
        const results = extractApiResults<PrivacyZone>(response.data);
        setPrivacyZones(results);
      }
    } catch (error) {
      const message = getBackendErrorMessage(error, 'Unable to load this list.');
      setPrivacyListError(message);
      Alert.alert('Unable to load this list', message);
    } finally {
      setPrivacyListLoading(false);
    }
  }, [privacyListLoading]);
  const pageTitles: Record<SettingsPage, string> = {
    home: 'Settings',
    pause: 'Pause Mode',
    appearance: 'Appearance',
    privacy: 'Privacy & Sharing',
    requests: 'Follow requests',
    blocked: 'Blocked accounts',
    followers: 'My followers',
    following: 'Following',
    zones: 'Privacy zones',
  };
  const renderConnectionRow = (
    account: ConnectionUser,
    action?: { label: string; onPress: () => void; disabled?: boolean },
    secondaryAction?: { label: string; onPress: () => void; disabled?: boolean },
  ) => (
    <View key={account.id} style={[styles.privacyUserRow, { borderBottomColor: colors.border }]}>
      <Avatar name={account.full_name || account.username} imageUrl={account.avatar_url || undefined} size={38} />
      <View style={styles.androidThemeCopy}>
        <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(14, 13, 15) }]} numberOfLines={1}>
          {account.full_name || account.username}
        </Text>
        <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]} numberOfLines={1}>@{account.username}</Text>
      </View>
      {secondaryAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={secondaryAction.onPress}
          disabled={secondaryAction.disabled}
          style={[styles.privacyActionButton, { backgroundColor: colors.surfaceRaised }]}
        >
          <Text style={[styles.privacyActionText, { color: colors.textSecondary }]}>{secondaryAction.label}</Text>
        </TouchableOpacity>
      ) : null}
      {action ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={action.onPress}
          disabled={action.disabled}
          style={[styles.privacyActionButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
  const renderPrivacyListRefresh = (target: 'requests' | 'blocked' | 'followers' | 'following' | 'zones') => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Refresh list"
      disabled={privacyListLoading}
      onPress={() => void openPrivacyList(target)}
      style={[styles.privacyRefreshRow, { borderBottomColor: colors.border }]}
    >
      <Feather name="refresh-cw" size={15} color={colors.primary} />
      <Text style={[styles.privacyRefreshText, { color: colors.primary }]}>
        {privacyListLoading ? 'Loading...' : 'Refresh'}
      </Text>
    </TouchableOpacity>
  );

  const handleBack = useCallback(() => {
    if (page !== 'home') {
      setPage((current) => (
        current === 'requests' || current === 'blocked' || current === 'followers' || current === 'following' || current === 'zones'
          ? 'privacy'
          : 'home'
      ));
      return;
    }
    onClose();
  }, [page, onClose]);

  const handleSwipeDownToClose = useCallback((distanceY: number, velocityY: number) => {
    if (distanceY < 70 && !(distanceY >= 40 && velocityY >= 0.65)) return;
    if (page !== 'home') setPage('home');
    else onClose();
  }, [page, onClose]);

  const swipeDismissResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1
    ),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, gesture) => handleSwipeDownToClose(gesture.dy, gesture.vy),
  }), [handleSwipeDownToClose]);

  const renderAndroidRow = ({
    label,
    icon,
    iconSet = 'feather',
    summary,
    onPress,
    disabled = false,
  }: {
    label: string;
    icon: string;
    iconSet?: 'feather' | 'material';
    summary?: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.72}
      style={[styles.androidOptionRow, { borderBottomColor: colors.border }]}
    >
      {iconSet === 'material' ? (
        <MaterialCommunityIcons name={icon as any} size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
      ) : (
        <Feather name={icon as any} size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
      )}
      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>{label}</Text>
      {summary ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.androidOptionSummary, { color: colors.textTertiary }]}
        >
          {summary}
        </Text>
      ) : null}
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={() => {
        setPage(initialPage);
        onInitialPageApplied?.();
      }}
      onRequestClose={handleBack}
      onDismiss={() => {
        if (!navigateToRunAfterDismiss) return;
        setNavigateToRunAfterDismiss(false);
        const run = runToNavigateTo ?? activeRun;
        setRunToNavigateTo(null);
        router.navigate({
          pathname: '/(app)/screens/map',
          params: {
            resumeRun: '1',
            ...(run?.runId ? { runId: run.runId } : {}),
          },
        });
      }}
    >
      <View style={[styles.fullPage, { backgroundColor: isDark ? colors.background : '#FFFFFF', paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View {...swipeDismissResponder.panHandlers} style={[styles.pageHeader, page === 'home' && styles.homePageHeader]}>
          {page === 'home' ? (
            <View style={styles.homeHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                onPress={handleBack}
                style={[styles.backButton, { backgroundColor: colors.surfaceRaised }]}
              >
                <Feather name="chevron-left" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.homeTitle, { color: colors.text, fontSize: fontSize(30, 27, 32) }]}>Settings</Text>
            </View>
          ) : (
            <View style={styles.androidHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Back to settings"
                onPress={handleBack}
                style={styles.androidHeaderButton}
              >
                <Feather name="chevron-left" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.androidHeaderTitle, { color: colors.text, fontSize: fontSize(17, 16, 19) }]}>
                {pageTitles[page]}
              </Text>
              <View style={styles.androidHeaderSpacer} />
            </View>
          )}
        </View>

        <ScrollView
          style={styles.settingsScroll}
          contentContainerStyle={[
            styles.settingsContent,
            { paddingHorizontal: spacing(16), paddingBottom: activeRun?.active ? 88 : 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {page === 'home' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>ACTIVITY</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderAndroidRow({ label: 'Activities', icon: 'activity', onPress: () => onSelect('Activities') })}
                  {renderAndroidRow({
                    label: 'Pause Mode',
                    icon: 'pause-circle',
                    summary: autoPauseEnabled ? 'Manual + Auto-Pause' : 'Manual Pause',
                    onPress: () => setPage('pause'),
                  })}
                </View>

                <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>ACCOUNT</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {accountOptions.map((item) => renderAndroidRow({
                    label: item.label,
                    icon: item.icon,
                    iconSet: 'material',
                    onPress: () => onSelect(item.label),
                    disabled: hasPassword === null && item.label === 'Password',
                  }))}
                  {renderAndroidRow({ label: 'Subscriptions', icon: 'credit-card', onPress: () => onSelect('Subscription') })}
                  {renderAndroidRow({
                    label: 'Privacy & Sharing',
                    icon: 'lock',
                    summary: privateAccount ? 'Private account' : 'Public account',
                    onPress: openPrivacySettings,
                  })}
                </View>

                <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>PREFERENCES</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderAndroidRow({
                    label: 'Appearance',
                    icon: 'circle-half-full',
                    iconSet: 'material',
                    summary: preference === 'system' ? 'Phone Default' : preference === 'light' ? 'Light' : 'Dark',
                    onPress: () => setPage('appearance'),
                  })}
                  <View style={[styles.androidVoiceRow, { borderTopColor: colors.border }]}>
                    <Feather name="volume-2" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                    <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Voice Coach</Text>
                    <Switch
                      accessibilityRole="switch"
                      accessibilityLabel="Voice Coach"
                      value={voiceAlertsEnabled}
                      onValueChange={setVoiceAlertsEnabled}
                      disabled={!pauseSettingsLoaded}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.surface}
                    />
                  </View>
                </View>
                <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>SESSION</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Log out of your account"
                    onPress={() => onSelect('Logout')}
                    style={styles.androidOptionRow}
                  >
                    <Feather name="log-out" size={spacing(21)} color={isDark ? '#F87171' : '#D46A70'} style={styles.androidOptionIcon} />
                    <Text style={[styles.androidOptionLabel, { color: isDark ? '#F87171' : '#D46A70', fontSize: fontSize(16, 14, 17) }]}>Logout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete your account"
                    onPress={() => onSelect('Delete Account')}
                    style={[styles.androidOptionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <Feather name="trash-2" size={spacing(21)} color="#EF4444" style={styles.androidOptionIcon} />
                    <Text style={[styles.androidOptionLabel, { color: '#EF4444', fontSize: fontSize(16, 14, 17) }]}>Delete Account</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : page === 'pause' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>PAUSE MODE</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  <View style={[styles.androidCheckboxRow, { borderBottomColor: colors.border }]}>
                    <Feather name="pause-circle" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                    <View style={styles.androidCheckboxCopy}>
                      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Manual Pause</Text>
                      <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>The run only pauses when you tap Pause.</Text>
                    </View>
                    <Feather name="check" size={20} color={colors.primary} />
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Auto-Pause"
                    accessibilityState={{ checked: autoPauseEnabled, disabled: !pauseSettingsLoaded }}
                    disabled={!pauseSettingsLoaded}
                    onPress={() => setAutoPauseEnabled(!autoPauseEnabled)}
                    style={styles.androidCheckboxRow}
                  >
                    <Feather name="activity" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                    <View style={styles.androidCheckboxCopy}>
                      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Auto-Pause</Text>
                      <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>Pause after 5 seconds still and resume when movement returns.</Text>
                    </View>
                    <Feather name={autoPauseEnabled ? 'check' : 'square'} size={20} color={autoPauseEnabled ? colors.primary : colors.textTertiary} />
                  </Pressable>
                </View>
                <Text style={[styles.androidSettingsNote, { color: colors.textTertiary }]}>You can still pause and resume manually at any time, even with Auto-Pause on.</Text>
              </>
            ) : page === 'appearance' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>THEME</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {themeOptions.map((mode, index) => {
                    const selected = preference === mode.value;
                    return (
                      <TouchableOpacity
                        key={mode.value}
                        accessibilityRole="radio"
                        accessibilityLabel={`${mode.label} theme`}
                        accessibilityState={{ checked: selected }}
                        onPress={() => setPreference(mode.value as ThemePreference)}
                        style={[styles.androidOptionRow, mode.value === 'system' && styles.androidThemeRow, index < themeOptions.length - 1 && { borderBottomColor: colors.border }]}
                      >
                        <MaterialCommunityIcons name={mode.icon} size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                        <View style={styles.androidThemeCopy}>
                          <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>{mode.label}</Text>
                          {mode.value === 'system' ? <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>Matches your phone&apos;s appearance setting</Text> : null}
                        </View>
                        {selected ? <Feather name="check" size={20} color={colors.primary} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : page === 'privacy' ? (
              privacyLoading ? (
                <View style={styles.privacyLoading}>
                  <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>Loading privacy settings...</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>ACCOUNT PRIVACY</Text>
                  <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                    <View style={[styles.androidVoiceRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <View style={styles.androidCheckboxCopy}>
                        <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Private account</Text>
                        <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>New followers need your approval. Existing followers are not removed.</Text>
                      </View>
                      <Switch
                        accessibilityRole="switch"
                        accessibilityLabel="Private account"
                        value={privateAccount}
                        onValueChange={(value) => void handlePrivateAccountChange(value)}
                        disabled={privacySaving}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor={colors.surface}
                      />
                    </View>
                    {renderAndroidRow({
                      label: 'Follow requests',
                      icon: 'user-plus',
                      summary: followRequests.length > 0 ? String(followRequests.length) : undefined,
                      onPress: () => void openPrivacyList('requests'),
                      disabled: privacyListLoading,
                    })}
                    {renderAndroidRow({ label: 'Blocked accounts', icon: 'slash', onPress: () => void openPrivacyList('blocked'), disabled: privacyListLoading })}
                  </View>

                  <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>DEFAULT WORKOUT SHARING</Text>
                  <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                    {renderAndroidRow({
                      label: 'Who can see future workouts',
                      icon: 'eye',
                      summary: audienceLabel(sharingSettings?.default_audience),
                      onPress: handleDefaultAudienceChange,
                      disabled: privacySaving,
                    })}
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary, marginTop: 0, marginBottom: 13 }]}>
                      This default applies to future uploads. You can still change sharing for an individual workout.
                    </Text>
                  </View>

                  <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>ROUTE PRIVACY</Text>
                  <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                    <View style={[styles.androidVoiceRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <Feather name="map" size={spacing(21)} color={colors.text} style={styles.androidOptionIcon} />
                      <Text style={[styles.androidOptionLabel, { color: colors.text, fontSize: fontSize(16, 14, 17) }]}>Hide map on all my workouts</Text>
                      <Switch
                        accessibilityRole="switch"
                        accessibilityLabel="Hide map on all my workouts"
                        value={routePrivacy?.hide_map ?? false}
                        onValueChange={(value) => void handleRoutePrivacyChange({ hide_map: value })}
                        disabled={privacySaving}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor={colors.surface}
                      />
                    </View>
                    {renderAndroidRow({
                      label: 'Hide start & finish',
                      icon: 'map-pin',
                      summary: routePrivacy?.hide_radius_m == null
                        ? `Default (${routePrivacy?.effective_hide_radius_m ?? 200} m)`
                        : `${routePrivacy.hide_radius_m.toLocaleString()} m`,
                      onPress: handleRadiusChange,
                      disabled: privacySaving,
                    })}
                    {renderAndroidRow({
                      label: 'Privacy zones',
                      icon: 'map',
                      summary: routePrivacy?.zones_count ? String(routePrivacy.zones_count) : undefined,
                      onPress: () => void openPrivacyList('zones'),
                      disabled: privacyListLoading,
                    })}
                  </View>
                  <Text style={[styles.androidSettingsNote, { color: colors.textTertiary }]}>
                    Other people never see hidden parts of your routes. You always see your full route. These settings apply to old and new workouts.
                  </Text>

                  <Text style={[styles.androidSectionTitle, styles.androidSectionSpaced, { color: colors.textTertiary }]}>CONNECTIONS</Text>
                  <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                    {renderAndroidRow({ label: 'Find runners', icon: 'users', onPress: () => onSelect('Find Runners') })}
                    {renderAndroidRow({ label: 'My followers', icon: 'users', onPress: () => void openPrivacyList('followers'), disabled: privacyListLoading })}
                    {renderAndroidRow({ label: 'Following', icon: 'users', onPress: () => void openPrivacyList('following'), disabled: privacyListLoading })}
                  </View>
                </>
              )
            ) : page === 'requests' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>PEOPLE WHO WANT TO FOLLOW YOU</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderPrivacyListRefresh('requests')}
                  {privacyListLoading ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>Loading follow requests...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : followRequests.length ? followRequests.map((account) => renderConnectionRow(
                    account,
                    { label: 'Accept', onPress: () => void handleFollowRequest(account.id, true), disabled: privacyActionIds.has(account.id) },
                    { label: 'Decline', onPress: () => void handleFollowRequest(account.id, false), disabled: privacyActionIds.has(account.id) },
                  )) : (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>You have no pending follow requests.</Text>
                  )}
                </View>
              </>
            ) : page === 'blocked' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>BLOCKED ACCOUNTS</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {privacyListLoading ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>Loading blocked accounts...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : blockedAccounts.length ? blockedAccounts.map((account) => renderConnectionRow(
                    account,
                    { label: privacyActionIds.has(account.id) ? '...' : 'Unblock', onPress: () => void handleUnblock(account.id), disabled: privacyActionIds.has(account.id) },
                  )) : (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>You have no blocked accounts.</Text>
                  )}
                </View>
              </>
            ) : page === 'followers' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>MY FOLLOWERS</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderPrivacyListRefresh('followers')}
                  {privacyListLoading ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>Loading followers...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : followers.length ? followers.map((account) => renderConnectionRow(account)) : (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>You do not have any followers yet.</Text>
                  )}
                </View>
              </>
            ) : page === 'following' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>FOLLOWING</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderPrivacyListRefresh('following')}
                  {privacyListLoading ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>Loading following...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : following.length ? following.map((account) => renderConnectionRow(account)) : (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>You are not following any runners yet.</Text>
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>HIDE ROUTE DETAILS AROUND A LOCATION</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {privacyListLoading ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>Loading privacy zones...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : privacyZones.length ? privacyZones.map((zone) => (
                    <View key={zone.id} style={[styles.privacyZoneRow, { borderBottomColor: colors.border }]}>
                      <View style={styles.androidThemeCopy}>
                        <Text style={[styles.androidOptionLabel, { color: colors.text }]}>{zone.name || 'Privacy zone'}</Text>
                        <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>
                          {zone.radius_m} m radius
                        </Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${zone.name || 'privacy zone'}`}
                        disabled={privacyActionIds.has(zone.id)}
                        onPress={() => handleDeletePrivacyZone(zone.id)}
                        style={styles.zoneDeleteButton}
                      >
                        <Feather name="trash-2" size={18} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  )) : (
                    <Text style={[styles.androidSettingsNote, { color: colors.textSecondary }]}>No privacy zones added.</Text>
                  )}
                </View>
                {zoneFormVisible ? (
                  <View style={[styles.zoneForm, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4' }]}>
                    <Text style={[styles.androidOptionLabel, { color: colors.text, marginBottom: 8 }]}>New privacy zone</Text>
                    <TextInput value={zoneName} onChangeText={setZoneName} placeholder="Name (optional)" placeholderTextColor={colors.textTertiary} style={[styles.zoneInput, { color: colors.text, borderColor: colors.border }]} />
                    <View style={styles.zoneCoordinateRow}>
                      <TextInput value={zoneLatitude} onChangeText={setZoneLatitude} placeholder="Latitude" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" style={[styles.zoneInput, styles.zoneCoordinateInput, { color: colors.text, borderColor: colors.border }]} />
                      <TextInput value={zoneLongitude} onChangeText={setZoneLongitude} placeholder="Longitude" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" style={[styles.zoneInput, styles.zoneCoordinateInput, { color: colors.text, borderColor: colors.border }]} />
                    </View>
                    <TextInput value={zoneRadius} onChangeText={setZoneRadius} placeholder="Radius in metres (100-1,600)" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" style={[styles.zoneInput, { color: colors.text, borderColor: colors.border }]} />
                    <View style={styles.zoneFormActions}>
                      <TouchableOpacity onPress={() => setZoneFormVisible(false)} disabled={zoneSaving} style={styles.zoneCancelButton}>
                        <Text style={[styles.privacyActionText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => void handleAddPrivacyZone()} disabled={zoneSaving} style={[styles.privacyActionButton, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>{zoneSaving ? 'Saving...' : 'Add zone'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setZoneFormVisible(true)}
                    style={[styles.addZoneButton, { backgroundColor: colors.primary }]}
                  >
                    <Feather name="plus" size={18} color={colors.primaryText} />
                    <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>Add privacy zone</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.androidSettingsNote, { color: colors.textTertiary }]}>
                  Choose coordinates and a radius to hide route details near your home or another location.
                </Text>
              </>
            )}

        </ScrollView>
        <ActiveRunBanner
          bottomOffset={insets.bottom + 16}
          onNavigateToRun={(run) => {
            setRunToNavigateTo(run);
            setNavigateToRunAfterDismiss(true);
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullPage: { flex: 1 },
  pageHeader: { borderBottomWidth: 0, paddingHorizontal: 16 },
  homePageHeader: { paddingBottom: 8 },
  homeHeader: { paddingTop: 8, gap: 16 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  homeTitle: { fontWeight: '800', lineHeight: 38 },
  androidHeader: { height: 56, flexDirection: 'row', alignItems: 'center' },
  androidHeaderButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  androidHeaderTitle: { flex: 1, textAlign: 'center', fontWeight: '700' },
  androidHeaderSpacer: { width: 44 },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
  },
  swipeHandleArea: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    fontSize: 21,
  },
  settingsScroll: { flex: 1 },
  settingsContent: { paddingTop: 12, paddingBottom: 24 },
  androidSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7, marginLeft: 2 },
  androidSectionSpaced: { marginTop: 20 },
  optionGroup: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  androidOptionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  androidOptionIcon: { marginRight: 14 },
  androidOptionLabel: { flex: 1, flexShrink: 1, fontWeight: '500' },
  androidOptionSummary: { fontSize: 12, marginRight: 8 },
  androidVoiceRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  androidCheckboxRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  androidCheckboxCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  androidThemeRow: { minHeight: 64 },
  androidThemeCopy: { flex: 1, minWidth: 0, gap: 2 },
  androidOptionHint: { fontSize: 12, lineHeight: 16, marginTop: 3 },
  androidSettingsNote: { fontSize: 12, lineHeight: 17, marginTop: 16, paddingHorizontal: 4 },
  privacyLoading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  privacyUserRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  privacyActionButton: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 16 },
  privacyActionText: { fontSize: 11, fontWeight: '700' },
  privacyRefreshRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  privacyRefreshText: { fontSize: 12, fontWeight: '600' },
  privacyZoneRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  zoneDeleteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  zoneForm: { borderRadius: 16, padding: 14, marginTop: 12, gap: 9 },
  zoneInput: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 10, fontSize: 14 },
  zoneCoordinateRow: { flexDirection: 'row', gap: 8 },
  zoneCoordinateInput: { flex: 1, minWidth: 0 },
  zoneFormActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 },
  zoneCancelButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12 },
  addZoneButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 21, marginTop: 14, paddingHorizontal: 16 },
});
