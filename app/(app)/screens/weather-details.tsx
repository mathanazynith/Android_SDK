import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';

export default function WeatherDetailsScreen() {
  const { colors } = useTheme();
  return <View style={[styles.container, { backgroundColor: colors.background }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E0F',
  },
});
