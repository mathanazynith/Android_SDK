import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useActiveRun } from '../../contexts/ActiveRunContext';
import { calculateActiveRunElapsedSeconds } from '../../src/utils/activeRunMetrics';

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
  onNavigateToRun?: () => void;
}) {
  const session = useActiveRun();
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!session?.active) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [session?.active]);

  if (!session?.active) return null;

  const isPaused = Boolean(session.paused);
  const elapsed = calculateActiveRunElapsedSeconds(session, now || session.updatedAt || 0);
  const isOnMap = pathname.endsWith('/screens/map');

  if (isOnMap) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isPaused ? 'Run paused' : 'Run recording'}, ${(session.distanceKm ?? 0).toFixed(2)} kilometers, ${formatElapsed(elapsed)}. Return to run.`}
      onPress={() => {
        if (onNavigateToRun) {
          onNavigateToRun();
          return;
        }
        router.navigate({
          pathname: '/(app)/screens/map',
          params: session.runId ? { runId: session.runId } : undefined,
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
        {isPaused ? 'RUN PAUSED' : 'LIVE RUN'}  ·  {(session.distanceKm ?? 0).toFixed(2)} km  ·  {formatElapsed(elapsed)}
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
