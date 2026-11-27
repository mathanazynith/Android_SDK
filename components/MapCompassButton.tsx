import { useTheme } from '../contexts/ThemeContext';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

interface MapCompassButtonProps {
  heading: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function MapCompassButton({ heading, onPress, style }: MapCompassButtonProps) {
  const { colors, isDark } = useTheme();
  const normalizedHeading = ((heading % 360) + 360) % 360;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: isDark ? 'rgba(24, 26, 28, 0.92)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: colors.border,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Reset map orientation to north"
      accessibilityHint="Rotates the map so north is at the top"
      accessibilityValue={{ text: `${Math.round(normalizedHeading)} degrees from north` }}
    >
      <View style={[styles.dial, { transform: [{ rotate: `${-normalizedHeading}deg` }] }]}>
        <Text style={[styles.cardinal, styles.north, { color: '#EF4444' }]}>N</Text>
        <Text style={[styles.cardinal, styles.east, { color: colors.textSecondary }]}>E</Text>
        <Text style={[styles.cardinal, styles.south, { color: colors.textSecondary }]}>S</Text>
        <Text style={[styles.cardinal, styles.west, { color: colors.textSecondary }]}>W</Text>
        <View style={styles.needleNorth} />
        <View style={[styles.needleSouth, { borderTopColor: colors.textSecondary }]} />
        <View style={[styles.pivot, { backgroundColor: colors.text }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  dial: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardinal: {
    position: 'absolute',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
  },
  north: { top: 1 },
  east: { right: 2 },
  south: { bottom: 1 },
  west: { left: 2 },
  needleNorth: {
    position: 'absolute',
    top: 10,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#EF4444',
  },
  needleSouth: {
    position: 'absolute',
    top: 20,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pivot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    top: 17,
  },
});
