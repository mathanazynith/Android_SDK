import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface AuthSocialButtonsProps {
  onGooglePress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function AuthSocialButtons({
  onGooglePress,
  loading = false,
  disabled = false,
}: AuthSocialButtonsProps) {
  const { colors } = useTheme();
  const buttonStyle = [
    styles.button,
    { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  ];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        style={buttonStyle}
        onPress={onGooglePress}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={[styles.googleGlyph, { color: colors.text }]}>G</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 8,
  },
  button: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  googleGlyph: {
    fontSize: 20,
    fontWeight: '700',
  },
});
