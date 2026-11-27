import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import { useActiveRun } from '../../contexts/ActiveRunContext';
import type { BackgroundLocationSessionState } from '../../src/services/backgroundLocationTask';
import { calculateActiveRunElapsedSeconds } from '../../src/utils/activeRunMetrics';
import { formatDistanceFromMeters } from '../../src/utils/activityUnitFormatters';

const formatElapsed = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

export default function ActiveRunBanner({
  bottomOffset,
  onNavigateToRun,
}: {
  bottomOffset: number;
  onNavigateToRun?: (session: BackgroundLocationSessionState) => void;
}) {
  const session = useActiveRun();
  const { user } = useAuth();
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const [now, setNow] = useState(0);
  // The provider hydrates and validates the persisted run. Do not keep a local
  // active copy here: it can outlive a discard/finish event and leave a stale
  // banner mounted on unrelated screens.
  const activeSession = session?.active ? session : null;

  useEffect(() => {
    if (!activeSession?.active) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [activeSession?.active]);

  if (!activeSession?.active) return null;

  const isPaused = Boolean(activeSession.paused);
  const elapsed = calculateActiveRunElapsedSeconds(activeSession, now || activeSession.updatedAt || 0);
  const distance = formatDistanceFromMeters(
    (activeSession.distanceKm ?? 0) * 1000,
    user?.profile?.distance_unit,
  );
  const isOnMap = pathname.endsWith('/screens/map');

  if (isOnMap) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isPaused ? 'Run paused' : 'Run recording'}, ${distance}, ${formatElapsed(elapsed)}. Return to run.`}
      onPress={() => {
        if (onNavigateToRun) {
          onNavigateToRun(activeSession);
          return;
        }
        router.navigate({
          pathname: '/(app)/screens/map',
          params: {
            resumeRun: '1',
            ...(activeSession.runId ? { runId: activeSession.runId } : {}),
          },
        });
      }}
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          backgroundColor: isDark ? '#17231B' : '#F0FDF4',
          borderColor: isDark ? '#28633B' : '#86EFAC',
        },
      ]}
    >
      <View style={[styles.statusDot, { backgroundColor: BRAND_GREEN }]} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.statusText, { color: colors.textPrimary }]}>
        {isPaused ? 'RUN PAUSED' : 'LIVE RUN'}  ·  {distance}  ·  {formatElapsed(elapsed)}
      </Text>
      <Feather name="arrow-up-right" size={17} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    zIndex: 8,
    elevation: 8,
    shadowColor: BRAND_GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
});
