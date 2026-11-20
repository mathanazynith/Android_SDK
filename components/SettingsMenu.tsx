// components/SettingsMenu.tsx
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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
import { CustomSlider } from './CustomSlider';
import { useResponsive } from '../utils/responsive';
import ENV from '../env';

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
  hasPassword: boolean | null;
  initialPage?: 'home' | 'privacy';
  onInitialPageApplied?: () => void;
}

type SettingsPage = 'home' | 'pause' | 'appearance' | 'privacy' | 'requests' | 'blocked' | 'followers' | 'following' | 'zones';
const DEFAULT_ZONE_RADIUS_M = 200;
const MIN_ZONE_RADIUS_M = 200;
const MAX_ZONE_RADIUS_M = 1600;
const ZONE_RADIUS_STEP_M = 100;
const HIDE_RADIUS_OPTIONS = [0, ...Array.from(
  { length: (MAX_ZONE_RADIUS_M - MIN_ZONE_RADIUS_M) / ZONE_RADIUS_STEP_M + 1 },
  (_, index) => MIN_ZONE_RADIUS_M + index * ZONE_RADIUS_STEP_M,
)];

interface ZonePlaceSuggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

const createPlacesSessionToken = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
});

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
  const [sharingDialogVisible, setSharingDialogVisible] = useState(false);
  const [sharingDialogError, setSharingDialogError] = useState<string | null>(null);
  const [savingAudience, setSavingAudience] = useState<SharingSettings['default_audience'] | null>(null);
  const [routePrivacy, setRoutePrivacy] = useState<RoutePrivacySettings | null>(null);
  const [followRequests, setFollowRequests] = useState<ConnectionUser[]>([]);
  const [blockedAccounts, setBlockedAccounts] = useState<ConnectionUser[]>([]);
  const [blockConfirmation, setBlockConfirmation] = useState<ConnectionUser | null>(null);
  const [followers, setFollowers] = useState<ConnectionUser[]>([]);
  const [following, setFollowing] = useState<ConnectionUser[]>([]);
  const [privacyZones, setPrivacyZones] = useState<PrivacyZone[]>([]);
  const [privacyListLoading, setPrivacyListLoading] = useState(false);
  const [privacyListError, setPrivacyListError] = useState<string | null>(null);
  const [privacyActionIds, setPrivacyActionIds] = useState<Set<number>>(() => new Set());
  const [zoneFormVisible, setZoneFormVisible] = useState(false);
  const [radiusPickerVisible, setRadiusPickerVisible] = useState(false);
  const [radiusDraft, setRadiusDraft] = useState(DEFAULT_ZONE_RADIUS_M);
  const [zoneMapVisible, setZoneMapVisible] = useState(false);
  const [zoneMapRegion, setZoneMapRegion] = useState({
    latitude: 20.5937,
    longitude: 78.9629,
    latitudeDelta: 8,
    longitudeDelta: 8,
  });
  const [zoneMapHasLocation, setZoneMapHasLocation] = useState(false);
  const [zoneSearchText, setZoneSearchText] = useState('');
  const [zoneSearchLoading, setZoneSearchLoading] = useState(false);
  const [zoneSuggestions, setZoneSuggestions] = useState<ZonePlaceSuggestion[]>([]);
  const [zoneSuggestionsError, setZoneSuggestionsError] = useState<string | null>(null);
  const [zoneLocationLabel, setZoneLocationLabel] = useState('');
  const zonePlacesSessionToken = useRef(createPlacesSessionToken());
  const [zoneName, setZoneName] = useState('');
  const [zoneLatitude, setZoneLatitude] = useState('');
  const [zoneLongitude, setZoneLongitude] = useState('');
  const [zoneRadius, setZoneRadius] = useState(String(DEFAULT_ZONE_RADIUS_M));
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
    setSharingDialogError(null);
    setSharingDialogVisible(true);
  }, []);

  const handleAudienceSelect = useCallback(async (audience: SharingSettings['default_audience']) => {
    setPrivacySaving(true);
    setSharingDialogError(null);
    setSavingAudience(audience);
    try {
      const response = await socialAPI.setDefaultAudience(audience);
      setSharingSettings(response.data.data);
      setSharingDialogVisible(false);
    } catch (error) {
      setSharingDialogError(getBackendErrorMessage(error));
    } finally {
      setPrivacySaving(false);
      setSavingAudience(null);
    }
  }, []);

  const handleRoutePrivacyChange = useCallback(async (changes: Partial<Pick<RoutePrivacySettings, 'hide_map' | 'hide_radius_m'>>) => {
    setPrivacySaving(true);
    try {
      const response = await socialAPI.setRoutePrivacy(changes);
      setRoutePrivacy(response.data.data);
      return true;
    } catch (error) {
      Alert.alert('Unable to update route privacy', getBackendErrorMessage(error));
      return false;
    } finally {
      setPrivacySaving(false);
    }
  }, []);

  const handleRadiusChange = useCallback(() => {
    const currentRadius = routePrivacy?.hide_radius_m ?? routePrivacy?.effective_hide_radius_m ?? DEFAULT_ZONE_RADIUS_M;
    setRadiusDraft(currentRadius === 0 ? 0 : Math.min(MAX_ZONE_RADIUS_M, Math.max(MIN_ZONE_RADIUS_M, currentRadius)));
    setRadiusPickerVisible(true);
  }, [routePrivacy]);

  const saveRadiusDraft = useCallback(async () => {
    const saved = await handleRoutePrivacyChange({ hide_radius_m: radiusDraft });
    if (saved) {
      setZoneRadius(String(Math.max(MIN_ZONE_RADIUS_M, radiusDraft)));
      setRadiusPickerVisible(false);
    }
  }, [handleRoutePrivacyChange, radiusDraft]);

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

  const handleUnfollow = useCallback(async (userId: number) => {
    setPrivacyActionIds((current) => new Set(current).add(userId));
    try {
      await connectionsAPI.unfollow(userId);
      setFollowing((current) => current.filter((user) => user.id !== userId));
    } catch (error) {
      Alert.alert('Unable to unfollow account', getBackendErrorMessage(error));
    } finally {
      setPrivacyActionIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }, []);

  const handleBlockConnection = useCallback((account: ConnectionUser) => {
    setBlockConfirmation(account);
  }, []);

  const confirmBlockConnection = useCallback(async () => {
    if (!blockConfirmation) return;
    const account = blockConfirmation;
    setPrivacyActionIds((current) => new Set(current).add(account.id));
    try {
      await connectionsAPI.blockAccount(account.id);
      setFollowers((current) => current.filter((user) => user.id !== account.id));
      setFollowing((current) => current.filter((user) => user.id !== account.id));
      setFollowRequests((current) => current.filter((user) => user.id !== account.id));
      setBlockedAccounts((current) => current.some((user) => user.id === account.id) ? current : [account, ...current]);
      setBlockConfirmation(null);
    } catch (error) {
      Alert.alert('Unable to block account', getBackendErrorMessage(error));
    } finally {
      setPrivacyActionIds((current) => {
        const next = new Set(current);
        next.delete(account.id);
        return next;
      });
    }
  }, [blockConfirmation]);

  const openZoneMap = useCallback(async () => {
    zonePlacesSessionToken.current = createPlacesSessionToken();
    setZoneSearchText('');
    setZoneSuggestions([]);
    setZoneSuggestionsError(null);
    let latitude = zoneLatitude.trim() ? Number(zoneLatitude) : Number.NaN;
    let longitude = zoneLongitude.trim() ? Number(zoneLongitude) : Number.NaN;
    let hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    let showUserLocation = false;
    let locationLabel = hasLocation ? zoneLocationLabel || 'Selected location' : '';
    if (!hasLocation) {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.granted) {
          showUserLocation = true;
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = current.coords.latitude;
          longitude = current.coords.longitude;
          hasLocation = true;
          locationLabel = 'Current location';
          setZoneLatitude(latitude.toFixed(6));
          setZoneLongitude(longitude.toFixed(6));
        }
      } catch {
        // The map remains selectable without location permission.
      }
    }
    const centerLatitude = hasLocation ? latitude : 20.5937;
    const centerLongitude = hasLocation ? longitude : 78.9629;
    setZoneMapHasLocation(showUserLocation);
    setZoneLocationLabel(locationLabel);
    setZoneMapRegion({
      latitude: centerLatitude,
      longitude: centerLongitude,
      latitudeDelta: hasLocation ? 0.02 : 8,
      longitudeDelta: hasLocation ? 0.02 : 8,
    });
    setZoneRadius(String(Math.max(MIN_ZONE_RADIUS_M, routePrivacy?.hide_radius_m ?? routePrivacy?.effective_hide_radius_m ?? DEFAULT_ZONE_RADIUS_M)));
    setZoneMapVisible(true);
  }, [routePrivacy, zoneLatitude, zoneLocationLabel, zoneLongitude]);

  useEffect(() => {
    const input = zoneSearchText.trim();
    if (!zoneMapVisible || input.length < 2) {
      setZoneSuggestions([]);
      setZoneSuggestionsError(null);
      setZoneSearchLoading(false);
      return;
    }

    setZoneSearchLoading(true);
    let cancelled = false;
    let controller: AbortController | null = null;
    const timer = setTimeout(() => {
      controller = new AbortController();
      setZoneSuggestionsError(null);
      void fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': ENV.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
        },
        body: JSON.stringify({
          input,
          languageCode: 'en',
          sessionToken: zonePlacesSessionToken.current,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Places search returned ${response.status}.`);
          return response.json() as Promise<{
            suggestions?: Array<{
              placePrediction?: {
                placeId?: string;
                text?: { text?: string };
                structuredFormat?: {
                  mainText?: { text?: string };
                  secondaryText?: { text?: string };
                };
              };
            }>;
          }>;
        })
        .then((data) => {
          if (cancelled) return;
          const suggestions = (data.suggestions ?? []).flatMap(({ placePrediction }) => {
            if (!placePrediction?.placeId || !placePrediction.text?.text) return [];
            return [{
              placeId: placePrediction.placeId,
              text: placePrediction.text.text,
              mainText: placePrediction.structuredFormat?.mainText?.text || placePrediction.text.text,
              secondaryText: placePrediction.structuredFormat?.secondaryText?.text || '',
            }];
          });
          setZoneSuggestions(suggestions);
        })
        .catch((error: unknown) => {
          if (cancelled || (error instanceof Error && error.name === 'AbortError')) return;
          setZoneSuggestions([]);
          setZoneSuggestionsError('Suggestions are unavailable. Submit the search to find this place on the map.');
        })
        .finally(() => {
          if (!cancelled) setZoneSearchLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [zoneMapVisible, zoneSearchText]);

  const searchZoneLocation = useCallback(async () => {
    const query = zoneSearchText.trim();
    if (!query || zoneSearchLoading) return;
    setZoneSearchLoading(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access to search for places on the map.');
        return;
      }
      const locations = await Location.geocodeAsync(query);
      const result = locations[0];
      if (!result) {
        Alert.alert('Location not found', 'Try a nearby address, place name, or landmark.');
        return;
      }
      setZoneLatitude(result.latitude.toFixed(6));
      setZoneLongitude(result.longitude.toFixed(6));
      setZoneLocationLabel(query);
      setZoneName((current) => current.trim() ? current : query);
      setZoneSearchText('');
      setZoneSuggestionsError(null);
      zonePlacesSessionToken.current = createPlacesSessionToken();
      setZoneMapRegion({
        latitude: result.latitude,
        longitude: result.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      });
    } catch (error) {
      Alert.alert('Unable to search this location', getBackendErrorMessage(error, 'Try another place or tap directly on the map.'));
    } finally {
      setZoneSearchLoading(false);
    }
  }, [zoneSearchLoading, zoneSearchText]);

  const selectZoneSuggestion = useCallback(async (suggestion: ZonePlaceSuggestion) => {
    setZoneSearchLoading(true);
    setZoneSuggestions([]);
    try {
      let location: { latitude: number; longitude: number } | null = null;
      let resolvedLabel = suggestion.text;
      try {
        const detailsUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.placeId)}?sessionToken=${encodeURIComponent(zonePlacesSessionToken.current)}&languageCode=en`;
        const response = await fetch(detailsUrl, {
          headers: {
            'X-Goog-Api-Key': ENV.GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'location,formattedAddress,displayName',
          },
        });
        if (!response.ok) throw new Error(`Place details returned ${response.status}.`);
        const place = await response.json() as {
          location?: { latitude?: number; longitude?: number };
          formattedAddress?: string;
          displayName?: { text?: string };
        };
        const latitude = place.location?.latitude;
        const longitude = place.location?.longitude;
        if (typeof latitude === 'number' && Number.isFinite(latitude)
          && typeof longitude === 'number' && Number.isFinite(longitude)) {
          location = { latitude, longitude };
          resolvedLabel = place.formattedAddress || place.displayName?.text || suggestion.text;
        }
      } catch {
        // Fall back to the platform geocoder if Places Details is unavailable.
      }

      if (!location) {
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') throw new Error('Allow location access to resolve this place.');
        const locations = await Location.geocodeAsync(suggestion.text);
        const first = locations[0];
        if (!first) throw new Error('No map location was found for this suggestion.');
        location = { latitude: first.latitude, longitude: first.longitude };
      }

      setZoneLatitude(location.latitude.toFixed(6));
      setZoneLongitude(location.longitude.toFixed(6));
      setZoneLocationLabel(resolvedLabel);
      setZoneName((current) => current.trim() ? current : suggestion.mainText);
      setZoneSearchText('');
      setZoneSuggestionsError(null);
      setZoneMapRegion({ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 });
      zonePlacesSessionToken.current = createPlacesSessionToken();
    } catch (error) {
      Alert.alert('Unable to select this place', getBackendErrorMessage(error, 'Try another suggestion or pin the location on the map.'));
    } finally {
      setZoneSearchLoading(false);
    }
  }, []);

  const handleAddPrivacyZone = useCallback(async () => {
    const latitude = Number(zoneLatitude);
    const longitude = Number(zoneLongitude);
    const radius_m = Number(zoneRadius);
    if (!zoneLatitude.trim() || !zoneLongitude.trim()
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isInteger(radius_m) || radius_m < MIN_ZONE_RADIUS_M || radius_m > MAX_ZONE_RADIUS_M) {
      Alert.alert('Check zone details', `Choose a map location and a radius from ${MIN_ZONE_RADIUS_M} to ${MAX_ZONE_RADIUS_M.toLocaleString()} metres.`);
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
      setZoneLocationLabel('');
      setZoneSearchText('');
      setZoneRadius(String(Math.max(MIN_ZONE_RADIUS_M, routePrivacy?.hide_radius_m ?? routePrivacy?.effective_hide_radius_m ?? DEFAULT_ZONE_RADIUS_M)));
      setZoneFormVisible(false);
    } catch (error) {
      Alert.alert('Unable to add privacy zone', getBackendErrorMessage(error));
    } finally {
      setZoneSaving(false);
    }
  }, [routePrivacy, zoneLatitude, zoneLongitude, zoneName, zoneRadius]);

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

  const selectedZoneLatitude = zoneLatitude.trim() ? Number(zoneLatitude) : null;
  const selectedZoneLongitude = zoneLongitude.trim() ? Number(zoneLongitude) : null;
  const hasSelectedZone = selectedZoneLatitude !== null
    && selectedZoneLongitude !== null
    && Number.isFinite(selectedZoneLatitude)
    && Number.isFinite(selectedZoneLongitude)
    && selectedZoneLatitude >= -90
    && selectedZoneLatitude <= 90
    && selectedZoneLongitude >= -180
    && selectedZoneLongitude <= 180;

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
                      summary: routePrivacy?.hide_radius_m === 0
                        ? 'Off'
                        : routePrivacy?.hide_radius_m == null
                          ? `${routePrivacy?.effective_hide_radius_m ?? DEFAULT_ZONE_RADIUS_M} m (default)`
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
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>Loading follow requests...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : followRequests.length ? followRequests.map((account) => renderConnectionRow(
                    account,
                    { label: 'Accept', onPress: () => void handleFollowRequest(account.id, true), disabled: privacyActionIds.has(account.id) },
                    { label: 'Decline', onPress: () => void handleFollowRequest(account.id, false), disabled: privacyActionIds.has(account.id) },
                  )) : (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>You have no pending follow requests.</Text>
                  )}
                </View>
              </>
            ) : page === 'blocked' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>BLOCKED ACCOUNTS</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {privacyListLoading ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>Loading blocked accounts...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : blockedAccounts.length ? blockedAccounts.map((account) => renderConnectionRow(
                    account,
                    { label: privacyActionIds.has(account.id) ? '...' : 'Unblock', onPress: () => void handleUnblock(account.id), disabled: privacyActionIds.has(account.id) },
                  )) : (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>You have no blocked accounts.</Text>
                  )}
                </View>
              </>
            ) : page === 'followers' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>MY FOLLOWERS</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderPrivacyListRefresh('followers')}
                  {privacyListLoading ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>Loading followers...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : followers.length ? followers.map((account) => renderConnectionRow(
                    account,
                    { label: privacyActionIds.has(account.id) ? '...' : 'Block', onPress: () => handleBlockConnection(account), disabled: privacyActionIds.has(account.id) },
                  )) : (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>You do not have any followers yet.</Text>
                  )}
                </View>
              </>
            ) : page === 'following' ? (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>FOLLOWING</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {renderPrivacyListRefresh('following')}
                  {privacyListLoading ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>Loading following...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : following.length ? following.map((account) => renderConnectionRow(
                    account,
                    { label: privacyActionIds.has(account.id) ? '...' : 'Unfollow', onPress: () => void handleUnfollow(account.id), disabled: privacyActionIds.has(account.id) },
                  )) : (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>You are not following any runners yet.</Text>
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.androidSectionTitle, { color: colors.textTertiary }]}>HIDE ROUTE DETAILS AROUND A LOCATION</Text>
                <View style={[styles.optionGroup, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4', borderColor: 'transparent' }]}>
                  {privacyListLoading ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>Loading privacy zones...</Text>
                  ) : privacyListError ? (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>{privacyListError}</Text>
                  ) : privacyZones.length ? privacyZones.map((zone) => (
                    <View key={zone.id} style={[styles.privacyZoneRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.zoneListIcon, { backgroundColor: isDark ? colors.surfaceRaised : '#E8F7EE' }]}>
                        <Feather name="map-pin" size={17} color={colors.primary} />
                      </View>
                      <View style={styles.zoneListCopy}>
                        <Text style={[styles.zoneListName, { color: colors.text }]} numberOfLines={1}>{zone.name || 'Privacy zone'}</Text>
                        <Text style={[styles.zoneListCoordinates, { color: colors.textSecondary }]} numberOfLines={1}>
                          {zone.latitude.toFixed(5)}, {zone.longitude.toFixed(5)}
                        </Text>
                      </View>
                      <View style={styles.zoneListActions}>
                        <View style={[styles.zoneRadiusBadge, { backgroundColor: isDark ? colors.surfaceRaised : '#E8F7EE' }]}>
                          <Text style={[styles.zoneRadiusBadgeText, { color: colors.primary }]}>{zone.radius_m} m</Text>
                        </View>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${zone.name || 'privacy zone'}`}
                          disabled={privacyActionIds.has(zone.id)}
                          onPress={() => handleDeletePrivacyZone(zone.id)}
                          style={styles.zoneDeleteButton}
                        >
                          <Feather name="trash-2" size={17} color={colors.textTertiary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )) : (
                    <Text style={[styles.privacyListMessage, { color: colors.textSecondary }]}>No privacy zones added.</Text>
                  )}
                </View>
                {zoneFormVisible ? (
                  <View style={[styles.zoneForm, { backgroundColor: isDark ? colors.surfaceRaised : '#F3F4F4' }]}>
                    <View style={styles.zoneFormHeading}>
                      <View style={[styles.zoneListIcon, { backgroundColor: isDark ? colors.surfaceRaised : '#E8F7EE' }]}>
                        <Feather name="shield" size={17} color={colors.primary} />
                      </View>
                      <View style={styles.zoneFormHeadingCopy}>
                        <Text style={[styles.zoneListName, { color: colors.text }]}>New privacy zone</Text>
                        <Text style={[styles.zoneListCoordinates, { color: colors.textSecondary }]}>Choose a place and set its hide radius</Text>
                      </View>
                    </View>
                    <TextInput value={zoneName} onChangeText={setZoneName} placeholder="Name (optional)" placeholderTextColor={colors.textTertiary} style={[styles.zoneInput, { color: colors.text, borderColor: colors.border }]} />
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => void openZoneMap()}
                      style={[styles.zoneMapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <Feather name="map-pin" size={18} color={colors.primary} />
                      <View style={styles.androidThemeCopy}>
                        <Text style={[styles.androidOptionLabel, { color: colors.text }]}>Choose location on map</Text>
                        <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]} numberOfLines={1}>
                          {zoneLocationLabel || (zoneLatitude && zoneLongitude
                            ? `${Number(zoneLatitude).toFixed(5)}, ${Number(zoneLongitude).toFixed(5)}`
                            : 'Tap the map to place your privacy zone')}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                    <View style={styles.zoneRadiusBlock}>
                      <View style={styles.zoneRadiusHeading}>
                        <Text style={[styles.androidOptionLabel, { color: colors.text }]}>Zone radius</Text>
                        <Text style={[styles.zoneRadiusValue, { color: colors.primary }]}>{Number(zoneRadius).toLocaleString()} m</Text>
                      </View>
                      <CustomSlider
                        value={Number(zoneRadius) || DEFAULT_ZONE_RADIUS_M}
                        minimumValue={MIN_ZONE_RADIUS_M}
                        maximumValue={MAX_ZONE_RADIUS_M}
                        onValueChange={(value) => setZoneRadius(String(value))}
                        step={ZONE_RADIUS_STEP_M}
                        minimumTrackTintColor={colors.primary}
                        maximumTrackTintColor={colors.border}
                        thumbTintColor={colors.primary}
                      />
                      <View style={styles.sliderLabels}>
                        <Text style={[styles.androidOptionHint, { color: colors.textTertiary }]}>{MIN_ZONE_RADIUS_M} m</Text>
                        <Text style={[styles.androidOptionHint, { color: colors.textTertiary }]}>{MAX_ZONE_RADIUS_M.toLocaleString()} m</Text>
                      </View>
                    </View>
                    <View style={styles.zoneFormActions}>
                      <TouchableOpacity onPress={() => setZoneFormVisible(false)} disabled={zoneSaving} style={styles.zoneCancelButton}>
                        <Text style={[styles.privacyActionText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => void handleAddPrivacyZone()} disabled={zoneSaving || !hasSelectedZone} style={[styles.privacyActionButton, { backgroundColor: colors.primary, opacity: zoneSaving || !hasSelectedZone ? 0.55 : 1 }]}>
                        <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>{zoneSaving ? 'Saving...' : 'Add zone'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      setZoneRadius(String(Math.max(MIN_ZONE_RADIUS_M, routePrivacy?.hide_radius_m ?? routePrivacy?.effective_hide_radius_m ?? DEFAULT_ZONE_RADIUS_M)));
                      setZoneFormVisible(true);
                    }}
                    style={[styles.addZoneButton, { backgroundColor: colors.primary }]}
                  >
                    <Feather name="plus" size={18} color={colors.primaryText} />
                    <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>Add privacy zone</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.androidSettingsNote, { color: colors.textTertiary }]}>
                  Choose a point on the map and set its radius to hide route details near your home or another location.
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

        <Modal
          visible={sharingDialogVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSharingDialogVisible(false)}
        >
          <View style={styles.dialogBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !privacySaving && setSharingDialogVisible(false)} />
            <View style={[styles.sharingDialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.radiusDialogHeader}>
                <View style={styles.radiusTitleRow}>
                  <Feather name="eye" size={18} color={colors.primary} />
                  <Text style={[styles.radiusDialogTitle, { color: colors.text }]}>Who can see your workouts?</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close sharing settings" disabled={privacySaving} onPress={() => setSharingDialogVisible(false)} style={styles.zoneDeleteButton}>
                  <Feather name="x" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.radiusDialogCopy, { color: colors.textSecondary }]}>This applies to new workouts. You can adjust sharing for a workout later.</Text>
              {([
                { value: null, label: 'Only me', description: 'Private feed posts are not supported by this backend yet.', icon: 'lock' },
                { value: 'FOLLOWERS', label: 'Followers', description: 'Show posts to your followers.', icon: 'users' },
                { value: 'ALL', label: 'Everyone', description: 'Show posts to everyone in Connections.', icon: 'globe' },
                { value: 'NONE', label: "Don't share", description: 'Save workouts without creating a feed post.', icon: 'eye-off' },
              ] as const).map((option) => {
                const selected = sharingSettings?.default_audience === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole={option.value ? 'radio' : undefined}
                    accessibilityState={option.value ? { checked: selected, disabled: privacySaving } : { disabled: true }}
                    disabled={privacySaving || option.value === null}
                    onPress={() => { if (option.value) void handleAudienceSelect(option.value); }}
                    style={[styles.sharingOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? (isDark ? 'rgba(16,185,129,0.12)' : '#E8F7EE') : 'transparent', opacity: option.value ? 1 : 0.62 }]}
                  >
                    <View style={[styles.sharingOptionIcon, { backgroundColor: isDark ? colors.surfaceRaised : '#E8F7EE' }]}>
                      <Feather name={option.icon} size={16} color={colors.primary} />
                    </View>
                    <View style={styles.sharingOptionCopy}>
                      <Text style={[styles.sharingOptionTitle, { color: colors.text }]}>{option.label}</Text>
                      <Text style={[styles.sharingOptionDescription, { color: colors.textSecondary }]}>{option.description}</Text>
                    </View>
                    {option.value && savingAudience === option.value ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name={selected ? 'check-circle' : option.value ? 'circle' : 'minus-circle'} size={18} color={selected ? colors.primary : colors.textTertiary} />}
                  </TouchableOpacity>
                );
              })}
              {sharingDialogError ? <Text style={[styles.sharingDialogError, { color: '#D9424A' }]}>{sharingDialogError}</Text> : null}
            </View>
          </View>
        </Modal>

        <Modal
          visible={blockConfirmation !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setBlockConfirmation(null)}
        >
          <View style={styles.dialogBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setBlockConfirmation(null)} />
            <View style={[styles.radiusDialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.radiusDialogHeader}>
                <View style={styles.radiusTitleRow}>
                  <Feather name="user-x" size={18} color="#E5484D" />
                  <Text style={[styles.radiusDialogTitle, { color: colors.text }]}>Block account?</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close block confirmation" onPress={() => setBlockConfirmation(null)} style={styles.zoneDeleteButton}>
                  <Feather name="x" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.radiusDialogCopy, { color: colors.textSecondary }]}>
                You and {blockConfirmation?.full_name || blockConfirmation?.username} will no longer see each other in Connections.
              </Text>
              <View style={styles.radiusDialogActions}>
                <TouchableOpacity onPress={() => setBlockConfirmation(null)} disabled={privacyActionIds.has(blockConfirmation?.id ?? -1)} style={[styles.radiusOffButton, { borderColor: colors.border }]}>
                  <Text style={[styles.privacyActionText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={!blockConfirmation || privacyActionIds.has(blockConfirmation.id)} onPress={() => void confirmBlockConnection()} style={[styles.radiusSaveButton, { backgroundColor: '#E5484D', opacity: blockConfirmation && privacyActionIds.has(blockConfirmation.id) ? 0.6 : 1 }]}>
                  {blockConfirmation && privacyActionIds.has(blockConfirmation.id)
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={[styles.privacyActionText, { color: '#FFFFFF' }]}>Block</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={radiusPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRadiusPickerVisible(false)}
        >
          <View style={styles.dialogBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setRadiusPickerVisible(false)} />
            <View style={[styles.radiusDialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.radiusDialogHeader}>
                <View style={styles.radiusTitleRow}>
                  <Feather name="map-pin" size={18} color={colors.primary} />
                  <Text style={[styles.radiusDialogTitle, { color: colors.text }]}>Hide start & finish</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close radius selector" onPress={() => setRadiusPickerVisible(false)} style={styles.zoneDeleteButton}>
                  <Feather name="x" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.radiusDialogCopy, { color: colors.textSecondary }]}>Current: {radiusDraft === 0 ? 'Off' : `${radiusDraft.toLocaleString()} m`}. Scroll to choose a radius.</Text>
              <ScrollView style={styles.radiusOptionsList} nestedScrollEnabled showsVerticalScrollIndicator>
                {HIDE_RADIUS_OPTIONS.map((radius) => {
                  const selected = radiusDraft === radius;
                  return (
                    <TouchableOpacity
                      key={radius}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={radius === 0 ? 'Hide radius off' : `${radius} metres`}
                      onPress={() => setRadiusDraft(radius)}
                      style={[styles.radiusOptionRow, { borderBottomColor: colors.border, backgroundColor: selected ? (isDark ? colors.surfaceRaised : '#E8F7EE') : 'transparent' }]}
                    >
                      <Text style={[styles.radiusOptionText, { color: selected ? colors.primary : colors.text }]}>{radius === 0 ? 'Off' : `${radius.toLocaleString()} m`}{radius === DEFAULT_ZONE_RADIUS_M ? '  (Default)' : ''}</Text>
                      {selected ? <Feather name="check-circle" size={18} color={colors.primary} /> : <View style={styles.radiusOptionSpacer} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.radiusDialogActions}>
                <TouchableOpacity onPress={() => setRadiusPickerVisible(false)} style={[styles.radiusOffButton, { borderColor: colors.border }]}>
                  <Text style={[styles.privacyActionText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={privacySaving} onPress={() => void saveRadiusDraft()} style={[styles.radiusSaveButton, { backgroundColor: colors.primary, opacity: privacySaving ? 0.6 : 1 }]}>
                  <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>{privacySaving ? 'Saving...' : 'Save radius'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={zoneMapVisible}
          animationType="slide"
          onRequestClose={() => setZoneMapVisible(false)}
          statusBarTranslucent
        >
          <View style={[styles.zoneMapScreen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={[styles.zoneMapHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close map picker" onPress={() => setZoneMapVisible(false)} style={styles.androidHeaderButton}>
                <Feather name="chevron-left" size={25} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.zoneMapHeaderCopy}>
                <Text style={[styles.zoneMapTitle, { color: colors.text }]}>Choose privacy zone</Text>
                <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]}>Search for a place or tap the map to set its center</Text>
              </View>
            </View>
            <View style={[styles.zoneMapSearch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="search" size={18} color={colors.textTertiary} />
              <TextInput
                value={zoneSearchText}
                onChangeText={setZoneSearchText}
                onSubmitEditing={() => void (zoneSuggestions[0]
                  ? selectZoneSuggestion(zoneSuggestions[0])
                  : searchZoneLocation())}
                placeholder="Search address, place, or landmark"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.zoneMapSearchInput, { color: colors.text }]}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Search map location"
                disabled={!zoneSearchText.trim() || zoneSearchLoading}
                onPress={() => void (zoneSuggestions[0]
                  ? selectZoneSuggestion(zoneSuggestions[0])
                  : searchZoneLocation())}
                style={[styles.zoneMapSearchButton, { backgroundColor: colors.primary, opacity: !zoneSearchText.trim() || zoneSearchLoading ? 0.55 : 1 }]}
              >
                {zoneSearchLoading
                  ? <ActivityIndicator size="small" color={colors.primaryText} />
                  : <Feather name="arrow-right" size={18} color={colors.primaryText} />}
              </TouchableOpacity>
            </View>
            {zoneSuggestions.length > 0 ? (
              <ScrollView style={[styles.zoneSuggestionList, { backgroundColor: colors.surface, borderColor: colors.border }]} keyboardShouldPersistTaps="handled">
                {zoneSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.placeId}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${suggestion.text}`}
                    onPress={() => void selectZoneSuggestion(suggestion)}
                    style={[styles.zoneSuggestionRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.zoneSuggestionIcon, { backgroundColor: isDark ? colors.surfaceRaised : '#E8F7EE' }]}>
                      <Feather name="map-pin" size={15} color={colors.primary} />
                    </View>
                    <View style={styles.zoneSuggestionCopy}>
                      <Text style={[styles.zoneSuggestionMain, { color: colors.text }]} numberOfLines={1}>{suggestion.mainText}</Text>
                      {suggestion.secondaryText ? (
                        <Text style={[styles.zoneSuggestionSecondary, { color: colors.textSecondary }]} numberOfLines={1}>{suggestion.secondaryText}</Text>
                      ) : null}
                    </View>
                    <Feather name="arrow-up-left" size={15} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : zoneSuggestionsError ? (
              <Text style={[styles.zoneSearchMessage, { color: colors.textSecondary }]}>{zoneSuggestionsError}</Text>
            ) : zoneSearchText.trim().length >= 2 && !zoneSearchLoading ? (
              <Text style={[styles.zoneSearchMessage, { color: colors.textSecondary }]}>No place suggestions. Submit to search this address.</Text>
            ) : null}
            <MapView
              key={`${zoneMapRegion.latitude.toFixed(5)}:${zoneMapRegion.longitude.toFixed(5)}`}
              provider={PROVIDER_GOOGLE}
              style={styles.zoneMap}
              initialRegion={zoneMapRegion}
              showsUserLocation={zoneMapHasLocation}
              showsMyLocationButton={zoneMapHasLocation}
              onPress={(event) => {
                const { latitude, longitude } = event.nativeEvent.coordinate;
                setZoneLatitude(latitude.toFixed(6));
                setZoneLongitude(longitude.toFixed(6));
                setZoneLocationLabel('Pinned map location');
              }}
            >
              {hasSelectedZone ? (
                <>
                  <Circle
                    center={{ latitude: selectedZoneLatitude as number, longitude: selectedZoneLongitude as number }}
                    radius={Number(zoneRadius) || DEFAULT_ZONE_RADIUS_M}
                    fillColor={isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.14)'}
                    strokeColor={colors.primary}
                    strokeWidth={2}
                  />
                  <Marker
                    coordinate={{ latitude: selectedZoneLatitude as number, longitude: selectedZoneLongitude as number }}
                    title={zoneName.trim() || 'Privacy zone'}
                    draggable
                    onDragEnd={(event) => {
                      const { latitude, longitude } = event.nativeEvent.coordinate;
                      setZoneLatitude(latitude.toFixed(6));
                      setZoneLongitude(longitude.toFixed(6));
                      setZoneLocationLabel('Pinned map location');
                    }}
                  />
                </>
              ) : null}
            </MapView>
            <View style={[styles.zoneMapFooter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.zoneMapFooterCopy}>
                <Text style={[styles.androidOptionLabel, { color: colors.text }]}>{zoneName.trim() || 'Privacy zone'}</Text>
                <Text style={[styles.androidOptionHint, { color: colors.textSecondary }]} numberOfLines={2}>
                  {hasSelectedZone
                    ? `${zoneLocationLabel ? `${zoneLocationLabel} | ` : ''}${selectedZoneLatitude?.toFixed(5)}, ${selectedZoneLongitude?.toFixed(5)} | ${Number(zoneRadius).toLocaleString()} m radius`
                    : 'Choose a point on the map to set the center'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!hasSelectedZone}
                onPress={() => setZoneMapVisible(false)}
                style={[styles.zoneMapConfirm, { backgroundColor: colors.primary, opacity: hasSelectedZone ? 1 : 0.5 }]}
              >
                <Text style={[styles.privacyActionText, { color: colors.primaryText }]}>Use location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  privacyListMessage: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, lineHeight: 18, includeFontPadding: false },
  privacyLoading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  privacyUserRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  privacyActionButton: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 16 },
  privacyActionText: { fontSize: 11, fontWeight: '700' },
  privacyRefreshRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  privacyRefreshText: { fontSize: 12, fontWeight: '600' },
  privacyZoneRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  zoneListIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  zoneListCopy: { flex: 1, minWidth: 0, gap: 3 },
  zoneListName: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  zoneListCoordinates: { fontSize: 11, lineHeight: 15 },
  zoneListActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneRadiusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  zoneRadiusBadgeText: { fontSize: 11, fontWeight: '700' },
  zoneDeleteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  zoneForm: { borderRadius: 16, padding: 14, marginTop: 12, gap: 9 },
  zoneFormHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 3 },
  zoneFormHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
  zoneInput: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 10, fontSize: 14 },
  zoneMapButton: { minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoneRadiusBlock: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(128, 128, 128, 0.08)' },
  zoneRadiusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoneRadiusValue: { fontSize: 14, fontWeight: '700' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  zoneFormActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 },
  zoneCancelButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12 },
  addZoneButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 21, marginTop: 14, paddingHorizontal: 16 },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.52)', justifyContent: 'center', padding: 20 },
  radiusDialog: { width: '100%', maxWidth: 340, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16 },
  sharingDialog: { width: '100%', maxWidth: 380, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 8 },
  sharingOption: { minHeight: 62, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sharingOptionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sharingOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  sharingOptionTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  sharingOptionDescription: { fontSize: 10, lineHeight: 14 },
  sharingDialogError: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  radiusDialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  radiusTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  radiusDialogTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  radiusDialogCopy: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  radiusOptionsList: { maxHeight: 160, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.18)' },
  radiusOptionRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 8 },
  radiusOptionText: { fontSize: 13, fontWeight: '600' },
  radiusOptionSpacer: { width: 18, height: 18 },
  radiusDialogActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 },
  radiusOffButton: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 21, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  radiusSaveButton: { flex: 1, minHeight: 38, borderRadius: 19, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  zoneMapScreen: { flex: 1 },
  zoneMapHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  zoneMapHeaderCopy: { flex: 1, minWidth: 0 },
  zoneMapTitle: { fontSize: 17, fontWeight: '700' },
  zoneMapSearch: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginHorizontal: 12, marginVertical: 10, paddingLeft: 12, paddingRight: 5 },
  zoneMapSearchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 14 },
  zoneMapSearchButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  zoneSuggestionList: { maxHeight: 204, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden', marginHorizontal: 12, marginTop: -4, marginBottom: 8, elevation: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  zoneSuggestionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  zoneSuggestionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  zoneSuggestionCopy: { flex: 1, minWidth: 0, gap: 2 },
  zoneSuggestionMain: { fontSize: 13, fontWeight: '600' },
  zoneSuggestionSecondary: { fontSize: 11 },
  zoneSearchMessage: { fontSize: 12, marginHorizontal: 16, marginTop: -2, marginBottom: 8 },
  zoneMap: { flex: 1 },
  zoneMapFooter: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, margin: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoneMapFooterCopy: { flex: 1, minWidth: 0 },
  zoneMapConfirm: { minHeight: 40, paddingHorizontal: 15, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
